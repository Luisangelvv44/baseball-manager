import { slugify } from '../utils/teamLogos.js';

const logoModules = import.meta.glob('../assets/broadcast/*.svg', { eager: true, import: 'default' });

const logosBySlug = {};
for (const path in logoModules) {
  logosBySlug[path.split('/').pop().replace('.svg', '')] = logoModules[path];
}

const SIZES = { sm: 'w-7 h-7', md: 'w-9 h-9', lg: 'w-12 h-12' };

export default function BroadcastLogo({ name, size = 'sm', className = '' }) {
  const logo = name ? logosBySlug[slugify(name)] : undefined;
  if (!logo) return null;
  return <img src={logo} alt="" className={`${SIZES[size]} shrink-0 ${className}`} />;
}
