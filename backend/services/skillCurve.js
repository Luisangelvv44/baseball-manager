// Tabla precalculada de skill efectivo (skill^1.5), construida una unica vez al cargar
// el modulo. Convierte la escala de current_skill (lineal) en una escala convexa, para que
// una misma brecha de puntos pese mas entre jugadores de nivel alto que entre jugadores de
// nivel bajo. Indexada por valor de skill (0-130), no por jugador ni por temporada: cubre de
// antemano cualquier current_skill posible, asi que nunca necesita recalcularse.
const MAX_SKILL = 160; // headroom sobre el tope actual de 150 (ver playerService/coachService/auctionService)

const EFFECTIVE_SKILL_TABLE = new Array(MAX_SKILL + 1);
for (let s = 0; s <= MAX_SKILL; s++) {
  EFFECTIVE_SKILL_TABLE[s] = s * Math.sqrt(s);
}

function effectiveSkill(skill) {
  const s = Math.max(0, Math.min(MAX_SKILL, Math.round(skill)));
  return EFFECTIVE_SKILL_TABLE[s];
}

module.exports = { effectiveSkill };
