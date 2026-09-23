const { RIVALRY_MAX, RIVALRY_ATTENDANCE_BONUS_MAX } = require('../config');

// Calcula ingresos por entradas + merch para un partido EN CASA,
// segun las gradas (capacidad/precio), la reputacion y la base de fans del equipo.
// rivalryIntensity (0-RIVALRY_MAX) sube la tasa de asistencia cuando el rival visitante es intenso.
function computeHomeGameRevenue(grandstandSections, reputation, fanBase, isPlayoff = false, rivalryIntensity = 0) {
  const totalCapacity = grandstandSections.reduce((sum, s) => sum + s.capacity, 0);

  if (totalCapacity === 0) {
    return { attendance: 0, ticketRevenue: 0, merchRevenue: 0, operatingCost: 0, total: 0 };
  }

  const rivalryBoost = (rivalryIntensity / RIVALRY_MAX) * RIVALRY_ATTENDANCE_BONUS_MAX;

  // Asistencia: porcentaje aleatorio de la fan_base, tope = capacidad del estadio
  const fanAttendanceRate = isPlayoff
    ? 0.14 + Math.random() * 0.11 + rivalryBoost // playoffs: 14-25% de la base de fans
    : 0.04 + Math.random() * 0.10 + rivalryBoost; // temporada regular: 4-14% de la base de fans
  const attendance = Math.min(totalCapacity, Math.floor((fanBase || 0) * fanAttendanceRate));

  // precio promedio ponderado por capacidad
  const weightedPrice = grandstandSections.reduce(
    (sum, s) => sum + s.price_per_ticket * s.capacity, 0
  ) / totalCapacity;

  const ticketRevenue = Math.round(attendance * weightedPrice);
  const merchRevenue = computeMerchRevenue(fanBase);
  const operatingCost = Math.round(totalCapacity * 0.5); // mantenimiento por partido

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

module.exports = { computeHomeGameRevenue, computeAwayGameRevenue };
