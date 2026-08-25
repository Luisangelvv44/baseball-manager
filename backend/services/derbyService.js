const prisma = require('../db/prisma');
const {
  USER_TEAM_ID,
  DERBY_SWINGS_PER_ENTRY,
  DERBY_BASE_HR_PROB,
  DERBY_SKILL_COEFFICIENT,
  DERBY_MIN_HR_PROB,
  DERBY_MAX_HR_PROB,
  DERBY_CPU_REWARD_MIN_PCT,
  DERBY_CPU_REWARD_MAX_PCT,
  DERBY_MAX_TIEBREAK_ROUNDS,
} = require('../config');
const { createNews } = require('./newsService');
const { effectiveSkill } = require('./skillCurve');

// Probabilidad de jonron por swing en base a la destreza (current_skill) del bateador.
// A diferencia de atBatSimulator (bateador vs pitcher), aqui no hay pitcher rival: el
// derby usa una maquina de lanzamiento, asi que la probabilidad depende solo del bateador
// y es mucho mas alta que en un at-bat real.
//
// La brecha respecto al skill promedio (50) se mide en escala no lineal (skill^2) en vez
// de lineal, para que la ventaja de un bateador de elite se sienta mas marcada. El coeficiente
// se reescala por la derivada de skill^2 en skill=50 (2*50) para que el caso promedio
// (skill=50) siga dando exactamente DERBY_BASE_HR_PROB, igual que con la formula lineal anterior.
const DERBY_SKILL_SLOPE_AT_50 = 2 * 50;
const DERBY_EFFECTIVE_COEFFICIENT = DERBY_SKILL_COEFFICIENT / DERBY_SKILL_SLOPE_AT_50;

function swingHrProbability(skill) {
  const raw = DERBY_BASE_HR_PROB + (effectiveSkill(skill) - effectiveSkill(50)) * DERBY_EFFECTIVE_COEFFICIENT;
  return Math.min(DERBY_MAX_HR_PROB, Math.max(DERBY_MIN_HR_PROB, raw));
}

// Mejor jugador de posicion (no pitcher) disponible del roster MAJOR de un equipo.
// Devuelve null si el equipo no tiene ningun elegible (roster vacio o solo pitchers).
async function pickCpuEntrant(client, teamId) {
  return client.player.findFirst({
    where: { team_id: teamId, level: 'MAJOR', injury_days_remaining: 0, position: { not: 'P' } },
    orderBy: { current_skill: 'desc' },
  });
}

// Recompensa que un equipo CPU esta dispuesto a pagar a su propio jugador si gana:
// 50-100% del mismo techo (budget * bid_aggressiveness) que usan para topar pujas de subasta.
function computeCpuReward(team) {
  const maxWilling = Number(team.budget) * team.bid_aggressiveness;
  const pct = DERBY_CPU_REWARD_MIN_PCT + Math.random() * (DERBY_CPU_REWARD_MAX_PCT - DERBY_CPU_REWARD_MIN_PCT);
  return Math.round(maxWilling * pct);
}

async function createDerbyEvent({ playerId, rewardAmount }) {
  const season = await prisma.season.findFirst({ where: { status: 'active' } });
  if (!season) throw new Error('No hay una temporada activa');

  const userPlayer = await prisma.player.findUnique({ where: { id: playerId } });
  if (!userPlayer || userPlayer.team_id !== USER_TEAM_ID) {
    throw new Error('Jugador invalido');
  }
  if (userPlayer.level !== 'MAJOR' || userPlayer.injury_days_remaining > 0 || userPlayer.position === 'P') {
    throw new Error('Ese jugador no es elegible para el derby');
  }

  const userTeam = await prisma.team.findUnique({ where: { id: USER_TEAM_ID } });
  const reward = Math.round(Number(rewardAmount));
  if (!Number.isFinite(reward) || reward <= 0) {
    throw new Error('Monto de recompensa invalido');
  }
  if (reward > Number(userTeam.budget)) {
    throw new Error('No tienes presupuesto suficiente para esa recompensa');
  }

  const cpuTeams = await prisma.team.findMany({ where: { is_user_team: false } });

  const entriesData = [{ team_id: USER_TEAM_ID, player_id: userPlayer.id, reward_amount: reward }];
  for (const team of cpuTeams) {
    const entrant = await pickCpuEntrant(prisma, team.id);
    if (!entrant) continue;
    entriesData.push({
      team_id: team.id,
      player_id: entrant.id,
      reward_amount: computeCpuReward(team),
    });
  }

  const event = await prisma.homeRunDerbyEvent.create({
    data: {
      season_id: season.id,
      day: season.current_day,
      status: 'pending',
      entries: { create: entriesData },
    },
    include: {
      entries: {
        include: {
          team: { select: { id: true, name: true } },
          player: { select: { id: true, first_name: true, last_name: true, current_skill: true } },
        },
      },
    },
  });

  return event;
}

function rollSwings(count, skill, startTurn) {
  const swings = [];
  for (let i = 0; i < count; i++) {
    swings.push({ turn_number: startTurn + i, is_home_run: Math.random() < swingHrProbability(skill) });
  }
  return swings;
}

async function simulateDerbyEvent(eventId) {
  const event = await prisma.homeRunDerbyEvent.findUnique({
    where: { id: eventId },
    include: {
      entries: {
        include: {
          team: { select: { id: true, name: true } },
          player: { select: { id: true, first_name: true, last_name: true, current_skill: true } },
        },
      },
    },
  });
  if (!event) throw new Error('Evento no encontrado');
  if (event.status !== 'pending') throw new Error('Este derby ya fue simulado');

  const season = await prisma.season.findFirst({ where: { status: 'active' } });

  const allSwings = [];
  const homeRunsByEntry = {};
  let nextTurn = 1;

  for (const entry of event.entries) {
    const swings = rollSwings(DERBY_SWINGS_PER_ENTRY, entry.player.current_skill, nextTurn);
    nextTurn += swings.length;
    homeRunsByEntry[entry.id] = swings.filter((s) => s.is_home_run).length;
    for (const s of swings) allSwings.push({ event_id: event.id, entry_id: entry.id, ...s });
  }

  let bestCount = Math.max(...Object.values(homeRunsByEntry));
  let tied = event.entries.filter((e) => homeRunsByEntry[e.id] === bestCount);

  let rounds = 0;
  while (tied.length > 1 && rounds < DERBY_MAX_TIEBREAK_ROUNDS) {
    const roundResults = {};
    for (const entry of tied) {
      const swing = rollSwings(1, entry.player.current_skill, nextTurn)[0];
      nextTurn += 1;
      roundResults[entry.id] = swing.is_home_run ? 1 : 0;
      allSwings.push({ event_id: event.id, entry_id: entry.id, ...swing });
    }
    const roundBest = Math.max(...Object.values(roundResults));
    const roundWinners = tied.filter((e) => roundResults[e.id] === roundBest);
    if (roundWinners.length === 1) {
      tied = roundWinners;
      break;
    }
    tied = roundWinners;
    rounds += 1;
  }

  const winnerEntry = tied[Math.floor(Math.random() * tied.length)];

  await prisma.derbySwing.createMany({ data: allSwings });
  await Promise.all(
    event.entries.map((entry) =>
      prisma.derbyEntry.update({ where: { id: entry.id }, data: { home_runs: homeRunsByEntry[entry.id] } })
    )
  );

  await prisma.team.update({
    where: { id: winnerEntry.team_id },
    data: { budget: { decrement: Number(winnerEntry.reward_amount) } },
  });

  if (winnerEntry.team_id === USER_TEAM_ID) {
    await prisma.finance.create({
      data: {
        team_id: USER_TEAM_ID,
        season_day: season?.current_day ?? event.day,
        type: 'derby_reward',
        amount: -Number(winnerEntry.reward_amount),
        description: `Premio Home Run Derby: ${winnerEntry.player.first_name} ${winnerEntry.player.last_name}`,
      },
    });
  }

  const rewardM = (Number(winnerEntry.reward_amount) / 1_000_000).toFixed(2);
  await createNews(
    'derby',
    `${winnerEntry.player.first_name} ${winnerEntry.player.last_name} (${winnerEntry.team.name}) gana el Home Run Derby y recibe $${rewardM}M`,
    season?.current_day ?? event.day,
    season?.id ?? event.season_id
  );

  await prisma.homeRunDerbyEvent.update({
    where: { id: event.id },
    data: { status: 'completed', winner_entry_id: winnerEntry.id },
  });

  return prisma.homeRunDerbyEvent.findUnique({
    where: { id: event.id },
    include: {
      entries: {
        include: {
          team: { select: { id: true, name: true } },
          player: { select: { id: true, first_name: true, last_name: true, current_skill: true } },
        },
      },
      swings: { orderBy: { turn_number: 'asc' } },
    },
  });
}

module.exports = {
  swingHrProbability,
  pickCpuEntrant,
  computeCpuReward,
  createDerbyEvent,
  simulateDerbyEvent,
};
