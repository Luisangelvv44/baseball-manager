// El seed siempre crea el equipo del usuario como el primer registro
// (id=1, gracias a RESTART IDENTITY en el TRUNCATE).
module.exports = {
  USER_TEAM_ID: 1,
  PRE_SEASON_DAYS: 15,
  ROSTER_CHECK_DAY: 15, // mismo valor que PRE_SEASON_DAYS por diseno: ultimo dia de pre-temporada
  PLAYER_INVESTMENT_DAY: 14, // 2 dias antes del inicio de temporada regular (dia 16 = PRE_SEASON_DAYS + 1)
  OFFER_WINDOW_END_DAY: 3,
  GAMES_PER_MATCHUP: 3, // cada enfrentamiento del calendario base se juega esta cantidad de veces (dias consecutivos)
  GAMES_PER_SEASON: 90, // 30 dias del doble round-robin base x GAMES_PER_MATCHUP
  MAX_ROSTER_SIZE: 25,
  MAX_MINOR_ROSTER_SIZE: 15,
  AUCTION_DEADLINE_DAY: 60, // mitad de la temporada regular (15 pre-temporada + 45 de 90 dias de juego)
  CPU_REVENUE_PER_FAN_MIN: 100, // pago plano de fin de temporada por fan (equipos CPU)
  CPU_REVENUE_PER_FAN_MAX: 300,
  DRAFT_POOL_SIZE: 100,
  MARKET_PLAYER_CAP: 1250,
  LUXURY_TAX_PROJECTION_DAY: 60, // mitad de temporada (90 dias de juego / 105 dias totales con pre-temporada)
  TRADE_DEADLINE_DAY: 75, // dos tercios de la temporada regular (15 + 60 de 90 dias de juego)
  TRADE_OFFER_EXPIRY_DAYS: 5,
  DERBY_SWINGS_PER_ENTRY: 10,
  DERBY_BASE_HR_PROB: 0.15,
  DERBY_SKILL_COEFFICIENT: 0.006,
  DERBY_MIN_HR_PROB: 0.05,
  DERBY_MAX_HR_PROB: 0.75,
  DERBY_CPU_REWARD_MIN_PCT: 0.5,
  DERBY_CPU_REWARD_MAX_PCT: 1.0,
  DERBY_MAX_TIEBREAK_ROUNDS: 10,
  NEWS_NO_HITTER_MIN_INNINGS: 8,
  NEWS_PERFECT_GAME_MIN_INNINGS: 9,
  NEWS_MULTI_HR_THRESHOLD: 3,
  NEWS_EXTRA_INNINGS_THRESHOLD: 10,
  NEWS_STREAK_MILESTONE: 5,
  NEWS_STREAK_LOOKBACK_GAMES: 50,
  SEASON_AWARD_MIN_AB: 135, // ~1.5x GAMES_PER_SEASON: jugador debe haber bateado la mayor parte de la temporada
  SEASON_AWARD_MIN_IP: 60, // suficientes aperturas dado que un pitcher lanza el juego completo cuando le toca

  // ----- Programa de Toddlers (ver services/toddlerProgramService.js) -----
  TODDLER_PROGRAM_SEASONS: 10, // temporadas que dura un ciclo antes de la eleccion
  TODDLER_PROGRAM_SIZE: 32, // DEBE ser 16 equipos x TODDLER_PROGRAM_PICKS_PER_TEAM (todos los toddler se reparten)
  TODDLER_PROGRAM_PICKS_PER_TEAM: 2,
  TODDLER_PROGRAM_START_AGE: 8,
  TODDLER_PROGRAM_START_SKILL: -15,
  TODDLER_PROGRAM_CPU_CONTRIBUTION_RATE: 0.05, // solo equipos CPU; el usuario aporta manualmente lo que quiera
  TODDLER_PROGRAM_SKILL_COST: 1000000, // costo por punto de skill en una ronda de mejora
  TODDLER_PROGRAM_IMPROVE_PROB_START: 0.8, // prob. de mejora en la temporada 1
  TODDLER_PROGRAM_IMPROVE_PROB_STEP: 0.05, // temporada k (0-indexado): prob = START - STEP*k  -> 0.35 en k=9
  TODDLER_PROGRAM_IMPROVE_PROB_MIN: 0.05, // piso de seguridad
};
