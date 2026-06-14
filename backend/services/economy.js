// Calcula ingresos por entradas + merch para un partido EN CASA,
// segun las gradas (capacidad/precio), la reputacion y la base de fans del equipo.
function computeHomeGameRevenue(grandstandSections, reputation, fanBase) {
  const totalCapacity = grandstandSections.reduce((sum, s) => sum + s.capacity, 0);

  if (totalCapacity === 0) {
    return { attendance: 0, ticketRevenue: 0, merchRevenue: 0, operatingCost: 0, total: 0 };
  }

  // Asistencia: porcentaje aleatorio de la fan_base, tope = capacidad del estadio
  const fanAttendanceRate = 0.10 + Math.random() * 0.40; // 10-50% de la base de fans
  const attendance = Math.min(totalCapacity, Math.floor((fanBase || 0) * fanAttendanceRate));

  // precio promedio ponderado por capacidad
  const weightedPrice = grandstandSections.reduce(
    (sum, s) => sum + s.price_per_ticket * s.capacity, 0
  ) / totalCapacity;

  const ticketRevenue = Math.round(attendance * weightedPrice);
  const merchRevenue = Math.round(ticketRevenue * 0.15);
  const operatingCost = Math.round(totalCapacity * 0.5); // mantenimiento por partido

  return {
    attendance,
    ticketRevenue,
    merchRevenue,
    operatingCost,
    total: ticketRevenue + merchRevenue - operatingCost,
  };
}

// Partido FUERA: solo merch, proporcional a la reputacion del equipo
function computeAwayGameRevenue(reputation) {
  const merchRevenue = Math.round(500 * (reputation / 50));
  return { merchRevenue, total: merchRevenue };
}

module.exports = { computeHomeGameRevenue, computeAwayGameRevenue };
