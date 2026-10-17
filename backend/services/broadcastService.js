const prisma = require('../db/prisma');
const {
  USER_TEAM_ID,
  GAMES_PER_SEASON,
  BROADCAST_OFFER_WINDOW_END_DAY,
  BROADCAST_MAX_OFFER_SHARE_OF_MONEY,
  BROADCAST_EARN_PER_FAN_MIN,
  BROADCAST_EARN_PER_FAN_MAX,
  BROADCAST_EARN_REP_WEIGHT,
  BROADCAST_RADIO_EARN_FACTOR,
  BROADCAST_MAX_BID_SHARE_OF_EARNINGS,
  BROADCAST_BID_RAISE_PROB,
  BROADCAST_BID_RAISE_MIN,
  BROADCAST_BID_RAISE_MAX,
  BROADCAST_MAX_CONTRACT_YEARS,
  BROADCAST_RANK_TIERS,
} = require('../config');

// ---------------------------------------------------------------------------------------------
// Guerra de precios de las transmisoras:
//  - Al iniciar la temporada cada empresa ofrece (precio base) a los equipos de su nivel de reputacion.
//  - Dias 1-10: cada dia las empresas superadas suben su precio por fan/partido (hasta su tope).
//  - El usuario firma cuando quiera dentro de la ventana; los CPU firman el dia 10 con la mejor oferta.
//  - Cada equipo puede tener 1 contrato de TV y 1 de radio. El total se paga en partes iguales por año.
//  - Las empresas ganan dinero por partido segun el fan_base y la reputacion de sus equipos.
// ---------------------------------------------------------------------------------------------

const round4 = (n) => Math.round(n * 10000) / 10000;

// 1 = equipo con mas reputacion de la liga, 0 = el de menos (por puesto, no por valor).
function repFactorFromRank(rank, teamCount) {
  if (teamCount <= 1) return 1;
  return Math.max(0, Math.min(1, 1 - (rank - 1) / (teamCount - 1)));
}

// Lo que gana una empresa por fan y por partido con un equipo. rand en [0, 1).
function earningsRatePerFan(repFactor, type, rand) {
  const mix = BROADCAST_EARN_REP_WEIGHT * repFactor + (1 - BROADCAST_EARN_REP_WEIGHT) * rand;
  const rate = BROADCAST_EARN_PER_FAN_MIN + (BROADCAST_EARN_PER_FAN_MAX - BROADCAST_EARN_PER_FAN_MIN) * mix;
  return type === 'RADIO' ? rate * BROADCAST_RADIO_EARN_FACTOR : rate;
}

// Lo maximo que una empresa ofrece por fan/partido: un % de lo que espera ganar (aleatorio en su media).
function maxBidPerFan(repFactor, type) {
  return Math.floor(earningsRatePerFan(repFactor, type, 0.5) * BROADCAST_MAX_BID_SHARE_OF_EARNINGS * 10000) / 10000;
}

// Años que propone la empresa: los equipos con mas reputacion reciben contratos mas largos.
function proposeYears(repFactor, rand) {
  const maxYears = 1 + Math.round((BROADCAST_MAX_CONTRACT_YEARS - 1) * repFactor);
  return Math.min(maxYears, 1 + Math.floor(rand * maxYears));
}

function contractTotal(price, fanBase, years) {
  return Math.round(price * fanBase * GAMES_PER_SEASON * years);
}

// Ajusta los años para que el total no pase del 40% del dinero de la empresa. null si ni 1 año cabe.
function fitOfferToMoney(price, fanBase, years, money) {
  const limit = Number(money) * BROADCAST_MAX_OFFER_SHARE_OF_MONEY;
  for (let y = years; y >= 1; y--) {
    const total = contractTotal(price, fanBase, y);
    if (total > 0 && total <= limit) return { years: y, total_value: total, annual_payment: Math.round(total / y) };
  }
  return null;
}

// Top N de reputacion al que ofrece la empresa en la posicion `index` (0 = la mas cara de su tipo).
function rankLimitFor(index) {
  return BROADCAST_RANK_TIERS[Math.min(index, BROADCAST_RANK_TIERS.length - 1)];
}

// Empresas ordenadas por precio base dentro de su tipo, con su nivel de reputacion (rank_limit).
async function getCompaniesWithTiers(args = {}) {
  const companies = await prisma.broadcastCompany.findMany({
    ...args,
    orderBy: [{ type: 'asc' }, { price_per_fan: 'desc' }, { id: 'asc' }],
  });
  const indexByType = {};
  return companies.map((c) => {
    const index = indexByType[c.type] ?? 0;
    indexByType[c.type] = index + 1;
    return { ...c, rank_limit: rankLimitFor(index) };
  });
}

// Equipos ordenados por reputacion (desempate fan_base), con su puesto y repFactor.
async function getReputationRanking() {
  const teams = await prisma.team.findMany({
    select: { id: true, name: true, fan_base: true, reputation: true, is_user_team: true },
    orderBy: [{ reputation: 'desc' }, { fan_base: 'desc' }, { id: 'asc' }],
  });
  return teams.map((t, i) => ({ ...t, rank: i + 1, repFactor: repFactorFromRank(i + 1, teams.length) }));
}

async function activeContractKeys() {
  const contracts = await prisma.broadcastContract.findMany({
    where: { seasons_remaining: { gt: 0 } },
    select: { team_id: true, company: { select: { type: true } } },
  });
  return new Set(contracts.map((c) => `${c.team_id}:${c.company.type}`));
}

// Ofertas iniciales de la temporada (precio base, limitado al tope de cada equipo).
async function generateOffersForSeason(season) {
  await prisma.broadcastCompany.updateMany({ data: { season_earnings: 0 } });

  const [companies, ranking, contracted] = await Promise.all([
    getCompaniesWithTiers(),
    getReputationRanking(),
    activeContractKeys(),
  ]);

  for (const company of companies) {
    for (const team of ranking) {
      if (team.rank > company.rank_limit) break;
      if (contracted.has(`${team.id}:${company.type}`)) continue;

      const price = round4(Math.min(Number(company.price_per_fan), maxBidPerFan(team.repFactor, company.type)));
      const fit = fitOfferToMoney(price, team.fan_base, proposeYears(team.repFactor, Math.random()), company.money);
      if (!fit) continue;

      await prisma.broadcastOffer.create({
        data: {
          company_id: company.id,
          team_id: team.id,
          season_id: season.id,
          seasons: fit.years,
          price_per_fan: price,
          total_value: fit.total_value,
          annual_payment: fit.annual_payment,
          status: 'PENDING',
          expires_day: BROADCAST_OFFER_WINDOW_END_DAY,
        },
      });
    }
  }
}

async function pendingOffers(seasonId) {
  return prisma.broadcastOffer.findMany({
    where: { season_id: seasonId, status: 'PENDING' },
    include: {
      company: { select: { id: true, name: true, type: true, money: true } },
      team: { select: { id: true, fan_base: true, is_user_team: true } },
    },
    orderBy: { id: 'asc' },
  });
}

function groupByMarket(offers) {
  const markets = new Map();
  for (const o of offers) {
    const key = `${o.team_id}:${o.company.type}`;
    if (!markets.has(key)) markets.set(key, []);
    markets.get(key).push(o);
  }
  return markets;
}

// Un dia de pujas: en cada guerra (equipo + tipo) las empresas superadas pueden subir su precio.
async function runBiddingRound(season) {
  const [offers, ranking] = await Promise.all([pendingOffers(season.id), getReputationRanking()]);
  const repFactorByTeam = new Map(ranking.map((t) => [t.id, t.repFactor]));

  for (const marketOffers of groupByMarket(offers).values()) {
    let best = Math.max(...marketOffers.map((o) => Number(o.price_per_fan)));
    const leaderId = marketOffers.find((o) => Number(o.price_per_fan) === best).id;
    const challengers = marketOffers.filter((o) => o.id !== leaderId).sort(() => Math.random() - 0.5);

    for (const offer of challengers) {
      if (Math.random() >= BROADCAST_BID_RAISE_PROB) continue;
      const cap = maxBidPerFan(repFactorByTeam.get(offer.team_id) ?? 0, offer.company.type);
      const raise = BROADCAST_BID_RAISE_MIN + Math.random() * (BROADCAST_BID_RAISE_MAX - BROADCAST_BID_RAISE_MIN);
      const price = round4(Math.min(cap, best * (1 + raise)));
      if (price <= best) continue; // ya no puede superar al lider

      const fit = fitOfferToMoney(price, offer.team.fan_base, offer.seasons, offer.company.money);
      if (!fit) continue;

      await prisma.broadcastOffer.update({
        where: { id: offer.id },
        data: {
          price_per_fan: price,
          seasons: fit.years,
          total_value: fit.total_value,
          annual_payment: fit.annual_payment,
          last_raised_day: season.current_day,
        },
      });
      best = price;
    }
  }
}

// Firma una oferta: crea el contrato, paga el primer año (empresa -> equipo) y expira las demas
// ofertas del mismo equipo y tipo.
async function signOffer(offer, season) {
  const annual = Number(offer.annual_payment);
  const contract = await prisma.broadcastContract.create({
    data: {
      company_id: offer.company_id,
      team_id: offer.team_id,
      seasons_total: offer.seasons,
      seasons_remaining: offer.seasons,
      price_per_fan: offer.price_per_fan,
      signed_season_id: season.id,
      total_value: offer.total_value,
      annual_payment: annual,
    },
  });
  await prisma.broadcastOffer.update({ where: { id: offer.id }, data: { status: 'SIGNED' } });

  await prisma.team.update({ where: { id: offer.team_id }, data: { budget: { increment: annual } } });
  await prisma.broadcastCompany.update({ where: { id: offer.company_id }, data: { money: { decrement: annual } } });

  if (offer.team_id === USER_TEAM_ID) {
    await prisma.finance.create({
      data: {
        team_id: offer.team_id,
        season_day: season.current_day,
        type: 'broadcast_revenue',
        amount: annual,
        description: `Contrato de transmisión ${offer.company.type} - ${offer.company.name} (año 1/${offer.seasons})`,
      },
    });
  }

  const siblings = await prisma.broadcastOffer.findMany({
    where: { season_id: season.id, team_id: offer.team_id, status: 'PENDING', company: { type: offer.company.type } },
    select: { id: true },
  });
  if (siblings.length > 0) {
    await prisma.broadcastOffer.updateMany({
      where: { id: { in: siblings.map((s) => s.id) } },
      data: { status: 'EXPIRED' },
    });
  }
  return contract;
}

// El usuario acepta una oferta: se firma al instante. Devuelve { error } si no es valida.
async function acceptUserOffer(offerId, season) {
  if (!season || season.status !== 'active') return { error: 'No hay temporada activa' };
  if (season.current_day > BROADCAST_OFFER_WINDOW_END_DAY) return { error: 'La ventana de negociación ya cerró' };

  const offer = await prisma.broadcastOffer.findUnique({
    where: { id: offerId },
    include: { company: { select: { id: true, name: true, type: true, money: true } } },
  });
  if (!offer || offer.team_id !== USER_TEAM_ID || offer.status !== 'PENDING' || offer.season_id !== season.id) {
    return { error: 'Oferta no válida' };
  }

  const active = await prisma.broadcastContract.findFirst({
    where: { team_id: USER_TEAM_ID, seasons_remaining: { gt: 0 }, company: { type: offer.company.type } },
  });
  if (active) {
    return { error: `Ya tienes un contrato de ${offer.company.type === 'TV' ? 'TV' : 'radio'} activo` };
  }
  if (Number(offer.total_value) > Number(offer.company.money) * BROADCAST_MAX_OFFER_SHARE_OF_MONEY) {
    return { error: `${offer.company.name} ya no tiene dinero suficiente para esta oferta` };
  }

  const contract = await signOffer(offer, season);
  return { contract };
}

// Dia 10: cada equipo CPU (por orden de reputacion) firma, por tipo, la oferta con mayor precio por fan
// que la empresa todavia pueda pagar (total <= 40% de su dinero en ese momento). El resto expira.
async function finalizeContracts(season) {
  const [offers, ranking, contracted] = await Promise.all([
    pendingOffers(season.id),
    getReputationRanking(),
    activeContractKeys(),
  ]);
  const rankByTeam = new Map(ranking.map((t) => [t.id, t.rank]));
  const moneyByCompany = new Map(offers.map((o) => [o.company_id, Number(o.company.money)]));

  const markets = [...groupByMarket(offers).entries()]
    .filter(([key, list]) => !list[0].team.is_user_team && !contracted.has(key))
    .sort(([, a], [, b]) => (rankByTeam.get(a[0].team_id) ?? 99) - (rankByTeam.get(b[0].team_id) ?? 99));

  for (const [, marketOffers] of markets) {
    const candidates = [...marketOffers].sort(
      (a, b) => Number(b.price_per_fan) - Number(a.price_per_fan) || Number(b.total_value) - Number(a.total_value)
    );
    const winner = candidates.find(
      (o) => Number(o.total_value) <= moneyByCompany.get(o.company_id) * BROADCAST_MAX_OFFER_SHARE_OF_MONEY
    );
    if (!winner) continue;
    await signOffer(winner, season);
    moneyByCompany.set(winner.company_id, moneyByCompany.get(winner.company_id) - Number(winner.annual_payment));
  }

  await prisma.broadcastOffer.updateMany({
    where: { season_id: season.id, status: 'PENDING' },
    data: { status: 'EXPIRED' },
  });
}

// Pago anual de los contratos vigentes al inicio de cada temporada (la empresa le paga al equipo).
// Contratos del sistema anterior (sin annual_payment) usan la formula vieja hasta vencer.
async function payBroadcastRevenue(season) {
  const contracts = await prisma.broadcastContract.findMany({
    where: { seasons_remaining: { gt: 0 } },
    include: {
      team: { select: { fan_base: true, is_user_team: true } },
      company: { select: { name: true, type: true } },
    },
  });

  for (const contract of contracts) {
    const amount = contract.annual_payment != null
      ? Number(contract.annual_payment)
      : Math.round(contract.team.fan_base * Number(contract.price_per_fan) * GAMES_PER_SEASON);
    if (amount <= 0) continue;

    await prisma.team.update({ where: { id: contract.team_id }, data: { budget: { increment: amount } } });
    await prisma.broadcastCompany.update({ where: { id: contract.company_id }, data: { money: { decrement: amount } } });

    if (contract.team.is_user_team) {
      const year = contract.seasons_total - contract.seasons_remaining + 1;
      await prisma.finance.create({
        data: {
          team_id: contract.team_id,
          season_day: season.current_day,
          type: 'broadcast_revenue',
          amount,
          description: `Contrato de transmisión ${contract.company.type} - ${contract.company.name} (año ${year}/${contract.seasons_total})`,
        },
      });
    }
  }
}

// Ganancia de las empresas por partido: fan_base x tasa (reputacion + aleatorio) por cada contrato vigente.
async function creditBroadcastEarnings(teamIds) {
  const contracts = await prisma.broadcastContract.findMany({
    where: { team_id: { in: teamIds }, seasons_remaining: { gt: 0 } },
    include: {
      team: { select: { fan_base: true, reputation: true } },
      company: { select: { type: true } },
    },
  });
  if (!contracts || contracts.length === 0) return;

  const teamCount = await prisma.team.count();
  const repFactorByTeam = new Map();
  for (const contract of contracts) {
    if (!repFactorByTeam.has(contract.team_id)) {
      const above = await prisma.team.count({ where: { reputation: { gt: contract.team.reputation } } });
      repFactorByTeam.set(contract.team_id, repFactorFromRank(above + 1, teamCount));
    }
    const rate = earningsRatePerFan(repFactorByTeam.get(contract.team_id), contract.company.type, Math.random());
    const amount = Math.round(contract.team.fan_base * rate);
    if (amount <= 0) continue;
    await prisma.broadcastCompany.update({
      where: { id: contract.company_id },
      data: { money: { increment: amount }, season_earnings: { increment: amount } },
    });
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
  repFactorFromRank,
  earningsRatePerFan,
  maxBidPerFan,
  proposeYears,
  fitOfferToMoney,
  rankLimitFor,
  getCompaniesWithTiers,
  generateOffersForSeason,
  runBiddingRound,
  acceptUserOffer,
  finalizeContracts,
  payBroadcastRevenue,
  creditBroadcastEarnings,
  decrementContractSeasons,
};
