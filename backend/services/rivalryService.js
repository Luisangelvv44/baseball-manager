const prisma = require('../db/prisma');
const {
  RIVALRY_DIVISION_SEED,
  RIVALRY_BASE_GAME_BONUS,
  RIVALRY_CLOSE_MARGIN,
  RIVALRY_CLOSE_GAME_BONUS,
  RIVALRY_PLAYOFF_BONUS,
  RIVALRY_STREAK_THRESHOLD,
  RIVALRY_STREAK_BONUS,
  RIVALRY_MIN,
  RIVALRY_MAX,
  RIVALRY_SEASON_DECAY,
} = require('../config');

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

// Orden canonico del par: siempre team_a_id < team_b_id, asi solo existe una fila por par de equipos.
function canonicalPair(teamAId, teamBId) {
  return teamAId < teamBId ? [teamAId, teamBId] : [teamBId, teamAId];
}

async function getOrCreateRivalry(teamAId, teamBId) {
  const [aId, bId] = canonicalPair(teamAId, teamBId);
  let rivalry = await prisma.rivalry.findUnique({
    where: { team_a_id_team_b_id: { team_a_id: aId, team_b_id: bId } },
  });
  if (!rivalry) {
    const [teamA, teamB] = await Promise.all([
      prisma.team.findUnique({ where: { id: aId }, select: { division_id: true } }),
      prisma.team.findUnique({ where: { id: bId }, select: { division_id: true } }),
    ]);
    const sameDivision = teamA?.division_id != null && teamA.division_id === teamB?.division_id;
    rivalry = await prisma.rivalry.create({
      data: {
        team_a_id: aId,
        team_b_id: bId,
        intensity: sameDivision ? RIVALRY_DIVISION_SEED : 0,
      },
    });
  }
  return rivalry;
}

// Actualiza la rivalidad tras un partido y devuelve la fila actualizada.
async function updateRivalryAfterGame({ homeTeamId, awayTeamId, homeScore, awayScore, isPlayoff, dayNumber, seasonId }) {
  const rivalry = await getOrCreateRivalry(homeTeamId, awayTeamId);
  const winnerId = homeScore > awayScore ? homeTeamId : awayTeamId;
  const margin = Math.abs(homeScore - awayScore);

  const winnerIsA = winnerId === rivalry.team_a_id;
  const streakContinues = rivalry.last_winner_id === winnerId;
  const nextStreakLen = streakContinues ? rivalry.streak_len + 1 : 1;

  let delta = RIVALRY_BASE_GAME_BONUS;
  if (margin <= RIVALRY_CLOSE_MARGIN) delta += RIVALRY_CLOSE_GAME_BONUS;
  if (isPlayoff) delta += RIVALRY_PLAYOFF_BONUS;
  if (nextStreakLen >= RIVALRY_STREAK_THRESHOLD) delta += RIVALRY_STREAK_BONUS;

  const nextIntensity = clamp(rivalry.intensity + delta, RIVALRY_MIN, RIVALRY_MAX);

  return prisma.rivalry.update({
    where: { id: rivalry.id },
    data: {
      wins_a: winnerIsA ? { increment: 1 } : undefined,
      wins_b: winnerIsA ? undefined : { increment: 1 },
      intensity: nextIntensity,
      last_winner_id: winnerId,
      streak_len: nextStreakLen,
      last_meeting_day: dayNumber ?? null,
      last_meeting_season_id: seasonId ?? null,
    },
  });
}

// Lectura simple para el hook de economia; 0 si el par todavia no tiene historial.
async function getRivalryIntensity(teamAId, teamBId) {
  const [aId, bId] = canonicalPair(teamAId, teamBId);
  const rivalry = await prisma.rivalry.findUnique({
    where: { team_a_id_team_b_id: { team_a_id: aId, team_b_id: bId } },
    select: { intensity: true },
  });
  return rivalry?.intensity ?? 0;
}

// Decaimiento de fin de temporada: sin enfrentamientos nuevos, la rivalidad se enfria.
async function applySeasonDecay() {
  const rivalries = await prisma.rivalry.findMany({ select: { id: true, intensity: true } });
  await Promise.all(
    rivalries.map((r) =>
      prisma.rivalry.update({
        where: { id: r.id },
        data: { intensity: clamp(r.intensity - RIVALRY_SEASON_DECAY, RIVALRY_MIN, RIVALRY_MAX) },
      })
    )
  );
}

async function listTopRivalries(limit = 20) {
  const rivalries = await prisma.rivalry.findMany({
    orderBy: { intensity: 'desc' },
    take: limit,
    include: {
      team_a: { select: { id: true, name: true } },
      team_b: { select: { id: true, name: true } },
    },
  });
  return rivalries;
}

async function getTeamRivalries(teamId) {
  const id = Number(teamId);
  const rivalries = await prisma.rivalry.findMany({
    where: { OR: [{ team_a_id: id }, { team_b_id: id }] },
    orderBy: { intensity: 'desc' },
    include: {
      team_a: { select: { id: true, name: true } },
      team_b: { select: { id: true, name: true } },
    },
  });
  return rivalries;
}

module.exports = {
  canonicalPair,
  getOrCreateRivalry,
  updateRivalryAfterGame,
  getRivalryIntensity,
  applySeasonDecay,
  listTopRivalries,
  getTeamRivalries,
};
