const {
  RIVALRY_MAX,
  RIVALRY_ATTENDANCE_BONUS_MAX,
  STADIUM_MAINTENANCE_TIERS,
  TICKET_FAIR_PRICE_BASE,
  TICKET_FAIR_PRICE_PER_REP,
  TICKET_FAIR_PRICE_REP_LINEAR_CAP,
  TICKET_FAIR_PRICE_REP_SQRT_FACTOR,
  TICKET_PRICE_ELASTICITY,
  TICKET_UNDERPRICE_DEMAND_BONUS_MAX,
  TICKET_RING_PREMIUM,
} = require('../config');

// Precio que los fans consideran razonable: sube con la reputacion y con las instalaciones
// (fairPriceBonus de stadiumFacilityService.getFacilityBonuses). Lineal hasta REP_LINEAR_CAP y con
// rendimientos decrecientes (raiz cuadrada) por encima, para que la reputacion acumulada no dispare la taquilla.
function getFairTicketPrice(reputation, fairPriceBonus = 0) {
  const rep = Math.max(0, Number(reputation) || 0);
  const cap = TICKET_FAIR_PRICE_REP_LINEAR_CAP;
  const repTerm = rep <= cap
    ? TICKET_FAIR_PRICE_PER_REP * rep
    : TICKET_FAIR_PRICE_PER_REP * cap + TICKET_FAIR_PRICE_REP_SQRT_FACTOR * (Math.sqrt(rep) - Math.sqrt(cap));
  return TICKET_FAIR_PRICE_BASE + repTerm + fairPriceBonus;
}

// Prima por cercania al campo segun el anillo de la grada (1 = pegada al campo). Sin anillo = la mas lejana.
function ringPremium(ring) {
  const r = Number(ring);
  if (!Number.isFinite(r) || r < 1) return TICKET_RING_PREMIUM[TICKET_RING_PREMIUM.length - 1];
  return TICKET_RING_PREMIUM[Math.min(r, TICKET_RING_PREMIUM.length) - 1];
}

// Precio justo de una grada concreta: precio justo del equipo x prima de su anillo
function getSectionFairPrice(teamFairPrice, ring) {
  return teamFairPrice * ringPremium(ring);
}

// Multiplicador de demanda de una grada segun su precio vs el precio justo:
// debajo del justo sube linealmente hasta +BONUS_MAX (entrada gratis); encima cae exponencialmente,
// asi que cobrar de mas termina dando MENOS ingresos (a 10x el justo casi nadie va).
function priceDemandFactor(price, fairPrice) {
  const ratio = Math.max(0, Number(price) || 0) / fairPrice;
  if (ratio <= 1) return 1 + TICKET_UNDERPRICE_DEMAND_BONUS_MAX * (1 - ratio);
  return Math.exp(-TICKET_PRICE_ELASTICITY * (ratio - 1));
}

// Mantenimiento/logistica de un partido en casa, progresivo por tramos (STADIUM_MAINTENANCE_TIERS):
// cada asistente paga la tarifa del tramo en el que cae, como un impuesto por tramos. Un tramo cobra un
// monto fijo (perFan) o una fraccion del precio justo del equipo (fairPriceShare).
function computeMaintenanceCost(attendance, fairPrice, tiers = STADIUM_MAINTENANCE_TIERS) {
  if (!attendance || attendance <= 0) return 0;
  let cost = 0;
  let from = 0;
  for (const { upTo, perFan, fairPriceShare = 0 } of tiers) {
    if (attendance <= from) break;
    const rate = perFan ?? fairPriceShare * (Number(fairPrice) || 0);
    cost += (Math.min(attendance, upTo) - from) * rate;
    from = upTo;
  }
  return Math.round(cost);
}

// Calcula ingresos por entradas + merch para un partido EN CASA,
// segun las gradas (capacidad/precio), la reputacion y la base de fans del equipo.
// rivalryIntensity (0-RIVALRY_MAX) sube la tasa de asistencia cuando el rival visitante es intenso.
// facilityBonuses (ver stadiumFacilityService.getFacilityBonuses): asistencia extra, multiplicador de
// merch, mantenimiento de instalaciones y bono al precio justo. Vacio = sin instalaciones mejoradas.
// Cada seccion puede traer `ring` (anillo, 1 = pegada al campo): las cercanas reciben mas demanda y tienen
// un precio justo mayor (ringPremium). La demanda se reparte por capacidad x prima, cada grada la ajusta por su
// precio vs su precio justo (priceDemandFactor) y los compradores que no caben en una grada llena se pasan a
// las gradas con sitio.
// El costo operativo depende de la asistencia (computeMaintenanceCost), no de la capacidad.
function computeHomeGameRevenue(grandstandSections, reputation, fanBase, isPlayoff = false, rivalryIntensity = 0, facilityBonuses = {}) {
  const { attendanceRateBonus = 0, merchMultiplier = 1, upkeep = 0, fairPriceBonus = 0 } = facilityBonuses;
  const totalCapacity = grandstandSections.reduce((sum, s) => sum + s.capacity, 0);

  if (totalCapacity === 0) {
    return { attendance: 0, ticketRevenue: 0, merchRevenue: 0, operatingCost: 0, total: 0 };
  }

  const rivalryBoost = (rivalryIntensity / RIVALRY_MAX) * RIVALRY_ATTENDANCE_BONUS_MAX;

  // Demanda: porcentaje aleatorio de la fan_base
  const fanAttendanceRate = isPlayoff
    ? 0.14 + Math.random() * 0.11 + rivalryBoost + attendanceRateBonus // playoffs: 14-25% de la base de fans
    : 0.04 + Math.random() * 0.10 + rivalryBoost + attendanceRateBonus; // temporada regular: 4-14% de la base de fans
  const demand = (fanBase || 0) * fanAttendanceRate;
  const fairPrice = getFairTicketPrice(reputation, fairPriceBonus);

  const sections = grandstandSections.map((s) => {
    const price = Number(s.price_per_ticket) || 0;
    return {
      capacity: s.capacity,
      price,
      weight: s.capacity * ringPremium(s.ring),
      factor: priceDemandFactor(price, getSectionFairPrice(fairPrice, s.ring)),
      seated: 0,
    };
  });

  // Reparto: demanda por peso (capacidad x prima de cercania), cada grada vende segun su precio; el excedente
  // de compradores de gradas llenas se redistribuye entre las que tienen sitio.
  let pending = distributeByWeight(sections, demand);
  for (let round = 0; round < sections.length && pending; round++) {
    let overflow = 0;
    sections.forEach((s, i) => {
      const buyers = pending[i] * s.factor;
      const fit = Math.min(s.capacity - s.seated, buyers);
      s.seated += fit;
      overflow += buyers - fit;
    });
    pending = overflow > 0 ? distributeByWeight(sections, overflow) : null;
  }

  let attendance = 0;
  let ticketRevenue = 0;
  for (const s of sections) {
    const sectionAttendance = Math.floor(s.seated);
    attendance += sectionAttendance;
    ticketRevenue += sectionAttendance * s.price;
  }
  ticketRevenue = Math.round(ticketRevenue);
  const merchRevenue = Math.round(computeMerchRevenue(fanBase) * merchMultiplier);
  const operatingCost = computeMaintenanceCost(attendance, fairPrice) + upkeep; // mantenimiento segun asistencia + instalaciones

  return {
    attendance,
    fairPrice,
    ticketRevenue,
    merchRevenue,
    operatingCost,
    total: ticketRevenue + merchRevenue - operatingCost,
  };
}

// Reparte `amount` entre las gradas con sitio libre segun su peso; null si no queda ninguna con sitio.
function distributeByWeight(sections, amount) {
  const totalWeight = sections.reduce((sum, s) => sum + (s.seated < s.capacity ? s.weight : 0), 0);
  if (totalWeight <= 0) return null;
  return sections.map((s) => (s.seated < s.capacity ? (amount * s.weight) / totalWeight : 0));
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

module.exports = {
  computeHomeGameRevenue,
  computeAwayGameRevenue,
  computeMaintenanceCost,
  getFairTicketPrice,
  getSectionFairPrice,
  ringPremium,
  priceDemandFactor,
};
