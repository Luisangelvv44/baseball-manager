const prisma = require('../db/prisma');
const {
  USER_TEAM_ID,
  HISTORICAL_CPU_STAT_DIVISOR,
  HOF_MIN_SEASONS,
  HOF_BALLOT_MIN_PERCENTILE,
  HOF_INDUCTION_PCT,
  HOF_DROP_PCT,
  HOF_MAX_BALLOT_YEARS,
  HOF_VOTE_MIN_PCT,
  HOF_VOTE_MAX_PCT,
  HOF_BALLOT_YEAR_MOMENTUM,
  HOF_VOTE_NOISE,
  HOF_INDUCTION_REPUTATION_BONUS,
  HOF_BATTER_WEIGHTS,
  HOF_PITCHER_WEIGHTS,
  HOF_AWARD_POINTS,
  HEIR_ELITE_PERCENTILE,
  HEIR_CHANCE_ELITE,
  HEIR_CHANCE_BALLOT,
  HEIR_SAME_POSITION_CHANCE,
  HEIR_JUNIOR_CHANCE,
  HEIR_PARENT_POTENTIAL_WEIGHT,
  HEIR_POTENTIAL_BONUS,
  HEIR_FACE_INHERIT_CHANCE,
  TODDLER_PROGRAM_START_SKILL,
} = require('../config');
const { createNews } = require('./newsService');
const { clampReputation } = require('./reputationService');
const { randomAppearanceData } = require('./playerAppearanceService');
const { generatePotentialCoefficient, calculateGrowthAge, POSITIONS } = require('../seeders/generators/playerGenerator');
const { FIRST_NAMES } = require('../seeders/data/names');

const round1 = (n) => Math.round(n * 10) / 10;

function roleOf(position) {
  return position === 'P' ? 'PITCHER' : 'BATTER';
}

// Resume las temporadas archivadas (player_season_records) de un jugador: totales reales
// para la placa, totales ponderados (stints CPU / HISTORICAL_CPU_STAT_DIVISOR, igual que el
// ranking historico) para el puntaje, temporadas jugadas y equipo principal.
function summarizeCareer(records) {
  const totals = { games: 0, hits: 0, home_runs: 0, rbi: 0, walks: 0, wins: 0, losses: 0, strikeouts: 0, outs: 0, earned_runs: 0 };
  const weighted = { hits: 0, home_runs: 0, rbi: 0, walks: 0, wins: 0, strikeouts: 0, innings: 0, earned_runs: 0 };
  const seasons = new Set();
  const seasonsByTeam = new Map();

  for (const r of records) {
    const w = r.team_id === USER_TEAM_ID ? 1 : 1 / HISTORICAL_CPU_STAT_DIVISOR;
    totals.games += r.games + r.pitching_games;
    totals.hits += r.hits;
    totals.home_runs += r.home_runs;
    totals.rbi += r.rbi;
    totals.walks += r.walks;
    totals.wins += r.wins;
    totals.losses += r.losses;
    totals.strikeouts += r.pitching_strikeouts;
    totals.outs += r.pitching_outs;
    totals.earned_runs += r.earned_runs;

    weighted.hits += r.hits * w;
    weighted.home_runs += r.home_runs * w;
    weighted.rbi += r.rbi * w;
    weighted.walks += r.walks * w;
    weighted.wins += r.wins * w;
    weighted.strikeouts += r.pitching_strikeouts * w;
    weighted.innings += (r.pitching_outs / 3) * w;
    weighted.earned_runs += r.earned_runs * w;

    seasons.add(r.season_id);
    if (r.team_id != null) {
      const entry = seasonsByTeam.get(r.team_id) || { seasons: new Set(), last: 0 };
      entry.seasons.add(r.season_id);
      entry.last = Math.max(entry.last, r.season_id);
      seasonsByTeam.set(r.team_id, entry);
    }
  }

  // Equipo principal: mas temporadas; empate -> el mas reciente
  let primaryTeamId = null;
  let best = null;
  for (const [teamId, e] of seasonsByTeam) {
    if (!best || e.seasons.size > best.seasons.size || (e.seasons.size === best.seasons.size && e.last > best.last)) {
      best = e;
      primaryTeamId = teamId;
    }
  }

  const innings = totals.outs / 3;
  const careerTotals = {
    games: totals.games,
    hits: totals.hits,
    home_runs: totals.home_runs,
    rbi: totals.rbi,
    wins: totals.wins,
    losses: totals.losses,
    strikeouts: totals.strikeouts,
    innings_pitched: round1(innings),
    era: innings > 0 ? Math.round((totals.earned_runs * 9 / innings) * 100) / 100 : null,
  };

  return { careerTotals, weighted, seasonsPlayed: seasons.size, primaryTeamId };
}

// Puntaje de legado: estadisticas ponderadas segun el rol + puntos fijos por premio.
function computeLegacyScore(role, weighted, awardCategories = []) {
  const weights = role === 'PITCHER' ? HOF_PITCHER_WEIGHTS : HOF_BATTER_WEIGHTS;
  let score = 0;
  for (const [key, weight] of Object.entries(weights)) score += (weighted[key] || 0) * weight;
  for (const category of awardCategories) score += HOF_AWARD_POINTS[category] || 0;
  return round1(Math.max(0, score));
}

// Percentil (0-1) de `score` dentro de `pool`, con los empates contando la mitad.
function percentileOf(score, pool) {
  if (pool.length === 0) return 1;
  let below = 0;
  let equal = 0;
  for (const s of pool) {
    if (s < score) below++;
    else if (s === score) equal++;
  }
  return (below + equal / 2) / pool.length;
}

// % de votos: lineal desde HOF_VOTE_MIN_PCT (percentil minimo de papeleta) hasta
// HOF_VOTE_MAX_PCT (percentil 1.0), + impulso por anios previos en la papeleta, + ruido.
function computeVotePct(percentile, yearsOnBallot, rng = Math.random) {
  const span = 1 - HOF_BALLOT_MIN_PERCENTILE;
  const base = HOF_VOTE_MIN_PCT + ((percentile - HOF_BALLOT_MIN_PERCENTILE) / span) * (HOF_VOTE_MAX_PCT - HOF_VOTE_MIN_PCT);
  const noise = (rng() * 2 - 1) * HOF_VOTE_NOISE;
  return round1(Math.max(0, Math.min(100, base + yearsOnBallot * HOF_BALLOT_YEAR_MOMENTUM + noise)));
}

// Resultado de una votacion dado el % y los anios en la papeleta YA contando esta.
function resolveVote(pct, yearsOnBallot) {
  if (pct >= HOF_INDUCTION_PCT) return 'inducted';
  if (pct < HOF_DROP_PCT || yearsOnBallot >= HOF_MAX_BALLOT_YEARS) return 'dropped';
  return 'candidate';
}

// Puntajes del pool de comparacion por rol: retirados ya evaluados con carrera suficiente.
async function loadScorePools() {
  const rows = await prisma.hallOfFameCandidate.findMany({
    where: { seasons_played: { gte: HOF_MIN_SEASONS } },
    select: { role: true, legacy_score: true },
  });
  const pools = { BATTER: [], PITCHER: [] };
  for (const r of rows) pools[r.role]?.push(r.legacy_score);
  return pools;
}

const fullName = (p) => `${p.first_name} ${p.last_name}`;

// Vota a los candidatos registrados en temporadas anteriores (el que se retira espera una).
async function voteBallot(season, pools, rng) {
  const ballot = await prisma.hallOfFameCandidate.findMany({
    where: { status: 'candidate', evaluated_season_id: { lt: season.id } },
    include: { player: { select: { first_name: true, last_name: true } } },
  });

  const results = [];
  for (const c of ballot) {
    const percentile = percentileOf(c.legacy_score, pools[c.role] || []);
    const pct = computeVotePct(percentile, c.years_on_ballot, rng);
    const yearsOnBallot = c.years_on_ballot + 1;
    const status = resolveVote(pct, yearsOnBallot);
    const history = Array.isArray(c.vote_history) ? c.vote_history : [];

    await prisma.hallOfFameCandidate.update({
      where: { id: c.id },
      data: {
        status,
        years_on_ballot: yearsOnBallot,
        last_vote_pct: pct,
        vote_history: [...history, { season_id: season.id, pct }],
        ...(status === 'inducted' ? { inducted_season_id: season.id } : {}),
      },
    });
    results.push({ id: c.id, player_id: c.player_id, status, pct });

    const isUserLegend = c.primary_team_id === USER_TEAM_ID;
    if (status === 'inducted') {
      const firstBallot = yearsOnBallot === 1 ? ' en su primer año en la papeleta' : '';
      await createNews(
        'hall_of_fame',
        `🏛️ ${fullName(c.player)} entra al Salón de la Fama con ${pct}% de los votos${firstBallot}`,
        season.current_day,
        season.id,
        { teamId: c.primary_team_id, alert: isUserLegend },
      );
      if (c.primary_team_id != null && HOF_INDUCTION_REPUTATION_BONUS > 0) {
        const team = await prisma.team.findUnique({ where: { id: c.primary_team_id }, select: { reputation: true } });
        if (team) {
          await prisma.team.update({
            where: { id: c.primary_team_id },
            data: { reputation: clampReputation(team.reputation + HOF_INDUCTION_REPUTATION_BONUS) },
          });
        }
      }
    } else if (status === 'dropped' && isUserLegend) {
      await createNews(
        'hall_of_fame',
        `${fullName(c.player)} sale de la papeleta del Salón de la Fama (${pct}%)`,
        season.current_day,
        season.id,
        { teamId: c.primary_team_id },
      );
    }
  }
  return results;
}

// ----- Herederos -----

function heirChance(percentile) {
  return percentile >= HEIR_ELITE_PERCENTILE ? HEIR_CHANCE_ELITE : HEIR_CHANCE_BALLOT;
}

const pick = (list, rng) => list[Math.floor(rng() * list.length)];

// Datos del hijo de una leyenda: mismo apellido (a veces "Jr."), posicion del padre la mayoria
// de las veces, potencial mezclado con el del padre. Queda 'heir_pending' (sin equipo ni ciclo)
// hasta que generateToddlerCycle lo inyecta en el siguiente ciclo de Toddlers.
function buildHeirData(parent, rng = Math.random) {
  const junior = rng() < HEIR_JUNIOR_CHANCE && !parent.last_name.endsWith(' Jr.');
  const position = rng() < HEIR_SAME_POSITION_CHANCE ? parent.position : pick(POSITIONS, rng);
  const potential = Math.max(30, Math.min(99, Math.round(
    parent.potential_coefficient * HEIR_PARENT_POTENTIAL_WEIGHT
      + generatePotentialCoefficient() * (1 - HEIR_PARENT_POTENTIAL_WEIGHT),
  ) + HEIR_POTENTIAL_BONUS));

  return {
    first_name: junior ? parent.first_name : pick(FIRST_NAMES, rng),
    last_name: (junior ? `${parent.last_name} Jr.` : parent.last_name.replace(/ Jr\.$/, '')).slice(0, 50),
    age: 0,
    position,
    potential_coefficient: potential,
    growth_age: calculateGrowthAge(potential),
    current_skill: TODDLER_PROGRAM_START_SKILL,
    salary: 0,
    contract_years_remaining: 0,
    status: 'heir_pending',
    level: 'MINOR',
    team_id: null,
    parent_id: parent.id,
  };
}

// Apariencia del hijo: tono de piel siempre del padre, la cara a veces, el resto aleatorio.
function buildHeirAppearance(heirId, parentAppearance, rng = Math.random) {
  const base = randomAppearanceData(heirId);
  if (!parentAppearance) return base;
  return {
    ...base,
    skin_tone: parentAppearance.skin_tone,
    ...(rng() < HEIR_FACE_INHERIT_CHANCE ? { face_type: parentAppearance.face_type } : {}),
  };
}

async function createHeir(season, parent, primaryTeamId, rng) {
  const heir = await prisma.player.create({ data: buildHeirData(parent, rng) });
  await prisma.playerAppearance.create({ data: buildHeirAppearance(heir.id, parent.appearance, rng) });
  await createNews(
    'hall_of_fame',
    `🧬 ${fullName(heir)}, hijo de ${fullName(parent)}, sueña con seguir los pasos de su padre: entrará al próximo ciclo del Programa de Toddlers`,
    season.current_day,
    season.id,
    { teamId: primaryTeamId, alert: primaryTeamId === USER_TEAM_ID },
  );
  return heir;
}

// Evalua a todo jugador retirado que aun no tenga fila: los que se retiraron esta temporada y,
// la primera vez que corre, todos los retirados historicos del save (la "clase inaugural").
// Cada uno que entra a la papeleta puede ademas tener un heredero (ver heirChance).
async function registerRetirees(season, pools, rng) {
  const retirees = await prisma.player.findMany({
    where: { status: 'retired', hall_of_fame: { is: null } },
    select: {
      id: true, first_name: true, last_name: true, position: true, potential_coefficient: true,
      appearance: { select: { skin_tone: true, face_type: true } },
    },
  });
  if (retirees.length === 0) return { candidates: [], heirs: [] };

  const ids = retirees.map((p) => p.id);
  const [records, awards] = await Promise.all([
    prisma.playerSeasonRecord.findMany({ where: { player_id: { in: ids } } }),
    prisma.seasonAward.findMany({ where: { player_id: { in: ids } }, select: { player_id: true, category: true } }),
  ]);
  const recordsBy = new Map();
  for (const r of records) {
    if (!recordsBy.has(r.player_id)) recordsBy.set(r.player_id, []);
    recordsBy.get(r.player_id).push(r);
  }
  const awardsBy = new Map();
  for (const a of awards) {
    if (!awardsBy.has(a.player_id)) awardsBy.set(a.player_id, []);
    awardsBy.get(a.player_id).push(a.category);
  }

  // Primero se calculan todos y se suman al pool, para que la clase entera se compare entre si
  const evaluated = retirees.map((p) => {
    const role = roleOf(p.position);
    const career = summarizeCareer(recordsBy.get(p.id) || []);
    const score = computeLegacyScore(role, career.weighted, awardsBy.get(p.id) || []);
    if (career.seasonsPlayed >= HOF_MIN_SEASONS) pools[role].push(score);
    return { player: p, role, career, score };
  });

  const newCandidates = [];
  const heirs = [];
  for (const e of evaluated) {
    const eligible = e.career.seasonsPlayed >= HOF_MIN_SEASONS;
    const percentile = percentileOf(e.score, pools[e.role]);
    const qualifies = eligible && percentile >= HOF_BALLOT_MIN_PERCENTILE;
    await prisma.hallOfFameCandidate.create({
      data: {
        player_id: e.player.id,
        role: e.role,
        legacy_score: e.score,
        seasons_played: e.career.seasonsPlayed,
        career_totals: e.career.careerTotals,
        primary_team_id: e.career.primaryTeamId,
        evaluated_season_id: season.id,
        status: qualifies ? 'candidate' : 'not_qualified',
      },
    });
    if (qualifies) {
      newCandidates.push(e);
      if (rng() < heirChance(percentile)) {
        heirs.push((await createHeir(season, e.player, e.career.primaryTeamId, rng)).id);
      }
    }
  }

  if (newCandidates.length > 0) {
    const names = newCandidates
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map((e) => fullName(e.player))
      .join(', ');
    const more = newCandidates.length > 3 ? ` y ${newCandidates.length - 3} más` : '';
    await createNews(
      'hall_of_fame',
      `Nuevos en la papeleta del Salón de la Fama: ${names}${more}. Se votarán la próxima temporada`,
      season.current_day,
      season.id,
    );
  }
  return { candidates: newCandidates.map((e) => e.player.id), heirs };
}

// Fin de temporada: corre despues de retireOldPlayers() y de archivar la temporada
// (summarizeCareer lee player_season_records, que ya incluyen la que termina).
async function runHallOfFameSeason(season, rng = Math.random) {
  const pools = await loadScorePools();
  const votes = await voteBallot(season, pools, rng);
  const { candidates, heirs } = await registerRetirees(season, pools, rng);
  return { votes, registered: candidates, heirs };
}

module.exports = {
  runHallOfFameSeason,
  summarizeCareer,
  computeLegacyScore,
  percentileOf,
  computeVotePct,
  resolveVote,
  roleOf,
  heirChance,
  buildHeirData,
  buildHeirAppearance,
};
