const prisma = require('../db/prisma');
const { USER_TEAM_ID, MAX_ROSTER_SIZE } = require('../config');
const { createNews } = require('./newsService');

function calculateGrowthCoefficient(player) {
  const yearsLeft = Math.max(0, player.growth_age - player.age);
  return (player.potential_coefficient * yearsLeft) / 100;
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

  for (const auction of activeAuctions) {
    const player = auction.player;
    const growthCoeff = calculateGrowthCoefficient(player);
    const topBid = auction.bids[0] ?? null;
    const currentHighest = topBid ? Number(topBid.amount) : 0;
    const currentLeaderId = topBid ? topBid.team_id : null;
    const floor = Math.max(Number(player.salary), currentHighest);

    for (const team of cpuTeams) {
      if (team.id === currentLeaderId) continue;
      if (growthCoeff < team.min_growth_threshold) continue;
      const pendingCount = pendingCountMap[team.id] ?? 0;
      if ((countMap[team.id] ?? 0) + pendingCount >= MAX_ROSTER_SIZE) continue;

      const existingSalary = salaryMap[team.id] ?? 0;
      const pendingSalary = pendingSalaryMap[team.id] ?? 0;
      if (existingSalary + pendingSalary + Number(player.salary) > Number(team.budget)) continue;

      const maxWilling = Number(team.budget) * team.bid_aggressiveness;
      if (maxWilling < Number(player.salary)) continue;

      const increment = 0.05 + Math.random() * 0.05;
      const proposed = Math.round(floor * (1 + increment));

      if (proposed > maxWilling) continue;

      const yearsCap = Math.min(5, 40 - player.age);
      const years = 1 + Math.floor(Math.random() * yearsCap);

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
      if (Number(winnerTeam.budget) >= signingBonus) {
        await _signPlayerToTeam(client, auction, bid.team_id, Number(bid.amount), bid.years, season);
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

async function _signPlayerToTeam(client, auction, teamId, amount, years, season) {
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
  createAuctionsForFreeAgents,
  runCpuBidding,
  closeExpiredAuctions,
  cancelAllActiveAuctions,
};
