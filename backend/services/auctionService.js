const prisma = require('../db/prisma');
const { USER_TEAM_ID } = require('../config');

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

      const maxWilling = Number(team.budget) * team.bid_aggressiveness;
      if (maxWilling < Number(player.salary)) continue;

      const increment = 0.05 + Math.random() * 0.05;
      const proposed = Math.round(floor * (1 + increment));

      if (proposed > maxWilling) continue;

      await client.auctionBid.create({
        data: {
          auction_id: auction.id,
          team_id: team.id,
          amount: proposed,
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
        await _signPlayerToTeam(client, auction, bid.team_id, Number(bid.amount), season);
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

async function _signPlayerToTeam(client, auction, teamId, amount, season) {
  const signingBonus = Math.round(amount * 0.1);

  await client.player.update({
    where: { id: auction.player_id },
    data: {
      team_id: teamId,
      status: 'active',
      salary: amount,
      contract_years_remaining: 1,
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
