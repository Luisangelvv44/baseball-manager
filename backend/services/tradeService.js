const prisma = require('../db/prisma');
const { USER_TEAM_ID, MAX_ROSTER_SIZE, TRADE_DEADLINE_DAY, TRADE_OFFER_EXPIRY_DAYS } = require('../config');
const { calculateGrowthCoefficient, projectPeakSkill } = require('./auctionService');
const { createNews } = require('./newsService');

const ACCEPT_TOLERANCE_BASE = 0.10;  // tolerancia base a un trade ligeramente desfavorable, escala con bid_aggressiveness
const CPU_OFFER_CHANCE = 0.05;       // probabilidad diaria de que un equipo CPU genere una oferta al usuario
const SURPLUS_SKILL_MARGIN = 5;      // ventaja minima de current_skill que debe tener el jugador pedido al usuario

// Valor de un jugador desde la optica de quien lo adquiere: produccion actual + upside
// proyectado sobre lo que le queda de contrato, menos costo salarial y riesgo de edad.
function evaluatePlayerValue(player) {
  const horizonYears = Math.max(1, player.contract_years_remaining || 1);
  const growthCoeff = calculateGrowthCoefficient(player);
  const peakSkill = projectPeakSkill(player, horizonYears);
  const skillValue = player.current_skill * 1000;
  const upsideValue = Math.max(0, peakSkill - player.current_skill) * growthCoeff * 500;
  const salaryCost = Number(player.salary) * horizonYears;
  const ageRisk = player.age > 34 ? (player.age - 34) * 5000 : 0;
  return skillValue + upsideValue - salaryCost * 0.15 - ageRisk;
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

function shouldCpuAcceptTrade(cpuTeam, trade) {
  const netValue = evaluateTradeForTeam(cpuTeam.id, trade);
  const totalValue = trade.items.reduce((s, i) => s + evaluatePlayerValue(i.player), 0) || 1;
  // mas agresivo = mas tolerante a un trade ligeramente desfavorable (arriesga mas)
  const tolerance = ACCEPT_TOLERANCE_BASE * (1 + cpuTeam.bid_aggressiveness);
  return netValue >= -tolerance * totalValue;
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

  const [proposerRosterCount, recipientRosterCount, proposerTeam, recipientTeam] = await Promise.all([
    client.player.count({ where: { team_id: trade.proposer_team_id, level: 'MAJOR', status: 'active' } }),
    client.player.count({ where: { team_id: trade.recipient_team_id, level: 'MAJOR', status: 'active' } }),
    client.team.findUnique({ where: { id: trade.proposer_team_id }, select: { budget: true } }),
    client.team.findUnique({ where: { id: trade.recipient_team_id }, select: { budget: true } }),
  ]);

  const proposerAfter = proposerRosterCount - proposerItems.length + recipientItems.length;
  const recipientAfter = recipientRosterCount - recipientItems.length + proposerItems.length;
  if (proposerAfter > MAX_ROSTER_SIZE || recipientAfter > MAX_ROSTER_SIZE) {
    return { ok: false, error: `El traspaso dejaría a algún equipo por encima del máximo de ${MAX_ROSTER_SIZE} jugadores` };
  }

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

  await createNews('trade',
    `${proposerTeam.name} y ${recipientTeam.name} completaron un traspaso`,
    season.current_day,
    season.id
  );
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
    select: { id: true, name: true, budget: true },
  });

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
      if (candidate) { targetPlayer = candidate; break; }
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
      },
    });

    await client.tradeItem.createMany({
      data: [
        { trade_id: trade.id, player_id: surplusPlayer.id, from_team_id: cpuTeam.id },
        { trade_id: trade.id, player_id: targetPlayer.id, from_team_id: USER_TEAM_ID },
      ],
    });

    await createNews('trade',
      `${cpuTeam.name} propuso un traspaso buscando reforzar su plantel`,
      season.current_day,
      season.id
    );
  }
}

module.exports = {
  evaluatePlayerValue,
  evaluateTradeForTeam,
  shouldCpuAcceptTrade,
  validateTrade,
  executeTrade,
  expireStaleTrades,
  generateCpuTradeOffers,
};
