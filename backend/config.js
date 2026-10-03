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
  // Contratos (services/contractService.js): bono que se paga cada vez que el jugador logra
  // una hazana (no-hitter, juego perfecto, ciclo, multi-HR, premio de temporada). El % del
  // salario anual escala lineal con demand_factor (0.00-3.00): exigencia 3.00 -> MAX_PCT.
  ACHIEVEMENT_BONUS_MAX_PCT: 0.03,
  CPU_ACHIEVEMENT_BONUS_MAX_PCT: 0.01, // tope para equipos CPU, para que no quiebren con estrellas
  ACHIEVEMENT_BONUS_SEASON_CAP_PCT: 0.15, // maximo cobrable por contrato y temporada, % del anual
  SEASON_AWARD_MIN_AB: 135, // ~1.5x GAMES_PER_SEASON: jugador debe haber bateado la mayor parte de la temporada
  SEASON_AWARD_MIN_IP: 60, // suficientes aperturas dado que un pitcher lanza el juego completo cuando le toca
  HISTORICAL_CPU_STAT_DIVISOR: 3, // en el ranking historico de carrera, los conteos (HR/H/RBI/W/K) de stints
                                  // que no son del equipo del usuario se ponderan por 1/este valor
                                  // (compensa que la CPU no rota pitchers: 90+ jgs vs ~25 del usuario)

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

  // ----- Banco y prestamos (ver services/bankService.js) -----
  LOAN_WINDOW_END_DAY: 10, // solo se puede pedir/originar prestamo en los primeros N dias de temporada
  LOAN_ELIGIBILITY_MIN_BUDGET: 10_000_000,
  LOAN_ELIGIBILITY_BUDGET_PCT_OF_SEC: 0.10, // budget < 10% de la capacidad de ganancia de temporada -> elegible
  LOAN_PCT_MIN: 0.30, // rango de monto solicitado, como % de la capacidad de ganancia de temporada (SEC)
  LOAN_PCT_MAX: 1.50,
  LOAN_MAX_TO_CAPACITY_RATIO: 1.0, // tope de solvencia del banco: prestamo aprobado <= este % de SEC (ajustado por liquidez)
  LOAN_MIN_CAUTION_FACTOR: 0.25, // piso del factor de cautela del banco aun con liquidez muy baja
  LOAN_MIN_VIABLE_AMOUNT: 100_000, // por debajo de esto, el banco rechaza en vez de prestar una miseria
  LOAN_RISK_PREMIUM_MAX: 0.15, // prima de tasa maxima por riesgo (monto aprobado / SEC)
  LOAN_LIQUIDITY_PREMIUM_MAX: 0.10, // prima de tasa maxima por baja liquidez del banco
  LOAN_MIN_RATE: 0.05,
  LOAN_MAX_RATE: 0.35,
  LOAN_SEASON_END_REPAYMENT_RATE: 0.30, // % de la ganancia de temporada destinado a pagar deuda cada fin de temporada
  LOAN_MAX_MISSED_PAYMENTS: 3, // temporadas consecutivas sin cubrir la cuota completa -> default
  LOAN_DEFAULT_REPUTATION_PENALTY: 15,
  LOAN_DEFAULT_MIN_REPUTATION: 10,
  LOAN_DEFAULT_COOLDOWN_SEASONS: 3, // temporadas que un equipo en default debe esperar antes de pedir otro prestamo
  LOAN_NEWS_LARGE_THRESHOLD_RATIO: 0.75, // prestamo aprobado >= este % de SEC -> genera noticia
  BANK_INITIAL_CAPITAL: 300_000_000,
  BANK_BASE_INTEREST_RATE: 0.08,

  // ----- Rivalidades (ver services/rivalryService.js) -----
  RIVALRY_DIVISION_SEED: 15, // intensidad inicial si comparten division, al crear el primer registro
  RIVALRY_BASE_GAME_BONUS: 1, // cualquier enfrentamiento suma esto, reñido o no
  RIVALRY_CLOSE_MARGIN: 2, // diferencia de carreras considerada "partido cerrado"
  RIVALRY_CLOSE_GAME_BONUS: 3,
  RIVALRY_PLAYOFF_BONUS: 10, // un enfrentamiento en playoffs vale mucho mas
  RIVALRY_STREAK_THRESHOLD: 3, // rachas dentro del propio historial de la rivalidad
  RIVALRY_STREAK_BONUS: 3,
  RIVALRY_MIN: 0,
  RIVALRY_MAX: 100,
  RIVALRY_SEASON_DECAY: 4, // decaimiento aplicado en endOfSeasonCleanup
  RIVALRY_BADGE_THRESHOLD: 25, // a partir de aqui se muestra el badge en Schedule/GameView
  RIVALRY_NEWS_ALERT_THRESHOLD: 50, // a partir de aqui, el resultado genera una noticia 'rivalry' con alert:true
  RIVALRY_ATTENDANCE_BONUS_MAX: 0.06, // fraccion extra maxima de fanAttendanceRate cuando intensity=100

  // ----- Scouting: efecto del presupuesto de mision en calidad de prospectos (ver seeders/generators/playerGenerator.js) -----
  SCOUT_BUDGET_FACTOR_CAP_AMOUNT: 6_000_000, // presupuesto en el que el factor llega a su maximo; mas alla de esto, sin beneficio extra
  SCOUT_BUDGET_FACTOR_MAX: 3, // valor maximo del factor de presupuesto
  SCOUT_BUDGET_FACTOR_EXPONENT: 2.5, // >1 = crecimiento acelerado (lento al principio, rapido cerca del tope)
  SCOUT_BUDGET_POTENTIAL_FLOOR_BONUS_MAX: 30, // puntos que suma al piso de potencial con presupuesto tope (factor=3)
  SCOUT_BUDGET_POTENTIAL_FLOOR_CAP: 95, // piso de potencial nunca supera este valor, sin importar skill+presupuesto
  SCOUT_BUDGET_POTENTIAL_CEILING_BONUS_MAX: 24, // puntos que suma al techo de potencial con presupuesto tope (ya limitado a 99)
  SCOUT_BUDGET_AGE_REROLL_MAX_PROB: 0.85, // probabilidad de re-tirar edad a 17-18 con presupuesto tope
  SCOUT_BUDGET_SKILL_MIN_BONUS_MAX: 55, // puntos que suma al piso de current_skill inicial con presupuesto tope (15 -> 70)
  SCOUT_BUDGET_SKILL_MAX_BONUS_MAX: 50, // puntos que suma al techo de current_skill inicial con presupuesto tope (35 -> 85)

  // ----- Estadio: gradas e instalaciones (ver services/stadiumFacilityService.js) -----
  GRANDSTAND_MAX_LEVEL: 15, // tope de nivel por seccion de grada
  FACILITY_UPKEEP_PER_LEVEL: 500, // costo extra por partido en casa, por cada nivel de instalacion sobre 1
  // Mantenimiento por partido en casa segun asistencia (ver services/economy.js computeMaintenanceCost):
  // costo/persona = MIN + (MAX - MIN) * min(1, asistencia / MAX_ATTENDANCE) ^ EXPONENT
  STADIUM_MAINTENANCE_COST_PER_FAN_MIN: 0.5, // costo por asistente con asistencia minima
  STADIUM_MAINTENANCE_COST_PER_FAN_MAX: 10, // costo por asistente al llegar a MAX_ATTENDANCE (tope)
  STADIUM_MAINTENANCE_MAX_ATTENDANCE: 1_000_000, // asistencia en la que el costo por persona llega a su maximo
  STADIUM_MAINTENANCE_EXPONENT: 2, // >1 = crecimiento acelerado (barato al principio, rapido cerca del tope)
  // Demanda de entradas segun precio (ver services/economy.js priceDemandFactor). Si cambias estos valores,
  // actualiza tambien la copia en frontend/src/components/SectionModal.jsx (estimacion de demanda).
  // precio justo = BASE + PER_REP * reputacion + fair_price_per_level de instalaciones
  TICKET_FAIR_PRICE_BASE: 10,
  TICKET_FAIR_PRICE_PER_REP: 0.5,
  TICKET_PRICE_ELASTICITY: 1, // sobre el precio justo: demanda = exp(-K * (precio/justo - 1)) -> 2x = 37%, 3x = 14%
  TICKET_UNDERPRICE_DEMAND_BONUS_MAX: 0.3, // bajo el precio justo: hasta +30% de demanda con entrada gratis
  // Cercania al campo, por anillo (indice 0 = anillo 1, pegado al campo; anillos mas lejanos usan el ultimo valor).
  // Multiplica el precio justo de la grada Y su peso al repartir la demanda (las cercanas se llenan primero).
  TICKET_RING_PREMIUM: [1.5, 1.3, 1.15, 1.0],
  // Instalaciones del equipo (columnas `<key>_level` en Team, todas arrancan en nivel 1).
  // Costo de mejora L -> L+1 = base_cost * cost_factor^(L-1). `levels[i]` = nombre del nivel i+1.
  // Efectos (solo equipo del usuario), por cada nivel sobre 1:
  //   attendance_rate_per_level: suma a la tasa de asistencia (fraccion de la fan_base)
  //   merch_pct_per_level:       multiplica el gasto de merch (+X%)
  //   injury_prob_pct_per_level: reduce la probabilidad de lesion (-X%)
  //   injury_days_every_levels:  -1 dia de baja cada N niveles sobre 1
  //   fair_price_per_level:      suma $X al precio justo de las entradas
  STADIUM_FACILITIES: {
    field: {
      name: 'Campo y césped', column: 'field_level', max: 10, base_cost: 500_000, cost_factor: 2,
      attendance_rate_per_level: 0.003,
      fair_price_per_level: 2,
      levels: [
        'Césped básico', 'Césped resembrado', 'Riego automático', 'Corte en franjas', 'Pista de advertencia',
        'Infield nivelado', 'Corte en cuadros', 'Drenaje profesional', 'Césped híbrido', 'Césped de Grandes Ligas',
      ],
    },
    lights: {
      name: 'Iluminación', column: 'lights_level', max: 5, base_cost: 1_000_000, cost_factor: 2,
      attendance_rate_per_level: 0.005,
      fair_price_per_level: 2,
      levels: ['2 torres de luz', '4 torres de luz', '4 torres LED', '6 torres LED', '6 torres LED de alta potencia'],
    },
    board: {
      name: 'Marcador', column: 'board_level', max: 5, base_cost: 500_000, cost_factor: 2,
      merch_pct_per_level: 0.06,
      fair_price_per_level: 2,
      levels: ['Marcador manual', 'Marcador LED', 'Marcador LED grande', 'Pantalla de video', 'Pantalla + laterales'],
    },
    medical: {
      name: 'Instalaciones médicas', column: 'medical_level', max: 5, base_cost: 4_000_000, cost_factor: 2,
      injury_prob_pct_per_level: 0.08,
      injury_days_every_levels: 2,
      levels: ['Botiquín', 'Enfermería', 'Sala de fisioterapia', 'Centro médico', 'Clínica deportiva'],
    },
  },
};
