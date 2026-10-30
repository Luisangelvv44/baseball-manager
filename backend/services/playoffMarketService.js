const prisma = require('../db/prisma');
const {
  USER_TEAM_ID,
  PLAYOFF_MARKET_DAYS,
  PLAYOFF_MARKET_MIN_PCT,
  PLAYOFF_MARKET_MAX_PCT,
  PLAYOFF_MARKET_MIN_RAISE_PCT,
  PLAYOFF_MARKET_MAX_SIGNINGS_PER_TEAM,
  PLAYOFF_MARKET_CPU_MIN_UPGRADE,
  PLAYOFF_MARKET_CPU_BID_PROB,
} = require('../config');
const { getQualifiedTeamIds } = require('./playoffService');
const { createNews } = require('./newsService');

// Mercado de playoffs: al terminar la temporada regular (antes de armar el bracket) se abre
// una subasta de PLAYOFF_MARKET_DAYS dias con todos los jugadores de Mayores de los equipos
// eliminados. Solo pujan los clasificados, en % del salario anual del jugador (50%-150%); la
// mejor puja al cierre se lleva al jugador para los playoffs, paga ese monto una sola vez y el
// jugador vuelve a su equipo al terminar los playoffs (returnPlayoffLoans, al inicio del cierre
// de temporada). El contrato (Contract) no cambia: sigue siendo del equipo de origen.
//
// Los % se manejan en puntos enteros (50-150) para evitar errores de coma flotante.

const MIN_POINTS = Math.round(PLAYOFF_MARKET_MIN_PCT * 100);
const MAX_POINTS = Math.round(PLAYOFF_MARKET_MAX_PCT * 100);
const RAISE_POINTS = Math.round(PLAYOFF_MARKET_MIN_RAISE_PCT * 100);

const toPoints = (pct) => Math.round(Number(pct) * 100);
const fullName = (p) => `${p.first_name} ${p.last_name}`;

function bidAmount(salary, points) {
  return Math.round((Number(salary) * points) / 100);
}

// Puntos minimos para superar la mejor puja actual (o abrir la subasta).
function minNextPoints(topBid) {
  return topBid ? Math.min(MAX_POINTS, toPoints(topBid.pct) + RAISE_POINTS) : MIN_POINTS;
}

async function getOpenPlayoffMarket(seasonId) {
  return prisma.playoffMarket.findFirst({ where: { season_id: seasonId, status: 'open' } });
}

// Mejor puja por subasta: mayor %, y a igual % la mas antigua (id menor).
function topBidsByLoan(bids) {
  const top = new Map();
  for (const b of bids) {
    const current = top.get(b.loan_id);
    if (!current || toPoints(b.pct) > toPoints(current.pct)
      || (toPoints(b.pct) === toPoints(current.pct) && b.id < current.id)) {
      top.set(b.loan_id, b);
    }
  }
  return top;
}

async function loadMarketBids(marketId) {
  return prisma.playoffLoanBid.findMany({
    where: { loan: { market_id: marketId, status: 'open' } },
    select: { id: true, loan_id: true, team_id: true, pct: true, amount: true },
    orderBy: { id: 'asc' },
  });
}

// Lo que un equipo ya tiene comprometido: pujas que va ganando en este momento.
function commitmentsOf(teamId, topByLoan) {
  let count = 0;
  let amount = 0;
  for (const b of topByLoan.values()) {
    if (b.team_id === teamId) {
      count++;
      amount += Number(b.amount);
    }
  }
  return { count, amount };
}

// Abre el mercado al terminar la temporada regular. Devuelve null si no hay nada que subastar
// (el llamador arma el bracket directamente). Idempotente por temporada.
async function openPlayoffMarket(season, { rng = Math.random } = {}) {
  const existing = await prisma.playoffMarket.findUnique({ where: { season_id: season.id } });
  if (existing) return existing.status === 'open' ? existing : null;

  const qualifiedIds = await getQualifiedTeamIds();
  const players = await prisma.player.findMany({
    where: {
      team_id: { notIn: qualifiedIds, not: null },
      status: 'active',
      level: 'MAJOR',
    },
    select: { id: true, team_id: true },
  });
  if (qualifiedIds.length === 0 || players.length === 0) return null;

  const day = season.current_day;
  const market = await prisma.playoffMarket.create({
    data: {
      season_id: season.id,
      opened_day: day,
      closes_on_day: day + PLAYOFF_MARKET_DAYS,
      qualified_team_ids: qualifiedIds,
    },
  });
  await prisma.playoffLoan.createMany({
    data: players.map((p) => ({ market_id: market.id, player_id: p.id, from_team_id: p.team_id })),
  });

  await createNews(
    'playoff_market',
    `Abre el mercado de playoffs: ${players.length} jugadores de equipos eliminados disponibles durante ${PLAYOFF_MARKET_DAYS} dias`,
    day,
    season.id,
    { alert: qualifiedIds.includes(USER_TEAM_ID) }
  );

  // Primera ronda de la CPU para que el usuario vea competencia desde el dia 1
  await runCpuPlayoffMarketBidding(season, market, { rng });
  return market;
}

// Valida y registra una puja. Lanza Error con mensaje para el usuario si no es valida.
async function placePlayoffLoanBid({ market, loanId, teamId, pct, seasonDay }) {
  if (!market || market.status !== 'open') throw new Error('El mercado de playoffs no esta abierto');
  if (!market.qualified_team_ids.includes(teamId)) {
    throw new Error('Solo los equipos clasificados a playoffs pueden pujar');
  }

  const points = Math.round(Number(pct) * 100);
  if (!Number.isFinite(points) || points < MIN_POINTS || points > MAX_POINTS) {
    throw new Error(`La puja debe estar entre ${MIN_POINTS}% y ${MAX_POINTS}% del salario`);
  }

  const loan = await prisma.playoffLoan.findUnique({
    where: { id: loanId },
    include: { player: { select: { id: true, position: true, current_skill: true, salary: true, team_id: true } } },
  });
  if (!loan || loan.market_id !== market.id || loan.status !== 'open') {
    throw new Error('Este jugador no esta disponible en el mercado de playoffs');
  }
  if (loan.from_team_id === teamId) throw new Error('No puedes pujar por tu propio jugador');

  const bids = await loadMarketBids(market.id);
  const topByLoan = topBidsByLoan(bids);
  const top = topByLoan.get(loan.id);
  if (top?.team_id === teamId) throw new Error('Ya vas ganando esta subasta');
  if (top && toPoints(top.pct) >= MAX_POINTS) {
    throw new Error(`La puja ya esta en el maximo (${MAX_POINTS}%); se la queda quien llego primero`);
  }
  const minPoints = minNextPoints(top);
  if (points < minPoints) throw new Error(`La puja minima es ${minPoints}% del salario`);

  // "Mejor que lo que ya tienes": debe superar a tu jugador mas debil de esa posicion
  const weakest = await prisma.player.findFirst({
    where: { team_id: teamId, status: 'active', level: 'MAJOR', position: loan.player.position },
    orderBy: { current_skill: 'asc' },
    select: { current_skill: true },
  });
  if (weakest && loan.player.current_skill <= weakest.current_skill) {
    throw new Error('Solo puedes reforzarte con jugadores mejores que los que ya tienes en esa posicion');
  }

  const { count, amount: committed } = commitmentsOf(teamId, topByLoan);
  const signed = await prisma.playoffLoan.count({ where: { market_id: market.id, to_team_id: teamId, status: 'signed' } });
  if (count + signed >= PLAYOFF_MARKET_MAX_SIGNINGS_PER_TEAM) {
    throw new Error(`Maximo ${PLAYOFF_MARKET_MAX_SIGNINGS_PER_TEAM} refuerzos de playoffs (contando las pujas que vas ganando)`);
  }

  const amount = bidAmount(loan.player.salary, points);
  const team = await prisma.team.findUnique({ where: { id: teamId }, select: { budget: true } });
  if (Number(team.budget) - committed < amount) {
    throw new Error('Presupuesto insuficiente (contando las pujas que vas ganando)');
  }

  return prisma.playoffLoanBid.create({
    data: { loan_id: loan.id, team_id: teamId, pct: points / 100, amount, season_day: seasonDay },
  });
}

// Una ronda de pujas de los equipos CPU clasificados. Cada equipo busca jugadores que superen a
// su titular (el mejor sano de la posicion) por PLAYOFF_MARKET_CPU_MIN_UPGRADE, ordenados por
// mejora, y puja hasta un % maximo que crece con la mejora y su indice de desesperacion.
async function runCpuPlayoffMarketBidding(season, market, { rng = Math.random } = {}) {
  const cpuTeamIds = market.qualified_team_ids.filter((id) => id !== USER_TEAM_ID);
  if (cpuTeamIds.length === 0) return 0;

  const [loans, bids, teams, rosters, signedLoans] = await Promise.all([
    prisma.playoffLoan.findMany({
      where: { market_id: market.id, status: 'open' },
      select: {
        id: true, from_team_id: true,
        player: { select: { position: true, current_skill: true, salary: true, injury_days_remaining: true } },
      },
    }),
    loadMarketBids(market.id),
    prisma.team.findMany({ where: { id: { in: cpuTeamIds } }, select: { id: true, budget: true, desperation_index: true } }),
    prisma.player.findMany({
      where: { team_id: { in: cpuTeamIds }, status: 'active', level: 'MAJOR', injury_days_remaining: { lte: 0 } },
      select: { team_id: true, position: true, current_skill: true },
    }),
    prisma.playoffLoan.findMany({
      where: { market_id: market.id, status: 'signed', to_team_id: { in: cpuTeamIds } },
      select: { to_team_id: true },
    }),
  ]);

  const topByLoan = topBidsByLoan(bids);
  const bestByTeamPos = {};
  for (const p of rosters) {
    bestByTeamPos[p.team_id] ??= {};
    bestByTeamPos[p.team_id][p.position] = Math.max(bestByTeamPos[p.team_id][p.position] ?? -Infinity, p.current_skill);
  }
  const loanById = new Map(loans.map((l) => [l.id, l]));

  // Orden aleatorio para que ningun equipo tenga ventaja fija en cada ronda
  const order = [...teams].sort(() => rng() - 0.5);
  let placed = 0;

  for (const team of order) {
    const { count, amount: committed } = commitmentsOf(team.id, topByLoan);
    let slots = PLAYOFF_MARKET_MAX_SIGNINGS_PER_TEAM - count - signedLoans.filter((l) => l.to_team_id === team.id).length;
    if (slots <= 0) continue;
    let available = Number(team.budget) - committed;

    // Posiciones que ya va cubriendo con una puja ganadora: no duplica
    const coveredPositions = new Set();
    for (const [loanId, b] of topByLoan) {
      if (b.team_id === team.id) coveredPositions.add(loanById.get(loanId)?.player.position);
    }

    const best = bestByTeamPos[team.id] ?? {};
    const candidates = loans
      .filter((l) => l.from_team_id !== team.id && l.player.injury_days_remaining <= 0)
      .map((l) => ({ loan: l, gain: l.player.current_skill - (best[l.player.position] ?? 0) }))
      .filter((c) => c.gain >= PLAYOFF_MARKET_CPU_MIN_UPGRADE && !coveredPositions.has(c.loan.player.position))
      .sort((a, b) => b.gain - a.gain);

    for (const { loan, gain } of candidates) {
      if (slots <= 0) break;
      if (coveredPositions.has(loan.player.position)) continue;
      const top = topByLoan.get(loan.id);
      if (top?.team_id === team.id) continue;
      if (rng() > PLAYOFF_MARKET_CPU_BID_PROB) continue;
      if (top && toPoints(top.pct) >= MAX_POINTS) continue;

      const willingness = Math.min(MAX_POINTS, Math.round(
        MIN_POINTS + gain * 2.5 + Number(team.desperation_index) * 15 + rng() * 20
      ));
      const needed = minNextPoints(top);
      if (needed > willingness) continue;
      const points = Math.min(willingness, needed + Math.floor(rng() * 11));
      const amount = bidAmount(loan.player.salary, points);
      if (amount > available) continue;

      const bid = await prisma.playoffLoanBid.create({
        data: { loan_id: loan.id, team_id: team.id, pct: points / 100, amount, season_day: season.current_day },
      });
      topByLoan.set(loan.id, { id: bid.id, loan_id: loan.id, team_id: team.id, pct: points / 100, amount });
      available -= amount;
      slots--;
      coveredPositions.add(loan.player.position);
      placed++;
    }
  }
  return placed;
}

// Cierra el mercado: cada jugador se va con la mejor puja que el equipo todavia pueda pagar.
async function closePlayoffMarket(season, market) {
  const loans = await prisma.playoffLoan.findMany({
    where: { market_id: market.id, status: 'open' },
    include: {
      player: { select: { id: true, first_name: true, last_name: true, team_id: true, status: true, jersey_number: true, jersey_team_id: true } },
      bids: { orderBy: { id: 'asc' }, include: { team: { select: { id: true, name: true } } } },
      from_team: { select: { name: true } },
    },
  });

  const budgets = new Map();
  const signedCount = new Map();
  const signings = [];

  for (const loan of loans) {
    const ranked = [...loan.bids].sort((a, b) => toPoints(b.pct) - toPoints(a.pct) || a.id - b.id);
    const stillAvailable = loan.player.status === 'active' && loan.player.team_id === loan.from_team_id;
    let winner = null;
    if (stillAvailable) {
      for (const bid of ranked) {
        if (!budgets.has(bid.team_id)) {
          const t = await prisma.team.findUnique({ where: { id: bid.team_id }, select: { budget: true } });
          budgets.set(bid.team_id, Number(t.budget));
        }
        if ((signedCount.get(bid.team_id) ?? 0) >= PLAYOFF_MARKET_MAX_SIGNINGS_PER_TEAM) continue;
        if (budgets.get(bid.team_id) < Number(bid.amount)) continue;
        winner = bid;
        break;
      }
    }

    if (!winner) {
      await prisma.playoffLoan.update({ where: { id: loan.id }, data: { status: 'unsold' } });
      continue;
    }

    const amount = Number(winner.amount);
    budgets.set(winner.team_id, budgets.get(winner.team_id) - amount);
    signedCount.set(winner.team_id, (signedCount.get(winner.team_id) ?? 0) + 1);

    await prisma.team.update({ where: { id: winner.team_id }, data: { budget: { decrement: amount } } });
    if (winner.team_id === USER_TEAM_ID) {
      await prisma.finance.create({
        data: {
          team_id: USER_TEAM_ID,
          season_day: season.current_day,
          type: 'playoff_loan',
          amount: -amount,
          description: `Refuerzo de playoffs: ${fullName(loan.player)} (${toPoints(winner.pct)}% del salario)`,
        },
      });
    }
    await prisma.player.update({
      where: { id: loan.player.id },
      data: { team_id: winner.team_id, on_loan_from_team_id: loan.from_team_id },
    });
    await prisma.playoffLoan.update({
      where: { id: loan.id },
      data: {
        status: 'signed',
        to_team_id: winner.team_id,
        pct: winner.pct,
        amount,
        signed_day: season.current_day,
        original_jersey_number: loan.player.jersey_number,
        original_jersey_team_id: loan.player.jersey_team_id,
      },
    });
    signings.push({ loan, winner });

    const involvesUser = winner.team_id === USER_TEAM_ID || loan.from_team_id === USER_TEAM_ID;
    await createNews(
      'playoff_market',
      `${winner.team.name} se refuerza para los playoffs con ${fullName(loan.player)} (cedido por ${loan.from_team.name}, ${toPoints(winner.pct)}% de su salario)`,
      season.current_day,
      season.id,
      { teamId: winner.team_id, alert: involvesUser }
    );
  }

  await prisma.playoffMarket.update({ where: { id: market.id }, data: { status: 'closed' } });
  return { signed: signings.length };
}

// Un dia del mercado (lo llama advance-day mientras esta abierto). El ultimo dia cierra sin
// ronda CPU, asi el usuario siempre tiene la oportunidad de responder a las ultimas pujas.
async function runPlayoffMarketDay(season, market, { rng = Math.random } = {}) {
  const nextDay = season.current_day + 1;
  if (nextDay >= market.closes_on_day) {
    const { signed } = await closePlayoffMarket({ ...season, current_day: nextDay }, market);
    return { closed: true, signed, daysLeft: 0 };
  }
  await runCpuPlayoffMarketBidding({ ...season, current_day: nextDay }, market, { rng });
  return { closed: false, signed: 0, daysLeft: market.closes_on_day - nextDay };
}

// Devuelve los cedidos a su equipo. Corre al inicio del cierre de temporada, antes de
// contratos, recortes de roster CPU e impuesto al lujo (todos leen Player.team_id).
async function returnPlayoffLoans(season) {
  const loans = await prisma.playoffLoan.findMany({
    where: { status: 'signed', market: { season_id: season.id } },
    select: { id: true, player_id: true, from_team_id: true, to_team_id: true, original_jersey_number: true, original_jersey_team_id: true },
  });
  for (const loan of loans) {
    await prisma.teamLineup.deleteMany({ where: { team_id: loan.to_team_id, player_id: loan.player_id } });
    await prisma.player.update({
      where: { id: loan.player_id },
      data: {
        team_id: loan.from_team_id,
        on_loan_from_team_id: null,
        level: 'MAJOR',
        jersey_number: loan.original_jersey_number,
        jersey_team_id: loan.original_jersey_team_id,
      },
    });
    await prisma.playoffLoan.update({ where: { id: loan.id }, data: { status: 'returned', returned_at: new Date() } });
  }
  return loans.length;
}

// Vista para la pagina del mercado (equipo del usuario).
async function getPlayoffMarketView(season, teamId = USER_TEAM_ID) {
  const market = await prisma.playoffMarket.findUnique({ where: { season_id: season.id } });
  if (!market) return { market: null, listings: [], myLoans: [] };

  const [loans, bids, myRoster] = await Promise.all([
    prisma.playoffLoan.findMany({
      where: { market_id: market.id },
      include: {
        player: {
          select: {
            id: true, first_name: true, last_name: true, age: true, growth_age: true, position: true,
            current_skill: true, salary: true, injury_days_remaining: true,
          },
        },
        from_team: { select: { id: true, name: true } },
        to_team: { select: { id: true, name: true } },
      },
      orderBy: { id: 'asc' },
    }),
    loadMarketBids(market.id),
    prisma.player.findMany({
      where: { team_id: teamId, status: 'active', level: 'MAJOR' },
      select: { position: true, current_skill: true },
    }),
  ]);

  const teams = await prisma.team.findMany({ select: { id: true, name: true } });
  const teamName = new Map(teams.map((t) => [t.id, t.name]));
  const topByLoan = topBidsByLoan(bids);
  const myBids = new Map();
  for (const b of bids) {
    if (b.team_id === teamId && (!myBids.has(b.loan_id) || toPoints(b.pct) > toPoints(myBids.get(b.loan_id).pct))) {
      myBids.set(b.loan_id, b);
    }
  }

  const myByPos = {};
  for (const p of myRoster) {
    const cur = myByPos[p.position] ?? { best: -Infinity, worst: Infinity };
    myByPos[p.position] = { best: Math.max(cur.best, p.current_skill), worst: Math.min(cur.worst, p.current_skill) };
  }

  const listings = loans
    .filter((l) => l.status === 'open')
    .map((l) => {
      const top = topByLoan.get(l.id);
      const mine = myByPos[l.player.position];
      return {
        id: l.id,
        player: l.player,
        from_team: l.from_team,
        top_bid: top ? { pct: toPoints(top.pct), amount: Number(top.amount), team: { id: top.team_id, name: teamName.get(top.team_id) } } : null,
        my_bid: myBids.has(l.id) ? { pct: toPoints(myBids.get(l.id).pct), amount: Number(myBids.get(l.id).amount) } : null,
        min_next_pct: minNextPoints(top),
        my_best_at_position: mine ? mine.best : null,
        my_worst_at_position: mine ? mine.worst : null,
      };
    });

  const myLoans = loans
    .filter((l) => l.status !== 'open' && l.status !== 'unsold' && (l.to_team_id === teamId || l.from_team_id === teamId))
    .map((l) => ({
      id: l.id,
      status: l.status,
      direction: l.to_team_id === teamId ? 'in' : 'out',
      player: l.player,
      from_team: l.from_team,
      to_team: l.to_team,
      pct: l.pct != null ? toPoints(l.pct) : null,
      amount: l.amount != null ? Number(l.amount) : null,
    }));

  const { count, amount } = commitmentsOf(teamId, topByLoan);
  return {
    market: {
      id: market.id,
      status: market.status,
      opened_day: market.opened_day,
      closes_on_day: market.closes_on_day,
      days_left: Math.max(0, market.closes_on_day - season.current_day),
      user_qualified: market.qualified_team_ids.includes(teamId),
      min_pct: MIN_POINTS,
      max_pct: MAX_POINTS,
      raise_pct: RAISE_POINTS,
      max_signings: PLAYOFF_MARKET_MAX_SIGNINGS_PER_TEAM,
      my_leading_count: count,
      my_committed: amount,
    },
    listings,
    myLoans,
  };
}

module.exports = {
  getOpenPlayoffMarket,
  openPlayoffMarket,
  placePlayoffLoanBid,
  runCpuPlayoffMarketBidding,
  closePlayoffMarket,
  runPlayoffMarketDay,
  returnPlayoffLoans,
  getPlayoffMarketView,
};
