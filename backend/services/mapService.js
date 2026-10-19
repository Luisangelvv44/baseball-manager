const prisma = require('../db/prisma');
const { USER_TEAM_ID } = require('../config');

// Nombre de la ciudad = nombre del equipo sin la ultima palabra (la mascota).
// "Brisko Wolves" -> "Brisko", "Ostrava Bay Comets" -> "Ostrava Bay".
function cityName(teamName) {
  const words = String(teamName ?? '').trim().split(/\s+/).filter(Boolean);
  return words.length > 1 ? words.slice(0, -1).join(' ') : words.join(' ');
}

const userGameWhere = (seasonId) => ({
  season_id: seasonId,
  OR: [{ home_team_id: USER_TEAM_ID }, { away_team_id: USER_TEAM_ID }],
});

const gameSelect = {
  id: true, day_number: true, home_team_id: true, away_team_id: true, status: true, playoff_series_id: true,
};

// Estado del mapa: ciudades, donde esta el equipo del usuario (sede del ultimo partido jugado de la
// temporada en curso, o su propia ciudad si aun no jugo) y su proximo partido. Con `gameId`, el
// "proximo partido" es ese (lo usa la animacion de viaje justo despues de avanzar el dia).
async function getMapState({ gameId } = {}) {
  const [teams, season] = await Promise.all([
    prisma.team.findMany({ include: { division: true }, orderBy: { id: 'asc' } }),
    prisma.season.findFirst({ where: { status: { in: ['active', 'playoffs'] } }, orderBy: { id: 'desc' } }),
  ]);

  const wantedId = Number(gameId);
  const byId = Number.isInteger(wantedId) && wantedId > 0;
  let lastGame = null;
  let nextGame = null;
  if (season) {
    [lastGame, nextGame] = await Promise.all([
      prisma.gameSchedule.findFirst({
        where: { ...userGameWhere(season.id), status: 'finished' },
        orderBy: [{ day_number: 'desc' }, { id: 'desc' }],
        select: gameSelect,
      }),
      byId
        ? prisma.gameSchedule.findFirst({ where: { ...userGameWhere(season.id), id: wantedId }, select: gameSelect })
        : prisma.gameSchedule.findFirst({
          where: { ...userGameWhere(season.id), status: { not: 'finished' } },
          orderBy: [{ day_number: 'asc' }, { id: 'asc' }],
          select: gameSelect,
        }),
    ]);
  }

  return {
    userTeamId: USER_TEAM_ID,
    currentDay: season?.current_day ?? null,
    currentCityTeamId: lastGame?.home_team_id ?? USER_TEAM_ID,
    lastGame: lastGame ? { ...lastGame, is_playoff: lastGame.playoff_series_id != null } : null,
    nextGame: nextGame ? { ...nextGame, is_playoff: nextGame.playoff_series_id != null } : null,
    teams: teams.map((t) => ({
      id: t.id,
      name: t.name,
      city: cityName(t.name),
      division_id: t.division_id,
      division_name: t.division?.name ?? null,
      wins: t.wins,
      losses: t.losses,
      reputation: t.reputation,
      fan_base: t.fan_base,
      is_user_team: t.id === USER_TEAM_ID,
    })),
  };
}

module.exports = { cityName, getMapState };
