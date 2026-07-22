const prisma = require('../db/prisma');
const { USER_TEAM_ID, MAX_ROSTER_SIZE } = require('../config');
const { createNews } = require('./newsService');

function calculateGrowthCoefficient(player) {
  const yearsLeft = Math.max(0, player.growth_age - player.age);
  return (player.potential_coefficient * yearsLeft) / 100;
}

const PROJECTION_MARGIN = 5;        // margen sobre el techo proyectado, en puntos de current_skill
const OBVIOUS_UPGRADE_GAP = 10;     // diferencia de current_skill que salta la proyeccion por completo
const GROWTH_RATE = 0.075;          // valor esperado del multiplicador 0.05-0.10 que usa fluctuatePlayerSkills
const RELEASE_PENALTY_RATE = 0.30;  // 30% del salario anual por cada anio de contrato restante al cortar

// Proyecta el "techo" de current_skill que un jugador podria alcanzar en los proximos
// `years`, usando el mismo modelo de crecimiento/declive que fluctuatePlayerSkills
// (playerService.js): crece mientras age < growth_age, declina despues. Devuelve el pico
// alcanzado en ese horizonte, no el valor final.
function projectPeakSkill(player, years) {
  let skill = player.current_skill;
  let age = player.age;
  let peak = skill;
  for (let i = 0; i < years; i++) {
    const delta = age < player.growth_age
      ? Math.round(player.potential_coefficient * GROWTH_RATE)
      : -Math.round(player.potential_coefficient * GROWTH_RATE);
    skill = Math.min(100, skill + delta);
    age += 1;
    if (skill > peak) peak = skill;
  }
  return peak;
}

// Snapshot en lote: jugador activo mas debil por equipo+posicion, EXCLUYENDO
// rookie_contract (nunca se cortan prospectos en desarrollo). Solo para decidir
// elegibilidad de puja, no se usa para el release real.
async function buildWeakestByTeamPosition(client, teamIds) {
  if (teamIds.length === 0) return {};
  const rosterPlayers = await client.player.findMany({
    where: { team_id: { in: teamIds }, status: 'active', rookie_contract: false },
    select: {
      id: true, team_id: true, position: true, current_skill: true,
      age: true, growth_age: true, potential_coefficient: true, contract_years_remaining: true,
    },
  });
  const map = {};
  for (const p of rosterPlayers) {
    map[p.team_id] ??= {};
    const current = map[p.team_id][p.position];
    if (!current || p.current_skill < current.current_skill) map[p.team_id][p.position] = p;
  }
  return map;
}

// true si no hay nadie cortable en esa posicion (rookies no cuentan = necesidad real); o si
// la diferencia de current_skill ya es obvia (>= OBVIOUS_UPGRADE_GAP), en cuyo caso se corta
// directo sin mirar proyeccion de crecimiento; o si, en el caso mas parejo, el techo
// proyectado del agente libre (durante `incomingYears`) supera claramente al techo
// proyectado del jugador actual (durante lo que le queda de contrato).
function isClearRosterUpgrade(weakestAtPosition, incomingPlayer, incomingYears) {
  if (!weakestAtPosition) return true;
  if (incomingPlayer.current_skill - weakestAtPosition.current_skill >= OBVIOUS_UPGRADE_GAP) return true;
  const currentCeiling = projectPeakSkill(weakestAtPosition, weakestAtPosition.contract_years_remaining);
  const incomingCeiling = projectPeakSkill(incomingPlayer, incomingYears);
  return incomingCeiling - currentCeiling >= PROJECTION_MARGIN;
}

// Recalculo EN VIVO (sin snapshot) del jugador activo mas debil de un equipo en una
// posicion, excluyendo rookie_contract. Se usa solo al cerrar la subasta.
async function findWeakestRosterPlayer(client, teamId, position) {
  return client.player.findFirst({
    where: { team_id: teamId, status: 'active', position, rookie_contract: false },
    orderBy: { current_skill: 'asc' },
    select: {
      id: true, current_skill: true, age: true, growth_age: true,
      potential_coefficient: true, contract_years_remaining: true, salary: true,
    },
  });
}

async function createAuctionsForFreeAgents(tx, season) {
  const client = tx || prisma;

  const freeAgents = await client.player.findMany({
    where: { status: 'free_agent' },
    select: { id: true },
  });
  if (freeAgents.length === 0) return 0;

  const playerIds = freeAgents.map((p) => p.id);

  const existing = await client.freeAgentAuction.findMany({
    where: { status: 'active', season_id: season.id, player_id: { in: playerIds } },
    select: { player_id: true },
  });
  const alreadyAuctioned = new Set(existing.map((a) => a.player_id));

  const toCreate = playerIds.filter((id) => !alreadyAuctioned.has(id));
  if (toCreate.length === 0) return 0;

  await client.freeAgentAuction.createMany({
    data: toCreate.map((playerId) => ({
      player_id: playerId,
      season_id: season.id,
      status: 'active',
      start_day: season.current_day,
      last_bid_day: null,
      closes_on_day: null,
    })),
  });

  return toCreate.length;
}

async function runCpuBidding(tx, season) {
  const client = tx || prisma;
  const currentDay = season.current_day;

  const activeAuctions = await client.freeAgentAuction.findMany({
    where: {
      status: 'active',
      season_id: season.id,
      OR: [{ closes_on_day: null }, { closes_on_day: { gt: currentDay } }],
    },
    include: {
      player: true,
      bids: { orderBy: { amount: 'desc' }, take: 1 },
    },
  });
  if (activeAuctions.length === 0) return;

  const cpuTeams = await client.team.findMany({
    where: { is_user_team: false },
    select: {
      id: true,
      budget: true,
      bid_aggressiveness: true,
      min_growth_threshold: true,
    },
  });

  // Shuffle CPU teams so bidding order varies each day
  cpuTeams.sort(() => Math.random() - 0.5);

  // Pre-fetch roster counts so we can skip full teams (max MAX_ROSTER_SIZE players)
  const rosterCounts = await client.player.groupBy({
    by: ['team_id'],
    where: { team_id: { in: cpuTeams.map((t) => t.id) }, status: 'active' },
    _count: { id: true },
  });
  const countMap = Object.fromEntries(rosterCounts.map((r) => [r.team_id, r._count.id]));

  // Pre-fetch total annual salary per CPU team to check long-term affordability
  const salaryTotals = await client.player.groupBy({
    by: ['team_id'],
    where: { team_id: { in: cpuTeams.map((t) => t.id) }, status: 'active' },
    _sum: { salary: true },
  });
  const salaryMap = Object.fromEntries(
    salaryTotals.map((r) => [r.team_id, Number(r._sum.salary ?? 0)])
  );

  // Build pending commitment maps: auctions where a CPU team is currently the highest bidder
  const activeAuctionsSnapshot = await client.freeAgentAuction.findMany({
    where: {
      status: 'active',
      season_id: season.id,
      OR: [{ closes_on_day: null }, { closes_on_day: { gt: currentDay } }],
    },
    include: {
      bids: { orderBy: { amount: 'desc' }, take: 1 },
    },
  });

  const pendingSalaryMap = {};
  const pendingCountMap = {};

  for (const auc of activeAuctionsSnapshot) {
    if (auc.bids.length === 0) continue;
    const topBid = auc.bids[0];
    const tid = topBid.team_id;
    pendingSalaryMap[tid] = (pendingSalaryMap[tid] ?? 0) + Number(topBid.amount);
    pendingCountMap[tid] = (pendingCountMap[tid] ?? 0) + 1;
  }

  const weakestByTeamPosition = await buildWeakestByTeamPosition(client, cpuTeams.map((t) => t.id));
  const releaseReliantBids = new Set(); // `${teamId}:${position}` ya comprometido a un release ese dia

  for (const auction of activeAuctions) {
    const player = auction.player;
    const growthCoeff = calculateGrowthCoefficient(player);
    const topBid = auction.bids[0] ?? null;
    const currentHighest = topBid ? Number(topBid.amount) : 0;
    const currentLeaderId = topBid ? topBid.team_id : null;
    const floor = Math.max(Number(player.salary), currentHighest);

    for (const team of cpuTeams) {
      if (team.id === currentLeaderId) continue;

      const yearsCap = Math.min(5, 40 - player.age);
      const tentativeYears = 1 + Math.floor(Math.random() * yearsCap);

      const weakestAtPosition = weakestByTeamPosition[team.id]?.[player.position] ?? null;
      const isUpgrade = isClearRosterUpgrade(weakestAtPosition, player, tentativeYears);
      const meetsGrowthAppetite = growthCoeff >= team.min_growth_threshold;
      if (!meetsGrowthAppetite && !isUpgrade) continue;

      const pendingCount = pendingCountMap[team.id] ?? 0;
      const hasRosterSpace = (countMap[team.id] ?? 0) + pendingCount < MAX_ROSTER_SIZE;
      const releaseKey = `${team.id}:${player.position}`;
      if (!hasRosterSpace && (!isUpgrade || releaseReliantBids.has(releaseKey))) continue;

      const existingSalary = salaryMap[team.id] ?? 0;
      const pendingSalary = pendingSalaryMap[team.id] ?? 0;
      if (existingSalary + pendingSalary + Number(player.salary) > Number(team.budget)) continue;

      const maxWilling = Number(team.budget) * team.bid_aggressiveness;
      if (maxWilling < Number(player.salary)) continue;

      const increment = 0.05 + Math.random() * 0.05;
      const proposed = Math.round(floor * (1 + increment));

      if (proposed > maxWilling) continue;

      const years = tentativeYears;

      await client.auctionBid.create({
        data: {
          auction_id: auction.id,
          team_id: team.id,
          amount: proposed,
          years,
          season_day: currentDay,
        },
      });

      await client.freeAgentAuction.update({
        where: { id: auction.id },
        data: {
          last_bid_day: currentDay,
          closes_on_day: currentDay + 5,
        },
      });

      if (!hasRosterSpace) releaseReliantBids.add(releaseKey);
      pendingSalaryMap[team.id] = (pendingSalaryMap[team.id] ?? 0) + proposed;
      pendingCountMap[team.id] = (pendingCountMap[team.id] ?? 0) + 1;
      break; // one CPU bid per auction per day
    }
  }
}

async function closeExpiredAuctions(tx, season) {
  const client = tx || prisma;
  const currentDay = season.current_day;

  const expired = await client.freeAgentAuction.findMany({
    where: { status: 'active', closes_on_day: { lte: currentDay } },
    include: {
      player: true,
      bids: {
        orderBy: { amount: 'desc' },
        distinct: ['team_id'],
      },
    },
  });

  let closed = 0;

  for (const auction of expired) {
    if (auction.bids.length === 0) {
      await client.freeAgentAuction.update({
        where: { id: auction.id },
        data: { status: 'cancelled' },
      });
      continue;
    }

    let resolved = false;
    for (const bid of auction.bids) {
      const winnerTeam = await client.team.findUnique({ where: { id: bid.team_id } });
      const signingBonus = Math.round(Number(bid.amount) * 0.1);
      if (Number(winnerTeam.budget) < signingBonus) continue;

      const signed = await _signPlayerToTeam(client, auction, bid.team_id, Number(bid.amount), bid.years, season);
      if (signed) {
        resolved = true;
        closed++;
        break;
      }
    }

    if (!resolved) {
      await client.freeAgentAuction.update({
        where: { id: auction.id },
        data: { status: 'cancelled' },
      });
    }
  }

  return closed;
}

// Si el equipo (no-usuario) esta al tope, intenta liberar a su jugador mas debil de esa
// posicion (nunca un rookie) para hacer espacio. Devuelve false si no se puede hacer de
// forma coherente (nadie cortable en esa posicion, o ya no es mejora clara).
async function _makeRoomIfNeeded(client, teamId, incomingPlayer, incomingYears) {
  const activeCount = await client.player.count({ where: { team_id: teamId, status: 'active' } });
  if (activeCount < MAX_ROSTER_SIZE) return true;

  const weakest = await findWeakestRosterPlayer(client, teamId, incomingPlayer.position);
  if (!weakest) return false;
  if (!isClearRosterUpgrade(weakest, incomingPlayer, incomingYears)) return false;

  const releasePenalty = Math.round(
    Number(weakest.salary) * RELEASE_PENALTY_RATE * Math.max(0, weakest.contract_years_remaining)
  );

  const team = await client.team.findUnique({ where: { id: teamId }, select: { budget: true } });
  if (Number(team.budget) < releasePenalty) return false;

  await client.teamLineup.deleteMany({ where: { player_id: weakest.id } });
  await client.player.update({ where: { id: weakest.id }, data: { team_id: null, status: 'free_agent' } });

  if (releasePenalty > 0) {
    await client.team.update({ where: { id: teamId }, data: { budget: { decrement: releasePenalty } } });
  }

  return true;
}

async function _signPlayerToTeam(client, auction, teamId, amount, years, season) {
  if (teamId !== USER_TEAM_ID) {
    const madeRoom = await _makeRoomIfNeeded(client, teamId, auction.player, years);
    if (!madeRoom) return false;
  }

  const signingBonus = Math.round(amount * 0.2);

  await client.player.update({
    where: { id: auction.player_id },
    data: {
      team_id: teamId,
      status: 'active',
      salary: amount,
      contract_years_remaining: years,
    },
  });

  await client.team.update({
    where: { id: teamId },
    data: { budget: { decrement: signingBonus } },
  });

  await client.freeAgentAuction.update({
    where: { id: auction.id },
    data: { status: 'closed', winning_team_id: teamId },
  });

  if (teamId === USER_TEAM_ID) {
    await client.finance.create({
      data: {
        team_id: USER_TEAM_ID,
        season_day: season.current_day,
        type: 'signing',
        amount: -signingBonus,
        description: `Bono de firma (subasta): ${auction.player.first_name} ${auction.player.last_name}`,
      },
    });
  }

  const signingTeam = await client.team.findUnique({ where: { id: teamId }, select: { name: true } });
  const amtM = (amount / 1_000_000).toFixed(2);
  await createNews('auction',
    `${signingTeam.name} ganó la subasta de ${auction.player.first_name} ${auction.player.last_name}: ${years} año(s), $${amtM}M/año`,
    season.current_day,
    season.id
  );

  return true;
}

async function cancelAllActiveAuctions(tx) {
  const client = tx || prisma;
  await client.freeAgentAuction.updateMany({
    where: { status: 'active' },
    data: { status: 'cancelled' },
  });
}

module.exports = {
  calculateGrowthCoefficient,
  projectPeakSkill,
  createAuctionsForFreeAgents,
  runCpuBidding,
  closeExpiredAuctions,
  cancelAllActiveAuctions,
};
