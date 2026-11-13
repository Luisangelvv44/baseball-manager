// Salario de referencia por destreza (sin potencial, edad ni varianza): la curva base con la
// que se generan los salarios (calculateSalary en playerGenerator) y la vara de "lo que vale"
// la produccion de un jugador en la valoracion de traspasos (tradeService).
function baseSalaryForSkill(currentSkill) {
  if (currentSkill >= 110) return 13_000_000 + (currentSkill - 110) * 800_000;
  if (currentSkill >= 100) return 8_000_000 + (currentSkill - 100) * 500_000;
  if (currentSkill >= 90) return 5_000_000 + (currentSkill - 90) * 300_000;
  if (currentSkill >= 80) return 2_000_000 + (currentSkill - 80) * 300_000;
  if (currentSkill >= 70) return 750_000 + (currentSkill - 70) * 125_000;
  if (currentSkill >= 60) return 300_000 + (currentSkill - 60) * 45_000;
  return 50_000 + currentSkill * 4_200;
}

module.exports = { baseSalaryForSkill };
