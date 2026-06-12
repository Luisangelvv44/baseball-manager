// Calcula ingresos por entradas + merch para un partido EN CASA,
// segun las gradas (capacidad/precio) y la reputacion del equipo.
function computeHomeGameRevenue(grandstandSections, reputation) {
  const totalCapacity = grandstandSections.reduce((sum, s) => sum + s.capacity, 0);

  if (totalCapacity === 0) {
    return { attendance: 0, ticketRevenue: 0, merchRevenue: 0, operatingCost: 0, total: 0 };
  }

  // factor de ocupacion: base 40% + hasta 50% extra segun reputacion (0-100), +/-10% random
  const occupancyBase = 0.4 + (reputation / 100) * 0.5;
  const randomFactor = 0.9 + Math.random() * 0.2; // 0.9 - 1.1
  let occupancy = occupancyBase * randomFactor;
  occupancy = Math.max(0.05, Math.min(1, occupancy));

  const attendance = Math.round(totalCapacity * occupancy);

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
