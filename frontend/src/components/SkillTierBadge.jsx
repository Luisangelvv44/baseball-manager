import { getSkillTier, SKILL_TIER_COLORS } from '../utils/skillTier.js';

export default function SkillTierBadge({ skill, className = '' }) {
  if (skill == null) return null;
  const tier = getSkillTier(skill);
  return (
    <span className={`text-xs rounded-full px-2 py-0.5 font-semibold ${SKILL_TIER_COLORS[tier]} ${className}`}>
      {tier}
    </span>
  );
}
