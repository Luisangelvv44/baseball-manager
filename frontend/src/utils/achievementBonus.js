// Espejo de achievementBonusFor (backend/services/contractService.js) para el equipo del
// usuario: el jugador exige un bono por logro de 0-3% del salario anual, lineal con su
// demand_factor (0.00-3.00). ACHIEVEMENT_BONUS_MAX_PCT en backend/config.js.
const ACHIEVEMENT_BONUS_MAX_PCT = 0.03;
const DEMAND_FACTOR_MAX = 3;

export function achievementBonusPct(demandFactor) {
  const demand = Math.min(DEMAND_FACTOR_MAX, Math.max(0, Number(demandFactor) || 0));
  return (demand / DEMAND_FACTOR_MAX) * ACHIEVEMENT_BONUS_MAX_PCT;
}

export function achievementBonusAmount(demandFactor, annualSalary) {
  return Math.round(Number(annualSalary || 0) * achievementBonusPct(demandFactor));
}
