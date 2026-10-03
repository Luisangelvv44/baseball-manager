const {
  RIVALRY_MAX,
  RIVALRY_ATTENDANCE_BONUS_MAX,
  STADIUM_MAINTENANCE_COST_PER_FAN_MIN,
  STADIUM_MAINTENANCE_COST_PER_FAN_MAX,
  STADIUM_MAINTENANCE_MAX_ATTENDANCE,
  STADIUM_MAINTENANCE_EXPONENT,
} = require('../config');

// Mantenimiento/logistica de un partido en casa: costo por asistente que sube de MIN a MAX
// (curva acelerada) a medida que la asistencia se acerca a STADIUM_MAINTENANCE_MAX_ATTENDANCE.
function computeMaintenanceCost(attendance) {
  if (!attendance || attendance <= 0) return 0;
  const ratio = Math.min(1, attendance / STADIUM_MAINTENANCE_MAX_ATTENDANCE);
  const costPerFan = STADIUM_MAINTENANCE_COST_PER_FAN_MIN
    + (STADIUM_MAINTENANCE_COST_PER_FAN_MAX - STADIUM_MAINTENANCE_COST_PER_FAN_MIN) * ratio ** STADIUM_MAINTENANCE_EXPONENT;
  return Math.round(attendance * costPerFan);
}

// Calcula ingresos por entradas + merch para un partido EN CASA,
// segun las gradas (capacidad/precio), la reputacion y la base de fans del equipo.
// rivalryIntensity (0-RIVALRY_MAX) sube la tasa de asistencia cuando el rival visitante es intenso.
// facilityBonuses (ver stadiumFacilityService.getFacilityBonuses): asistencia extra, multiplicador de
// merch y mantenimiento de instalaciones. Vacio = sin instalaciones mejoradas.
// El costo operativo depende de la asistencia (computeMaintenanceCost), no de la capacidad.
function computeHomeGameRevenue(grandstandSections, reputation, fanBase, isPlayoff = false, rivalryIntensity = 0, facilityBonuses = {}) {
  const { attendanceRateBonus = 0, merchMultiplier = 1, upkeep = 0 } = facilityBonuses;
  const totalCapacity = grandstandSections.reduce((sum, s) => sum + s.capacity, 0);

  if (totalCapacity === 0) {
    return { attendance: 0, ticketRevenue: 0, merchRevenue: 0, operatingCost: 0, total: 0 };
  }

  const rivalryBoost = (rivalryIntensity / RIVALRY_MAX) * RIVALRY_ATTENDANCE_BONUS_MAX;

  // Asistencia: porcentaje aleatorio de la fan_base, tope = capacidad del estadio
  const fanAttendanceRate = isPlayoff
    ? 0.14 + Math.random() * 0.11 + rivalryBoost + attendanceRateBonus // playoffs: 14-25% de la base de fans
    : 0.04 + Math.random() * 0.10 + rivalryBoost + attendanceRateBonus; // temporada regular: 4-14% de la base de fans
  const attendance = Math.min(totalCapacity, Math.floor((fanBase || 0) * fanAttendanceRate));

  // precio promedio ponderado por capacidad
  const weightedPrice = grandstandSections.reduce(
    (sum, s) => sum + s.price_per_ticket * s.capacity, 0
  ) / totalCapacity;

  const ticketRevenue = Math.round(attendance * weightedPrice);
  const merchRevenue = Math.round(computeMerchRevenue(fanBase) * merchMultiplier);
  const operatingCost = computeMaintenanceCost(attendance) + upkeep; // mantenimiento segun asistencia + instalaciones

  return {
    attendance,
    ticketRevenue,
    merchRevenue,
    operatingCost,
    total: ticketRevenue + merchRevenue - operatingCost,
  };
}

// Merch: porcentaje aleatorio (1%-5%) de la fan_base que gasta un monto aleatorio ($20-50) por persona
function computeMerchRevenue(fanBase) {
  const fanSpendingRate = 0.01 + Math.random() * 0.04;
  const spendingFans = (fanBase || 0) * fanSpendingRate;
  const spendPerFan = 20 + Math.random() * 30;
  return Math.round(spendingFans * spendPerFan);
}

// Partido FUERA: solo merch, misma dinamica que en casa (basada en la fan_base)
function computeAwayGameRevenue(fanBase) {
  const merchRevenue = computeMerchRevenue(fanBase);
  return { merchRevenue, total: merchRevenue };
}

module.exports = { computeHomeGameRevenue, computeAwayGameRevenue, computeMaintenanceCost };
