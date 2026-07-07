// El seed siempre crea el equipo del usuario como el primer registro
// (id=1, gracias a RESTART IDENTITY en el TRUNCATE).
module.exports = {
  USER_TEAM_ID: 1,
  PRE_SEASON_DAYS: 15,
  OFFER_WINDOW_END_DAY: 3,
  GAMES_PER_SEASON: 30,
  MAX_ROSTER_SIZE: 25,
};
