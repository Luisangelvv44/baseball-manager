const prisma = require('../db/prisma');

const OFFER_WINDOW_END_DAY = 3;
const MAX_CONTRACTS_PER_COMPANY = 2;
const GAMES_PER_SEASON = 30;

// Umbral mínimo de reputación para recibir oferta de una empresa.
// Proporcional al precio de la empresa dentro de su tipo.
function computeMinReputation(company) {
  const price = Number(company.price_per_fan);
  if (company.type === 'TV') {
    return Math.round((price / 0.5) * 75);
  }
  return Math.round((price / 0.08) * 50);
}

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

    const minReputation = computeMinReputation(company);

    const eligibleTeams = await prisma.team.findMany({
      where: {
        ...(excludedIds.length > 0 ? { id: { notIn: excludedIds } } : {}),
        reputation: { gte: minReputation },
      },
    });

    for (const team of eligibleTeams) {
      const seasons = Math.floor(Math.random() * 3) + 1;
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

  const maxTvPrice = 0.5000;
  const maxRadioPrice = 0.0800;

  for (const offer of pendingOffers) {
    if (offer.team.is_user_team) continue;

    const maxPrice = offer.company.type === 'TV' ? maxTvPrice : maxRadioPrice;
    let prob = 0.3 + (Number(offer.company.price_per_fan) / maxPrice) * 0.5;
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
  // Evita que múltiples empresas firmen al mismo equipo en la misma ronda
  const signedTeamIds = new Set();

  for (const company of companies) {
    const activeCount = await prisma.broadcastContract.count({
      where: { company_id: company.id, seasons_remaining: { gt: 0 } },
    });
    const slotsAvailable = MAX_CONTRACTS_PER_COMPANY - activeCount;
    if (slotsAvailable <= 0) continue;

    const acceptedOffers = await prisma.broadcastOffer.findMany({
      where: { company_id: company.id, season_id: season.id, status: 'ACCEPTED' },
      include: {
        team: { select: { fan_base: true, reputation: true, is_user_team: true } },
      },
    });

    const scored = acceptedOffers.map((offer) => ({
      ...offer,
      score: offer.team.fan_base * (Number(offer.price_per_fan) / Number(company.price_per_fan))
             + offer.team.reputation * 500,
    }));
    scored.sort((a, b) => b.score - a.score);

    // Filtrar equipos que ya fueron firmados en esta ronda
    const eligible = scored.filter((o) => !signedTeamIds.has(o.team_id));
    const toSign = eligible.slice(0, slotsAvailable);

    for (const offer of toSign) {
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

      // Pago inmediato de la primera temporada cubierta por el contrato
      const lumpSum = Math.round(offer.team.fan_base * Number(offer.price_per_fan) * GAMES_PER_SEASON);
      if (lumpSum > 0) {
        await prisma.team.update({
          where: { id: offer.team_id },
          data: { budget: { increment: lumpSum } },
        });

        if (offer.team.is_user_team) {
          await prisma.finance.create({
            data: {
              team_id: offer.team_id,
              season_day: season.current_day,
              type: 'broadcast_revenue',
              amount: lumpSum,
              description: `Contrato de transmisión - ${company.name} (temporada actual)`,
            },
          });
        }
      }
    }

    // Expirar las aceptadas no seleccionadas
    const notSigned = eligible.slice(slotsAvailable);
    // También expirar las filtradas por ya haber firmado con otra empresa
    const alreadySigned = scored.filter((o) => signedTeamIds.has(o.team_id) && !toSign.includes(o));
    for (const offer of [...notSigned, ...alreadySigned]) {
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
  const signedTeamIdsList = [...signedTeamIds];
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

// Paga ingresos de transmisión a todos los equipos con contrato activo al inicio de cada temporada.
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
