const jerseyModules = import.meta.glob('../assets/jerseys/*.svg', { eager: true, import: 'default' });

const jerseysBySlug = {};
for (const path in jerseyModules) {
  const slug = path.split('/').pop().replace('.svg', '');
  jerseysBySlug[slug] = jerseyModules[path];
}

function slugify(name) {
  return name.trim().toLowerCase().replace(/\s+/g, '-');
}

export function getTeamJersey(name) {
  if (!name) return undefined;
  return jerseysBySlug[slugify(name)];
}
