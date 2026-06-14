const prisma = require('../db/prisma');

const OFFER_WINDOW_END_DAY = 3;
const MAX_CONTRACTS_PER_COMPANY = 2;
const GAMES_PER_SEASON = 30;

// Genera ofertas de todas las empresas para los equipos elegibles
// y procesa las respuestas automáticas de equipos CPU.
async function generateOffersForSeason(season) {
  const companies = await prisma.broadcastCompany.findMany();

  for (const company of companies) {
    const activeCount = await prisma.broadcastContract.count({
      where: { company_id: company.id, seasons_remaining: { gt: 0 } },
    });
    const slotsAvailable = MAX_CONTRACTS_PER_COMPANY - activeCount;
    if (slotsAvailable <= 0) continue;

    // Equipos elegibles: sin contrato activo y sin oferta de esta empresa esta temporada
    const teamsWithContract = await prisma.broadcastContract.findMany({
      where: { seasons_remaining: { gt: 0 } },
      select: { team_id: true },
    });
    const contractedTeamIds = teamsWithContract.map((c) => c.team_id);

    const teamsAlreadyOffered = await prisma.broadcastOffer.findMany({
      where: { company_id: company.id, season_id: season.id },
      select: { team_id: true },
    });
    const offeredTeamIds = teamsAlreadyOffered.map((o) => o.team_id);

    const excludedIds = [...new Set([...contractedTeamIds, ...offeredTeamIds])];

    const eligibleTeams = await prisma.team.findMany({
      where: excludedIds.length > 0 ? { id: { notIn: excludedIds } } : {},
    });

    for (const team of eligibleTeams) {
      const seasons = Math.floor(Math.random() * 3) + 1; // 1-3 temporadas
      await prisma.broadcastOffer.create({
        data: {
          company_id: company.id,
          team_id: team.id,
          season_id: season.id,
          seasons,
          price_per_fan: company.price_per_fan,
          status: 'PENDING',
          expires_day: OFFER_WINDOW_END_DAY,
        },
      });
    }
  }
}

// Equipos CPU responden inmediatamente a sus ofertas pendientes
async function processCpuTeamResponses(season) {
  const pendingOffers = await prisma.broadcastOffer.findMany({
    where: { season_id: season.id, status: 'PENDING' },
    include: {
      team: { select: { id: true, is_user_team: true, reputation: true } },
      company: { select: { type: true, price_per_fan: true } },
    },
  });

  // Precio máximo por tipo para calcular probabilidad relativa
  const maxTvPrice = 0.5000;
  const maxRadioPrice = 0.0800;

  for (const offer of pendingOffers) {
    if (offer.team.is_user_team) continue; // el usuario decide manualmente

    const maxPrice = offer.company.type === 'TV' ? maxTvPrice : maxRadioPrice;
    let prob = 0.3 + (Number(offer.company.price_per_fan) / maxPrice) * 0.5;
    // Equipos con alta reputación son más exigentes
    if (offer.team.reputation > 70) prob *= 0.8;

    const accept = Math.random() < prob;
    await prisma.broadcastOffer.update({
      where: { id: offer.id },
      data: { status: accept ? 'ACCEPTED' : 'REJECTED' },
    });
  }
}

// Empresas seleccionan las mejores ofertas aceptadas y crean contratos.
// Se llama cuando el día avanza de OFFER_WINDOW_END_DAY a OFFER_WINDOW_END_DAY+1.
async function finalizeContracts(season) {
  const companies = await prisma.broadcastCompany.findMany();

  for (const company of companies) {
    const activeCount = await prisma.broadcastContract.count({
      where: { company_id: company.id, seasons_remaining: { gt: 0 } },
    });
    const slotsAvailable = MAX_CONTRACTS_PER_COMPANY - activeCount;
    if (slotsAvailable <= 0) continue;

    const acceptedOffers = await prisma.broadcastOffer.findMany({
      where: { company_id: company.id, season_id: season.id, status: 'ACCEPTED' },
      include: {
        team: { select: { fan_base: true, reputation: true } },
      },
    });

    // Ordenar por score: más fans + buena reputación
    const scored = acceptedOffers.map((offer) => ({
      ...offer,
      score: offer.team.fan_base * (Number(offer.price_per_fan) / Number(company.price_per_fan))
             + offer.team.reputation * 500,
    }));
    scored.sort((a, b) => b.score - a.score);

    const toSign = scored.slice(0, slotsAvailable);
    const signedTeamIds = new Set();

    for (const offer of toSign) {
      // Crear contrato
      await prisma.broadcastContract.create({
        data: {
          company_id: company.id,
          team_id: offer.team_id,
          seasons_total: offer.seasons,
          seasons_remaining: offer.seasons,
          price_per_fan: offer.price_per_fan,
          signed_season_id: season.id,
        },
      });
      await prisma.broadcastOffer.update({
        where: { id: offer.id },
        data: { status: 'SIGNED' },
      });
      signedTeamIds.add(offer.team_id);
    }

    // Expirar las aceptadas no seleccionadas
    const notSigned = scored.slice(slotsAvailable);
    for (const offer of notSigned) {
      await prisma.broadcastOffer.update({
        where: { id: offer.id },
        data: { status: 'EXPIRED' },
      });
    }
  }

  // Expirar todas las PENDING restantes de esta temporada
  await prisma.broadcastOffer.updateMany({
    where: { season_id: season.id, status: 'PENDING' },
    data: { status: 'EXPIRED' },
  });

  // Para equipos que firmaron contrato, expirar sus demás ofertas pendientes/aceptadas
  const signedContracts = await prisma.broadcastContract.findMany({
    where: { signed_season_id: season.id },
    select: { team_id: true },
  });
  const signedTeamIdsList = signedContracts.map((c) => c.team_id);
  if (signedTeamIdsList.length > 0) {
    await prisma.broadcastOffer.updateMany({
      where: {
        season_id: season.id,
        team_id: { in: signedTeamIdsList },
        status: { in: ['PENDING', 'ACCEPTED'] },
      },
      data: { status: 'EXPIRED' },
    });
  }
}

// Paga ingresos de transmisión a todos los equipos con contrato activo.
// Se llama al inicio de cada temporada cubierta.
async function payBroadcastRevenue(season) {
  const contracts = await prisma.broadcastContract.findMany({
    where: { seasons_remaining: { gt: 0 } },
    include: { team: { select: { id: true, fan_base: true, name: true } } },
  });

  for (const contract of contracts) {
    const lumpSum = Math.round(contract.team.fan_base * Number(contract.price_per_fan) * GAMES_PER_SEASON);
    if (lumpSum <= 0) continue;

    await prisma.team.update({
      where: { id: contract.team_id },
      data: { budget: { increment: lumpSum } },
    });

    // Solo registrar finanza para el equipo del usuario
    const team = await prisma.team.findUnique({
      where: { id: contract.team_id },
      select: { is_user_team: true },
    });
    if (team.is_user_team) {
      const company = await prisma.broadcastCompany.findUnique({
        where: { id: contract.company_id },
        select: { name: true },
      });
      await prisma.finance.create({
        data: {
          team_id: contract.team_id,
          season_day: season.current_day,
          type: 'broadcast_revenue',
          amount: lumpSum,
          description: `Contrato de transmisión - ${company.name}`,
        },
      });
    }
  }
}

// Decrementa seasons_remaining de todos los contratos activos al fin de temporada
async function decrementContractSeasons() {
  await prisma.broadcastContract.updateMany({
    where: { seasons_remaining: { gt: 0 } },
    data: { seasons_remaining: { decrement: 1 } },
  });
}

module.exports = {
  generateOffersForSeason,
  processCpuTeamResponses,
  finalizeContracts,
  payBroadcastRevenue,
  decrementContractSeasons,
  OFFER_WINDOW_END_DAY,
};
