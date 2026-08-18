export const SKILL_TIERS = {
  PROMEDIO: 'Promedio',
  REGULAR: 'Regular',
  BUENO: 'Bueno',
  ESTRELLA_EN_POTENCIA: 'Estrella en potencia',
  SUPERESTRELLA: 'Superestrella',
  LEYENDA: 'Leyenda',
};

// Umbrales minimos (inclusive) de cada tier, de mas alto a mas bajo.
// LEYENDA usa 121 en vez de 120 para expresar ">120 exclusivo" como
// una comparacion >= consistente con el resto de la tabla.
export const SKILL_TIER_THRESHOLDS = {
  LEYENDA: 121,
  SUPERESTRELLA: 100,
  ESTRELLA_EN_POTENCIA: 95,
  BUENO: 80,
  REGULAR: 60,
};

export const SKILL_TIER_COLORS = {
  [SKILL_TIERS.PROMEDIO]: 'bg-gray-200 text-gray-700',
  [SKILL_TIERS.REGULAR]: 'bg-slate-300 text-slate-800',
  [SKILL_TIERS.BUENO]: 'bg-green-600 text-white',
  [SKILL_TIERS.ESTRELLA_EN_POTENCIA]: 'bg-blue-600 text-white',
  [SKILL_TIERS.SUPERESTRELLA]: 'bg-purple-600 text-white',
  [SKILL_TIERS.LEYENDA]: 'bg-yellow-400 text-yellow-900',
};

export function getSkillTier(skill) {
  if (skill >= SKILL_TIER_THRESHOLDS.LEYENDA) return SKILL_TIERS.LEYENDA;
  if (skill >= SKILL_TIER_THRESHOLDS.SUPERESTRELLA) return SKILL_TIERS.SUPERESTRELLA;
  if (skill >= SKILL_TIER_THRESHOLDS.ESTRELLA_EN_POTENCIA) return SKILL_TIERS.ESTRELLA_EN_POTENCIA;
  if (skill >= SKILL_TIER_THRESHOLDS.BUENO) return SKILL_TIERS.BUENO;
  if (skill >= SKILL_TIER_THRESHOLDS.REGULAR) return SKILL_TIERS.REGULAR;
  return SKILL_TIERS.PROMEDIO;
}
