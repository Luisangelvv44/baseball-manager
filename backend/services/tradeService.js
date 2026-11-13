const prisma = require('../db/prisma');
const {
  USER_TEAM_ID, TRADE_DEADLINE_DAY, TRADE_OFFER_EXPIRY_DAYS,
  TRADE_VALUE_SKILL_WEIGHT, TRADE_VALUE_SALARY_WEIGHT, TRADE_VALUE_YEAR_DISCOUNT, TRADE_VALUE_RETIREMENT_AGE,
} = require('../config');
const { baseSalaryForSkill } = require('./salaryCurve');
const { createNews } = require('./newsService');
const { transferContract } = require('./contractService');
const { isEnabled: aiEnabled } = require('./aiService');
const { offerPitchMessage } = require('./tradeMessages');
const { composeOfferMessage } = require('./tradeAi');

const ACCEPT_TOLERANCE_BASE = 0.10;  // tolerancia base a un trade ligeramente desfavorable, escala con bid_aggressiveness
const CPU_OFFER_CHANCE = 0.05;       // probabilidad diaria de que un equipo CPU genere una oferta al usuario
const SURPLUS_SKILL_MARGIN = 5;      // ventaja minima de current_skill que debe tener el jugador pedido al usuario

const SKILL_GROWTH_RATE = 0.04; // mismo valor esperado que projectPeakSkill (auctionService)

// Valor de un jugador (en dolares) desde la optica de quien lo adquiere: por cada anio de
// contrato que le queda antes del retiro, lo que vale su produccion (salario de referencia de
// su destreza proyectada x TRADE_VALUE_SKILL_WEIGHT) menos una fraccion de lo que cobra,
// descontado al futuro. La edad entra por la proyeccion: crece hasta growth_age, luego declina.
function evaluatePlayerValue(player) {
  const years = Math.max(1, player.contract_years_remaining || 1);
  const salary = Number(player.salary ?? 0);
  const delta = Math.round((player.potential_coefficient ?? 0) * SKILL_GROWTH_RATE);
  let skill = player.current_skill;
  let age = player.age;
  let value = 0;
  for (let y = 0; y < years; y++) {
    if (y > 0 && age >= TRADE_VALUE_RETIREMENT_AGE) break;
    const worth = TRADE_VALUE_SKILL_WEIGHT * baseSalaryForSkill(Math.max(0, skill));
    value += TRADE_VALUE_YEAR_DISCOUNT ** y * (worth - TRADE_VALUE_SALARY_WEIGHT * salary);
    skill = Math.min(150, Math.max(0, skill + (age < player.growth_age ? delta : -delta)));
    age += 1;
  }
  return value;
}

// Valor neto del trade para evaluatingTeamId (positivo = favorable para ese equipo).
// cash_offered fluye proposer->recipient, cash_requested fluye recipient->proposer.
function evaluateTradeForTeam(evaluatingTeamId, trade) {
  const incomingItems = trade.items.filter((i) => i.from_team_id !== evaluatingTeamId);
  const outgoingItems = trade.items.filter((i) => i.from_team_id === evaluatingTeamId);
  const incomingValue = incomingItems.reduce((s, i) => s + evaluatePlayerValue(i.player), 0);
  const outgoingValue = outgoingItems.reduce((s, i) => s + evaluatePlayerValue(i.player), 0);

  const isRecipient = evaluatingTeamId === trade.recipient_team_id;
  const cashIn = isRecipient ? Number(trade.cash_offered) : Number(trade.cash_requested);
  const cashOut = isRecipient ? Number(trade.cash_requested) : Number(trade.cash_offered);

  return (incomingValue + cashIn) - (outgoingValue + cashOut);
}

// Margen del trade para la CPU: cuanto le sobra (>= 0) o le falta (< 0) para aceptarlo.
// La tolerancia escala con la suma de |valores| de los jugadores: un valor puede ser negativo
// (salario) y no debe encoger la tolerancia. El efectivo no entra en la escala.
function acceptanceMargin(cpuTeam, trade) {
  const netValue = evaluateTradeForTeam(cpuTeam.id, trade);
  const scale = trade.items.reduce((s, i) => s + Math.abs(evaluatePlayerValue(i.player)), 0) || 1;
  // mas agresivo = mas tolerante a un trade ligeramente desfavorable (arriesga mas)
  const tolerance = ACCEPT_TOLERANCE_BASE * (1 + cpuTeam.bid_aggressiveness);
  return { margin: netValue + tolerance * scale, scale };
}

function shouldCpuAcceptTrade(cpuTeam, trade) {
  return acceptanceMargin(cpuTeam, trade).margin >= 0;
}

const AGE_RISK_FROM = 34;
const CASH_HINT_STEP = 50_000;

// Por que la CPU acepta/rechaza una propuesta del usuario, con datos del propio calculo de
// valor (para el mensaje del GM). Puro. cpuRoster: jugadores MAJOR activos de la CPU.
// El efectivo NO cuenta en la escala de tolerancia, asi que cashNeeded es exacto (redondeado hacia arriba).
function explainTradeDecision(cpuTeam, trade, cpuRoster = []) {
  const { margin, scale } = acceptanceMargin(cpuTeam, trade);
  const accepted = margin >= 0;
  const incoming = trade.items.filter((i) => i.from_team_id !== cpuTeam.id).map((i) => i.player);
  const outgoing = trade.items.filter((i) => i.from_team_id === cpuTeam.id).map((i) => i.player);

  // "caro" = cobra por punto de destreza mas del doble que la mediana de la plantilla CPU
  const perSkill = (p) => Number(p.salary ?? 0) / Math.max(1, p.current_skill);
  const rosterRates = cpuRoster.map(perSkill).sort((a, b) => a - b);
  const medianRate = rosterRates.length ? rosterRates[Math.floor(rosterRates.length / 2)] : null;

  const concerns = [];
  for (const p of incoming) {
    if (p.age > AGE_RISK_FROM) concerns.push({ type: 'veterano', player: p });
    else if (medianRate && perSkill(p) > medianRate * 2) concerns.push({ type: 'caro', player: p });
  }
  for (const p of outgoing) {
    const samePos = cpuRoster.filter((r) => r.position === p.position);
    const isStarter = samePos.every((r) => r.id === p.id || r.current_skill <= p.current_skill);
    if (isStarter) concerns.push({ type: 'titular', player: p });
  }
  if (Number(trade.cash_requested) > 0) concerns.push({ type: 'pides_efectivo', amount: Number(trade.cash_requested) });

  // Posicion mas floja de la CPU (peor titular) si el usuario no ofrece a nadie ahi.
  const bestByPos = {};
  for (const r of cpuRoster) {
    if (!bestByPos[r.position] || r.current_skill > bestByPos[r.position]) bestByPos[r.position] = r.current_skill;
  }
  const weakest = Object.entries(bestByPos).sort((a, b) => a[1] - b[1])[0]?.[0] ?? null;
  const needPosition = weakest && !incoming.some((p) => p.position === weakest) ? weakest : null;

  const gapRatio = accepted ? 0 : -margin / scale;
  const closeness = accepted ? null : gapRatio < 0.1 ? 'cerca' : gapRatio < 0.3 ? 'lejos' : 'muy_lejos';
  const cashNeeded = accepted ? 0 : Math.ceil(-margin / CASH_HINT_STEP) * CASH_HINT_STEP;

  return { accepted, closeness, cashNeeded, concerns, needPosition };
}

// Reglas compartidas por la ruta de propuesta/aceptacion y por la aceptacion automatica de CPU.
// `trade` debe traer { proposer_team_id, recipient_team_id, cash_offered, cash_requested,
// items: [{ from_team_id, player }] } — player con team_id/current_skill/etc ya cargados.
async function validateTrade(client, trade, season) {
  if (trade.proposer_team_id === trade.recipient_team_id) {
    return { ok: false, error: 'No puedes proponer un trade contigo mismo' };
  }
  if (trade.proposer_team_id !== USER_TEAM_ID && trade.recipient_team_id !== USER_TEAM_ID) {
    return { ok: false, error: 'Uno de los equipos debe ser el tuyo' };
  }
  if (season.current_day >= TRADE_DEADLINE_DAY) {
    return { ok: false, error: `Los traspasos ya no están disponibles a partir del día ${TRADE_DEADLINE_DAY}` };
  }

  const proposerItems = trade.items.filter((i) => i.from_team_id === trade.proposer_team_id);
  const recipientItems = trade.items.filter((i) => i.from_team_id === trade.recipient_team_id);
  if (proposerItems.length === 0 || recipientItems.length === 0) {
    return { ok: false, error: 'Cada traspaso debe incluir al menos un jugador de cada equipo' };
  }

  for (const item of trade.items) {
    if (item.player.team_id !== item.from_team_id) {
      return { ok: false, error: `${item.player.first_name} ${item.player.last_name} ya no pertenece al equipo esperado` };
    }
    if (item.player.level !== 'MAJOR') {
      return { ok: false, error: `${item.player.first_name} ${item.player.last_name} está en Ligas Menores — solo puedes traspasar jugadores de las Mayores` };
    }
  }

  const [proposerTeam, recipientTeam] = await Promise.all([
    client.team.findUnique({ where: { id: trade.proposer_team_id }, select: { budget: true } }),
    client.team.findUnique({ where: { id: trade.recipient_team_id }, select: { budget: true } }),
  ]);

  if (Number(trade.cash_offered) > Number(proposerTeam.budget)) {
    return { ok: false, error: 'El equipo proponente no tiene presupuesto suficiente para el efectivo ofrecido' };
  }
  if (Number(trade.cash_requested) > Number(recipientTeam.budget)) {
    return { ok: false, error: 'El otro equipo no tiene presupuesto suficiente para el efectivo solicitado' };
  }

  return { ok: true };
}

// Ejecuta un trade ya validado: mueve jugadores, ajusta presupuestos, registra Finance
// (solo para el lado del usuario, igual que _signPlayerToTeam en auctionService) y noticia.
async function executeTrade(client, trade, season) {
  for (const item of trade.items) {
    const destinationTeamId = item.from_team_id === trade.proposer_team_id
      ? trade.recipient_team_id
      : trade.proposer_team_id;
    await client.player.update({ where: { id: item.player_id }, data: { team_id: destinationTeamId } });
    await transferContract(client, item.player_id, destinationTeamId, season?.id);
    await client.teamLineup.deleteMany({ where: { player_id: item.player_id } });
  }

  const cashOffered = Number(trade.cash_offered);
  const cashRequested = Number(trade.cash_requested);

  if (cashOffered > 0) {
    await client.team.update({ where: { id: trade.proposer_team_id }, data: { budget: { decrement: cashOffered } } });
    await client.team.update({ where: { id: trade.recipient_team_id }, data: { budget: { increment: cashOffered } } });
  }
  if (cashRequested > 0) {
    await client.team.update({ where: { id: trade.recipient_team_id }, data: { budget: { decrement: cashRequested } } });
    await client.team.update({ where: { id: trade.proposer_team_id }, data: { budget: { increment: cashRequested } } });
  }

  const [proposerTeam, recipientTeam] = await Promise.all([
    client.team.findUnique({ where: { id: trade.proposer_team_id }, select: { name: true } }),
    client.team.findUnique({ where: { id: trade.recipient_team_id }, select: { name: true } }),
  ]);

  const userIsProposer = trade.proposer_team_id === USER_TEAM_ID;
  const netCashForUser = userIsProposer ? (cashRequested - cashOffered) : (cashOffered - cashRequested);
  if (netCashForUser !== 0) {
    const otherTeamName = userIsProposer ? recipientTeam.name : proposerTeam.name;
    await client.finance.create({
      data: {
        team_id: USER_TEAM_ID,
        season_day: season.current_day,
        type: 'trade',
        amount: netCashForUser,
        description: `Ajuste en efectivo por traspaso con ${otherTeamName}`,
      },
    });
  }

  await client.trade.update({
    where: { id: trade.id },
    data: { status: 'accepted', resolved_day: season.current_day },
  });

  const userInTrade = trade.proposer_team_id === USER_TEAM_ID || trade.recipient_team_id === USER_TEAM_ID;
  await createNews('trade',
    `${proposerTeam.name} y ${recipientTeam.name} completaron un traspaso`,
    season.current_day,
    season.id,
    userInTrade ? { teamId: USER_TEAM_ID, alert: true } : {}
  );
}

// Reemplaza el mensaje de plantilla de una oferta CPU por el de la IA, solo si sigue pendiente.
// Devuelve la promesa (los tests la esperan); nunca rechaza.
function rewriteOfferMessage(tradeId, opts) {
  return composeOfferMessage({ ...opts, timeoutMs: 20_000 })
    .then(({ message, source }) => (source === 'ai'
      ? prisma.trade.updateMany({ where: { id: tradeId, status: 'pending' }, data: { gm_message: message } })
      : null))
    .catch((err) => {
      console.warn(`[trades] mensaje IA de la oferta ${tradeId} fallido: ${err.message}`);
      return null;
    });
}

async function expireStaleTrades(tx, season) {
  const client = tx || prisma;
  await client.trade.updateMany({
    where: { status: 'pending', expires_day: { lte: season.current_day } },
    data: { status: 'expired' },
  });
}

// Cada equipo CPU, con baja probabilidad diaria, detecta su posicion mas debil, busca un
// reemplazo claro en el roster del usuario, y ofrece a cambio su mejor jugador sobrante
// (2do mejor en alguna posicion con titular ya cubierto), balanceando con efectivo si hace falta.
async function generateCpuTradeOffers(tx, season) {
  const client = tx || prisma;

  const cpuTeams = await client.team.findMany({
    where: { is_user_team: false },
    select: { id: true, name: true, budget: true, bid_aggressiveness: true },
  });
  let userTeamName = null;

  for (const cpuTeam of cpuTeams) {
    if (Math.random() >= CPU_OFFER_CHANCE) continue;

    const existingPending = await client.trade.findFirst({
      where: { proposer_team_id: cpuTeam.id, recipient_team_id: USER_TEAM_ID, status: 'pending' },
    });
    if (existingPending) continue;

    const cpuRoster = await client.player.findMany({
      where: { team_id: cpuTeam.id, status: 'active' },
      select: {
        id: true, first_name: true, last_name: true, position: true, current_skill: true, age: true,
        growth_age: true, potential_coefficient: true, contract_years_remaining: true, salary: true, rookie_contract: true,
      },
    });
    if (cpuRoster.length === 0) continue;

    const weakestByPosition = {};
    for (const p of cpuRoster) {
      const current = weakestByPosition[p.position];
      if (!current || p.current_skill < current.current_skill) weakestByPosition[p.position] = p;
    }
    const weakestEntries = Object.values(weakestByPosition).sort((a, b) => a.current_skill - b.current_skill);

    let targetPlayer = null;
    let needPosition = null;
    for (const weak of weakestEntries) {
      const candidate = await client.player.findFirst({
        where: {
          team_id: USER_TEAM_ID,
          status: 'active',
          position: weak.position,
          current_skill: { gte: weak.current_skill + SURPLUS_SKILL_MARGIN },
        },
        orderBy: { current_skill: 'asc' },
      });
      if (candidate) { targetPlayer = candidate; needPosition = weak.position; break; }
    }
    if (!targetPlayer) continue;

    // jugador sobrante: el mejor "segundo mejor" de alguna posicion con titular ya cubierto
    const byPositionNonRookie = {};
    for (const p of cpuRoster) {
      if (p.rookie_contract) continue;
      byPositionNonRookie[p.position] ??= [];
      byPositionNonRookie[p.position].push(p);
    }
    let surplusPlayer = null;
    for (const list of Object.values(byPositionNonRookie)) {
      if (list.length < 2) continue;
      list.sort((a, b) => b.current_skill - a.current_skill);
      const candidate = list[1];
      if (!surplusPlayer || candidate.current_skill > surplusPlayer.current_skill) surplusPlayer = candidate;
    }
    if (!surplusPlayer) continue;

    const targetValue = evaluatePlayerValue(targetPlayer);
    const surplusValue = evaluatePlayerValue(surplusPlayer);
    const gap = targetValue - surplusValue;
    const cashOffered = gap > 0
      ? Math.min(Math.round(Number(cpuTeam.budget) * 0.3), Math.round((gap * 0.5) / 10000) * 10000)
      : 0;

    const trade = await client.trade.create({
      data: {
        season_id: season.id,
        proposer_team_id: cpuTeam.id,
        recipient_team_id: USER_TEAM_ID,
        status: 'pending',
        cash_offered: cashOffered,
        cash_requested: 0,
        created_day: season.current_day,
        expires_day: season.current_day + TRADE_OFFER_EXPIRY_DAYS,
        gm_message: offerPitchMessage({ needPosition, targetPlayer, surplusPlayer, cashOffered }),
      },
    });

    // La IA reescribe el mensaje en segundo plano (no retrasa el avance de dia).
    if (aiEnabled()) {
      userTeamName ??= (await client.team.findUnique({ where: { id: USER_TEAM_ID }, select: { name: true } }))?.name ?? 'tu equipo';
      rewriteOfferMessage(trade.id, {
        cpuTeam, userTeamName, needPosition, targetPlayer, surplusPlayer, cashOffered, seasonId: season.id,
      });
    }

    await client.tradeItem.createMany({
      data: [
        { trade_id: trade.id, player_id: surplusPlayer.id, from_team_id: cpuTeam.id },
        { trade_id: trade.id, player_id: targetPlayer.id, from_team_id: USER_TEAM_ID },
      ],
    });

    await createNews('trade',
      `${cpuTeam.name} propuso un traspaso buscando reforzar su plantel`,
      season.current_day,
      season.id,
      { teamId: USER_TEAM_ID, alert: true }
    );
  }
}

module.exports = {
  evaluatePlayerValue,
  evaluateTradeForTeam,
  acceptanceMargin,
  shouldCpuAcceptTrade,
  explainTradeDecision,
  validateTrade,
  executeTrade,
  expireStaleTrades,
  generateCpuTradeOffers,
  rewriteOfferMessage,
};
