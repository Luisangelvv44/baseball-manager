const logoModules = import.meta.glob('../assets/logos/*.svg', { eager: true, import: 'default' });

const logosBySlug = {};
for (const path in logoModules) {
  const slug = path.split('/').pop().replace('.svg', '');
  logosBySlug[slug] = logoModules[path];
}

function slugify(name) {
  return name.trim().toLowerCase().replace(/\s+/g, '-');
}

export function getTeamLogo(name) {
  if (!name) return undefined;
  return logosBySlug[slugify(name)];
}
