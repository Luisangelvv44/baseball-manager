import { getTeamLogo } from '../utils/teamLogos.js';

export default function TeamBadge({ name, size = 'sm', className = '' }) {
  if (!name) return null;
  const logo = getTeamLogo(name);
  const px = size === 'md' ? 'w-7 h-7' : size === 'lg' ? 'w-9 h-9' : 'w-5 h-5';
  return (
    <span className={`inline-flex items-center gap-1.5 min-w-0 ${className}`}>
      {logo && <img src={logo} alt="" className={`${px} shrink-0 rounded-sm`} />}
      <span className="truncate">{name}</span>
    </span>
  );
}
