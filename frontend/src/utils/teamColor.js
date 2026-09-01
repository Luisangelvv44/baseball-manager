// Color de acento determinista por equipo (no hay color en la BD).
// Mismo espiritu que slugify() en utils/teamLogos.js: solo depende del nombre.

const NEUTRAL = { accent: 'hsl(215 16% 47%)', soft: 'hsl(215 16% 47% / 0.12)' };

function hueFromName(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = (h * 31 + name.charCodeAt(i)) >>> 0;
  }
  return h % 360;
}

export function teamColor(name) {
  if (!name) return NEUTRAL;
  const hue = hueFromName(name.trim().toLowerCase());
  return {
    accent: `hsl(${hue} 62% 45%)`,
    soft: `hsl(${hue} 62% 45% / 0.12)`,
  };
}
