const prisma = require('../db/prisma');
const {
  USER_TEAM_ID,
  TRADE_DEADLINE_DAY,
  PLAYOFF_TEAMS_PER_DIVISION,
  RIVALRY_BADGE_THRESHOLD,
  PRESS_SERIES_INTERVAL,
  PRESS_SKIP_AUDIENCE_PENALTY,
  PRESS_SKIP_SATISFACTION_PENALTY,
  PRESS_AUDIENCE_MIN,
  PRESS_AUDIENCE_MAX,
  PRESS_AUDIENCE_BASE,
  PRESS_SATISFACTION_MIN,
  PRESS_SATISFACTION_MAX,
  PRESS_SATISFACTION_BASE,
  PRESS_AUDIENCE_BONUS_MAX_PCT,
  PRESS_SATISFACTION_SEASON_DECAY,
  PRESS_AI_ENABLED,
} = require('../config');
const { isEnabled: aiEnabled } = require('./aiService');
const { enrichQuestions, aiHeadline } = require('./pressAi');
const { createNews } = require('./newsService');
const { computeTrailingStreak } = require('./newsDetection');
const { getRivalryIntensity, adjustRivalryIntensity } = require('./rivalryService');
const { getTeamBroadcasts } = require('./broadcastService');
const {
  pickQuestions,
  computeEffects,
  reporterName,
  pressHeadline,
  skippedHeadline,
} = require('./pressTemplates');

// ---------------------------------------------------------------------------------------------
// Ruedas de prensa del usuario (plantillas; la IA solo reescribe el texto, ver pressAi.js):
//  - Temporada regular: una cada PRESS_SERIES_INTERVAL series, al terminar el ultimo partido.
//  - Playoffs: al cerrar cada serie del usuario (cuartos en adelante) y al terminar la liguilla.
//  - La organiza una cadena con contrato vigente (alternando TV/radio). Las respuestas mueven la
//    audiencia de temporada (bono de las cadenas al final), la satisfaccion de la cadena anfitriona
//    (ofertas de renovacion) y la rivalidad con el oponente.
//  - Opcionales: si queda pendiente al jugar el siguiente partido o al cerrar la temporada, se da
//    por omitida y resta audiencia.
// ---------------------------------------------------------------------------------------------

const FEAT_TYPES = ['no_hitter', 'cycle', 'multi_hr'];
const FEAT_LOOKBACK_DAYS = 9;
const DEADLINE_WARNING_DAYS = 10;
const ROUND_LABELS = { 1: 'cuartos de final', 2: 'semifinales', 3: 'la final' };

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

const opponentOf = (g) => (g.home_team_id === USER_TEAM_ID ? g.away_team_id : g.home_team_id);
const userWon = (g) => (g.home_team_id === USER_TEAM_ID ? g.home_score > g.away_score : g.away_score > g.home_score);

// Agrupa los partidos de temporada regular del usuario (orden por dia) en series: bloques
// consecutivos contra el mismo rival en el mismo estadio.
function groupIntoSeries(gamesAsc) {
  const series = [];
  for (const g of gamesAsc) {
    const key = `${opponentOf(g)}:${g.home_team_id}`;
    const last = series[series.length - 1];
    if (last && last.key === key) last.games.push(g);
    else series.push({ key, opponentId: opponentOf(g), games: [g] });
  }
  return series;
}

// ¿El partido gameId cierra una serie? Devuelve { closes, seriesNumber, wins, losses, opponentId }
// donde seriesNumber es el ordinal (1-based) de esa serie en la temporada.
function seriesProgress(gamesAsc, gameId) {
  const series = groupIntoSeries(gamesAsc);
  const index = series.findIndex((s) => s.games.some((g) => g.id === gameId));
  if (index === -1) return { closes: false, seriesNumber: 0, wins: 0, losses: 0, opponentId: null };
  const s = series[index];
  const closes = s.games[s.games.length - 1].id === gameId && s.games.every((g) => g.status === 'finished');
  const finished = s.games.filter((g) => g.status === 'finished');
  const wins = finished.filter(userWon).length;
  return { closes, seriesNumber: index + 1, wins, losses: finished.length - wins, opponentId: s.opponentId };
}

// Series completas (todos sus partidos terminados) y cuantas faltan para la proxima rueda.
function seriesUntilNextConference(gamesAsc) {
  const completed = groupIntoSeries(gamesAsc).filter((s) => s.games.every((g) => g.status === 'finished')).length;
  return { completed, untilNext: PRESS_SERIES_INTERVAL - (completed % PRESS_SERIES_INTERVAL) };
}

// Bono de fin de temporada de un contrato segun la audiencia.
function audienceBonus(annualPayment, audience) {
  const share = Math.max(0, (audience - PRESS_AUDIENCE_BASE) / (PRESS_AUDIENCE_MAX - PRESS_AUDIENCE_BASE));
  return Math.round(Number(annualPayment ?? 0) * PRESS_AUDIENCE_BONUS_MAX_PCT * share);
}

async function userRegularGames(seasonId) {
  return prisma.gameSchedule.findMany({
    where: { season_id: seasonId, is_user_game: true, playoff_series_id: null },
    orderBy: [{ day_number: 'asc' }, { id: 'asc' }],
  });
}

// Cadena anfitriona: alterna el tipo (TV/radio) respecto a la rueda anterior de la temporada.
async function pickHost(seasonId) {
  const companies = (await getTeamBroadcasts([USER_TEAM_ID]))[USER_TEAM_ID] ?? [];
  if (companies.length === 0) return null;
  const previous = await prisma.pressConference.findFirst({
    where: { season_id: seasonId, host_company_id: { not: null } },
    orderBy: { id: 'desc' },
  });
  const previousType = companies.find((c) => c.id === previous?.host_company_id)?.type
    ?? (previous ? null : 'RADIO'); // la primera la abre la TV
  return companies.find((c) => c.type !== previousType) ?? companies[0];
}

async function buildContext({ season, day, trigger, opponentId, series = null, playoff = null }) {
  const team = await prisma.team.findUnique({
    where: { id: USER_TEAM_ID },
    select: { id: true, name: true, division_id: true, division: { select: { name: true } } },
  });
  const opponent = opponentId
    ? await prisma.team.findUnique({ where: { id: opponentId }, select: { id: true, name: true } })
    : null;

  let standing = null;
  if (trigger === 'series' && team?.division_id != null) {
    const divisionTeams = await prisma.team.findMany({
      where: { division_id: team.division_id },
      select: { id: true, wins: true, losses: true },
      orderBy: [{ wins: 'desc' }, { losses: 'asc' }, { id: 'asc' }],
    });
    const position = divisionTeams.findIndex((t) => t.id === USER_TEAM_ID) + 1;
    standing = { position, inPlayoffZone: position <= PLAYOFF_TEAMS_PER_DIVISION, division: team.division?.name ?? 'división' };
  }

  const recentDesc = await prisma.gameSchedule.findMany({
    where: { season_id: season.id, is_user_game: true, status: 'finished' },
    orderBy: [{ day_number: 'desc' }, { id: 'desc' }],
    take: 15,
  });
  const streak = computeTrailingStreak(recentDesc, USER_TEAM_ID);

  const rivalryHot = opponentId
    ? (await getRivalryIntensity(USER_TEAM_ID, opponentId)) >= RIVALRY_BADGE_THRESHOLD
    : false;

  const featNews = await prisma.newsItem.findFirst({
    where: {
      season_id: season.id,
      type: { in: FEAT_TYPES },
      season_day: { gte: day - FEAT_LOOKBACK_DAYS },
      headline: { contains: `(${team.name})` },
    },
    orderBy: { id: 'desc' },
  });
  const feat = featNews ? { type: featNews.type, player: featNews.headline.split(' (')[0] } : null;

  const injuredPlayer = await prisma.player.findFirst({
    where: { team_id: USER_TEAM_ID, injury_days_remaining: { gt: 0 }, level: 'MAJOR' },
    orderBy: { current_skill: 'desc' },
    select: { first_name: true, last_name: true },
  });

  const deadlineSoon = trigger === 'series' && day < TRADE_DEADLINE_DAY && TRADE_DEADLINE_DAY - day <= DEADLINE_WARNING_DAYS;

  return {
    trigger,
    teamName: team.name,
    opponentName: opponent?.name ?? null,
    series,
    playoff,
    standing,
    streak,
    rivalryHot,
    feat,
    injured: injuredPlayer ? `${injuredPlayer.first_name} ${injuredPlayer.last_name}` : null,
    deadlineSoon,
  };
}

function pressAiOn() {
  return PRESS_AI_ENABLED && aiEnabled();
}

async function hostWithSatisfaction(host) {
  if (!host) return null;
  const rel = await prisma.broadcastRelation.findUnique({
    where: { company_id_team_id: { company_id: host.id, team_id: USER_TEAM_ID } },
  });
  return { ...host, satisfaction: rel?.satisfaction ?? PRESS_SATISFACTION_BASE };
}

// Reescribe con IA las preguntas de una rueda recien creada. Solo guarda si sigue pendiente
// (si el usuario ya respondio con las plantillas, no se toca). Devuelve lo generado o null.
async function enrichConference(conf, ctx, host) {
  if (!pressAiOn()) return null;
  const enriched = await enrichQuestions({
    ctx,
    questions: conf.questions,
    host: await hostWithSatisfaction(host),
    reporter: conf.reporter_name,
    seasonId: conf.season_id,
  });
  if (!enriched) return null;
  await prisma.pressConference.updateMany({
    where: { id: conf.id, status: 'pending' },
    data: { questions: enriched.questions },
  });
  return enriched;
}

// La rueda se crea al instante con plantillas y la IA la reescribe en segundo plano, para no
// retrasar la simulacion del partido (opts.awaitAi espera, para tests/scripts).
async function createConference({ season, day, trigger, opponentId, series, playoff, rng = Math.random, awaitAi = false }) {
  const ctx = await buildContext({ season, day, trigger, opponentId, series, playoff });
  const host = await pickHost(season.id);
  const conf = await prisma.pressConference.create({
    data: {
      season_id: season.id,
      day,
      trigger,
      opponent_team_id: opponentId ?? null,
      host_company_id: host?.id ?? null,
      reporter_name: reporterName(rng),
      status: 'pending',
      questions: pickQuestions(ctx, rng),
    },
  });
  const task = enrichConference(conf, ctx, host).catch((err) => {
    console.warn(`[press] IA no disponible para la rueda ${conf.id}: ${err.message}`);
    return null;
  });
  if (awaitAi) await task;
  return conf;
}

// Titular con IA; null si no hay IA o falla (el llamador usa la plantilla).
async function headlineWithAi(conf, perQuestion, names, fallback) {
  if (!pressAiOn()) return null;
  try {
    const host = conf.host_company_id
      ? await prisma.broadcastCompany.findUnique({ where: { id: conf.host_company_id }, select: { id: true, name: true, type: true } })
      : null;
    return await aiHeadline({
      perQuestion,
      questions: conf.questions,
      names,
      host: await hostWithSatisfaction(host),
      seasonId: conf.season_id,
      fallback,
    });
  } catch (err) {
    console.warn(`[press] titular IA fallido: ${err.message}`);
    return null;
  }
}

async function addAudience(delta) {
  if (!delta) return;
  const team = await prisma.team.findUnique({ where: { id: USER_TEAM_ID }, select: { press_audience: true } });
  const next = clamp((team?.press_audience ?? PRESS_AUDIENCE_BASE) + delta, PRESS_AUDIENCE_MIN, PRESS_AUDIENCE_MAX);
  await prisma.team.update({ where: { id: USER_TEAM_ID }, data: { press_audience: next } });
}

async function addSatisfaction(companyId, delta) {
  if (!companyId || !delta) return;
  const where = { company_id_team_id: { company_id: companyId, team_id: USER_TEAM_ID } };
  const rel = await prisma.broadcastRelation.findUnique({ where });
  const next = clamp((rel?.satisfaction ?? PRESS_SATISFACTION_BASE) + delta, PRESS_SATISFACTION_MIN, PRESS_SATISFACTION_MAX);
  await prisma.broadcastRelation.upsert({
    where,
    create: { company_id: companyId, team_id: USER_TEAM_ID, satisfaction: next },
    update: { satisfaction: next },
  });
}

function pressError(message, code) {
  const err = new Error(message);
  err.code = code;
  return err;
}

async function loadPending(id) {
  const conf = await prisma.pressConference.findUnique({ where: { id } });
  if (!conf) throw pressError('Rueda de prensa no encontrada', 'PRESS_NOT_FOUND');
  if (conf.status !== 'pending') throw pressError('Esta rueda de prensa ya terminó', 'PRESS_NOT_PENDING');
  return conf;
}

async function teamNames(conf) {
  const [team, opponent] = await Promise.all([
    prisma.team.findUnique({ where: { id: USER_TEAM_ID }, select: { name: true } }),
    conf.opponent_team_id
      ? prisma.team.findUnique({ where: { id: conf.opponent_team_id }, select: { name: true } })
      : null,
  ]);
  return { teamName: team?.name ?? 'el equipo', opponentName: opponent?.name ?? null };
}

// answers: [{ questionId, tone }]. Sin cadena anfitriona no hay audiencia ni satisfaccion.
async function answerConference(id, answers) {
  const conf = await loadPending(id);
  const computed = computeEffects(conf.questions, answers);
  const hasHost = conf.host_company_id != null;
  const applied = {
    audience: hasHost ? computed.audience : 0,
    satisfaction: hasHost ? computed.satisfaction : 0,
    rivalry: conf.opponent_team_id ? computed.rivalry : 0,
  };

  await addAudience(applied.audience);
  await addSatisfaction(conf.host_company_id, applied.satisfaction);
  if (applied.rivalry) await adjustRivalryIntensity(USER_TEAM_ID, conf.opponent_team_id, applied.rivalry);

  const names = await teamNames(conf);
  const fallback = pressHeadline(computed.perQuestion, names);
  const headline = (await headlineWithAi(conf, computed.perQuestion, names, fallback)) ?? fallback;
  await createNews('press', headline, conf.day, conf.season_id, { teamId: USER_TEAM_ID });

  return prisma.pressConference.update({
    where: { id },
    data: {
      status: 'answered',
      answers: computed.perQuestion.map(({ questionId, tone }) => ({ questionId, tone })),
      effects: { ...applied, perQuestion: computed.perQuestion },
    },
  });
}

async function skipPending(conf) {
  const hasHost = conf.host_company_id != null;
  const applied = {
    audience: hasHost ? -PRESS_SKIP_AUDIENCE_PENALTY : 0,
    satisfaction: hasHost ? -PRESS_SKIP_SATISFACTION_PENALTY : 0,
    rivalry: 0,
  };
  await addAudience(applied.audience);
  await addSatisfaction(conf.host_company_id, applied.satisfaction);

  const names = await teamNames(conf);
  await createNews('press', skippedHeadline(names), conf.day, conf.season_id, { teamId: USER_TEAM_ID });

  return prisma.pressConference.update({
    where: { id: conf.id },
    data: { status: 'skipped', effects: { ...applied, perQuestion: [] } },
  });
}

async function skipConference(id) {
  return skipPending(await loadPending(id));
}

async function expirePendingConferences(seasonId) {
  const pending = await prisma.pressConference.findMany({
    where: { ...(seasonId ? { season_id: seasonId } : {}), status: 'pending' },
  });
  for (const conf of pending) await skipPending(conf);
  return pending.length;
}

// Se llama tras simular un partido del usuario (routes/games.js), despues de actualizar la serie
// de playoffs. Primero da por omitida la rueda pendiente; luego crea una si toca. Devuelve la
// nueva rueda o null.
async function maybeCreateAfterUserGame(game, opts = {}) {
  if (!game?.season_id) return null;
  await expirePendingConferences(game.season_id);

  const season = await prisma.season.findUnique({ where: { id: game.season_id } });
  if (!season) return null;
  const day = season.current_day ?? game.day_number;

  if (!game.playoff_series_id) {
    // playGame ya dejo el partido como 'finished' con su marcador en la DB
    const progress = seriesProgress(await userRegularGames(game.season_id), game.id);
    if (!progress.closes || progress.seriesNumber % PRESS_SERIES_INTERVAL !== 0) return null;
    return createConference({
      season, day, trigger: 'series', opponentId: progress.opponentId,
      series: { wins: progress.wins, losses: progress.losses }, rng: opts.rng,
    });
  }

  const series = await prisma.playoffSeries.findUnique({ where: { id: game.playoff_series_id } });
  if (!series || series.round < 1 || series.status !== 'completed') return null;
  const opponentId = series.home_team_id === USER_TEAM_ID ? series.away_team_id : series.home_team_id;
  const won = series.winner_id === USER_TEAM_ID;
  const outcome = won ? (series.round === 3 ? 'champion' : 'advanced') : 'eliminated';
  return createConference({
    season, day, trigger: 'playoff_series', opponentId,
    playoff: { outcome, roundLabel: ROUND_LABELS[series.round] ?? 'playoffs' }, rng: opts.rng,
  });
}

// Se llama cuando termina la liguilla (cuartos creados): rueda de "clasificado" o "eliminado"
// si el usuario la jugo. Idempotente por temporada.
async function maybeCreateAfterGroupStage(seasonId, opts = {}) {
  const played = await prisma.playoffSeries.findFirst({
    where: { season_id: seasonId, round: 0, OR: [{ home_team_id: USER_TEAM_ID }, { away_team_id: USER_TEAM_ID }] },
  });
  if (!played) return null;
  const existing = await prisma.pressConference.findFirst({ where: { season_id: seasonId, trigger: 'playoff_group' } });
  if (existing) return null;

  const inQuarters = await prisma.playoffSeries.findFirst({
    where: { season_id: seasonId, round: 1, OR: [{ home_team_id: USER_TEAM_ID }, { away_team_id: USER_TEAM_ID }] },
  });
  await expirePendingConferences(seasonId);
  const season = await prisma.season.findUnique({ where: { id: seasonId } });
  return createConference({
    season, day: season.current_day, trigger: 'playoff_group', opponentId: null,
    playoff: { outcome: inQuarters ? 'group_qualified' : 'group_eliminated', roundLabel: 'la liguilla' }, rng: opts.rng,
  });
}

// Fin de temporada (antes de decrementar contratos): cierra pendientes, paga el bono de audiencia
// de cada contrato vigente, reinicia la audiencia y acerca la satisfaccion a 50.
async function settlePressSeason(season) {
  await expirePendingConferences(season.id);

  const team = await prisma.team.findUnique({ where: { id: USER_TEAM_ID }, select: { press_audience: true } });
  const audience = team?.press_audience ?? PRESS_AUDIENCE_BASE;
  const contracts = await prisma.broadcastContract.findMany({
    where: { team_id: USER_TEAM_ID, seasons_remaining: { gt: 0 } },
    include: { company: { select: { id: true, name: true, type: true } } },
  });

  const bonuses = [];
  for (const contract of contracts) {
    const amount = audienceBonus(contract.annual_payment, audience);
    if (amount <= 0) continue;
    await prisma.team.update({ where: { id: USER_TEAM_ID }, data: { budget: { increment: amount } } });
    await prisma.broadcastCompany.update({ where: { id: contract.company_id }, data: { money: { decrement: amount } } });
    await prisma.finance.create({
      data: {
        team_id: USER_TEAM_ID,
        season_day: season.current_day,
        type: 'broadcast_bonus',
        amount,
        description: `Bono de audiencia (${audience}/100) - ${contract.company.name}`,
      },
    });
    bonuses.push({ companyId: contract.company_id, amount });
  }

  if (bonuses.length > 0) {
    const total = bonuses.reduce((s, b) => s + b.amount, 0);
    await createNews('press', `Las cadenas premian la audiencia de las ruedas de prensa con $${total.toLocaleString('en-US')}`,
      season.current_day, season.id, { teamId: USER_TEAM_ID });
  }

  await prisma.team.update({ where: { id: USER_TEAM_ID }, data: { press_audience: PRESS_AUDIENCE_BASE } });

  const relations = await prisma.broadcastRelation.findMany({ where: { team_id: USER_TEAM_ID } });
  for (const rel of relations) {
    const next = Math.round(rel.satisfaction + (PRESS_SATISFACTION_BASE - rel.satisfaction) * PRESS_SATISFACTION_SEASON_DECAY);
    if (next !== rel.satisfaction) {
      await prisma.broadcastRelation.update({ where: { id: rel.id }, data: { satisfaction: next } });
    }
  }

  return { audience, bonuses };
}

async function withNames(conf, companiesById) {
  if (!conf) return null;
  const opponent = conf.opponent_team_id
    ? await prisma.team.findUnique({ where: { id: conf.opponent_team_id }, select: { id: true, name: true } })
    : null;
  let host = conf.host_company_id ? companiesById.get(conf.host_company_id) : null;
  if (conf.host_company_id && !host) {
    host = await prisma.broadcastCompany.findUnique({
      where: { id: conf.host_company_id }, select: { id: true, name: true, type: true },
    });
  }
  return { ...conf, opponent, host: host ?? null };
}

async function getConference(id) {
  const conf = await prisma.pressConference.findUnique({ where: { id } });
  return withNames(conf, new Map());
}

// Resumen para la Sala de prensa y la pagina de Transmision.
async function getPressOverview() {
  const season = (await prisma.season.findFirst({ where: { status: { in: ['active', 'playoffs'] } }, orderBy: { id: 'desc' } }))
    ?? (await prisma.season.findFirst({ orderBy: { id: 'desc' } }));

  const team = await prisma.team.findUnique({ where: { id: USER_TEAM_ID }, select: { press_audience: true } });
  const audience = team?.press_audience ?? PRESS_AUDIENCE_BASE;

  const contracts = await prisma.broadcastContract.findMany({
    where: { team_id: USER_TEAM_ID, seasons_remaining: { gt: 0 } },
    include: { company: { select: { id: true, name: true, type: true } } },
  });
  const relations = await prisma.broadcastRelation.findMany({
    where: { team_id: USER_TEAM_ID },
    include: { company: { select: { id: true, name: true, type: true } } },
  });
  const satByCompany = new Map(relations.map((r) => [r.company_id, r.satisfaction]));
  const companiesById = new Map([...contracts.map((c) => [c.company.id, c.company]), ...relations.map((r) => [r.company.id, r.company])]);

  const broadcasters = contracts.map((c) => ({
    company: c.company,
    satisfaction: satByCompany.get(c.company_id) ?? PRESS_SATISFACTION_BASE,
    annual_payment: Number(c.annual_payment ?? 0),
    estimated_bonus: audienceBonus(c.annual_payment, audience),
    seasons_remaining: c.seasons_remaining,
  }));
  const contractedIds = new Set(contracts.map((c) => c.company_id));
  const otherRelations = relations
    .filter((r) => !contractedIds.has(r.company_id))
    .map((r) => ({ company: r.company, satisfaction: r.satisfaction }));

  let pending = null;
  let history = [];
  let schedule = null;
  if (season) {
    const confs = await prisma.pressConference.findMany({ where: { season_id: season.id }, orderBy: { id: 'desc' } });
    const named = [];
    for (const c of confs) named.push(await withNames(c, companiesById));
    pending = named.find((c) => c.status === 'pending') ?? null;
    history = named.filter((c) => c.status !== 'pending');
    if (season.status === 'active') schedule = seriesUntilNextConference(await userRegularGames(season.id));
  }

  return {
    season: season ? { id: season.id, status: season.status, current_day: season.current_day } : null,
    audience,
    seriesInterval: PRESS_SERIES_INTERVAL,
    schedule,
    pending,
    history,
    broadcasters,
    otherRelations,
  };
}

module.exports = {
  groupIntoSeries,
  seriesProgress,
  seriesUntilNextConference,
  audienceBonus,
  pickHost,
  buildContext,
  createConference,
  enrichConference,
  answerConference,
  skipConference,
  expirePendingConferences,
  maybeCreateAfterUserGame,
  maybeCreateAfterGroupStage,
  settlePressSeason,
  getConference,
  getPressOverview,
};
