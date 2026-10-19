// Geografia ficticia de la liga: una isla grande con forma inspirada en la Republica Dominicana (no
// exacta, y a una escala mucho mayor para que los viajes sean en avion). Algunas ciudades tienen un
// sitio fijo (ANCHORS); las demas se colocan a partir de un hash de su nombre (deterministico: la
// misma ciudad cae siempre en el mismo sitio).
import { clamp, mulberry32 } from '../stadium/geometry.js';
import { hueFromName } from '../utils/teamColor.js';

export const WORLD = { w: 1600, h: 1000, cx: 800, cy: 510 };
const ISLAND_BOX = { x: 140, y: 110, w: 1320, h: 790 };
const MIN_DIST = 125; // separacion minima entre ciudades
const CITY_MARGIN = 45; // distancia minima de una ciudad (no costera) a la costa
const KM_PER_UNIT = 3.2; // la isla mide ~4 200 km de punta a punta

// Igual que el backend (services/mapService.js): el nombre del equipo sin la mascota.
export function cityName(teamName) {
  const words = String(teamName ?? '').trim().split(/\s+/).filter(Boolean);
  return words.length > 1 ? words.slice(0, -1).join(' ') : words.join(' ');
}

function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// Contorno en coordenadas normalizadas (0..1 dentro de ISLAND_BOX), en sentido horario desde el
// noroeste: costa norte, peninsula al noreste con su bahia, punta este, costa sur con su bahia y la
// peninsula del suroeste, y el lado oeste casi recto.
const OUTLINE = [
  [0.03, 0.14], [0.12, 0.09], [0.22, 0.07], [0.31, 0.06], [0.4, 0.08], [0.5, 0.12], [0.58, 0.16],
  [0.64, 0.2], [0.72, 0.22], [0.8, 0.22], [0.87, 0.25], [0.84, 0.3], [0.76, 0.32], [0.69, 0.35],
  [0.71, 0.4], [0.79, 0.42], [0.88, 0.45], [0.96, 0.49], [1.0, 0.56], [0.97, 0.64], [0.9, 0.69],
  [0.8, 0.7], [0.7, 0.71], [0.6, 0.74], [0.5, 0.75], [0.43, 0.72], [0.38, 0.67], [0.33, 0.7],
  [0.28, 0.76], [0.25, 0.86], [0.2, 0.97], [0.15, 1.0], [0.1, 0.93], [0.07, 0.83], [0.03, 0.74],
  [0.05, 0.62], [0.01, 0.52], [0.04, 0.4], [0.0, 0.3], [0.02, 0.21],
];

const toWorld = ([u, v]) => ({ x: ISLAND_BOX.x + u * ISLAND_BOX.w, y: ISLAND_BOX.y + v * ISLAND_BOX.h });

// Chaikin (esquinas redondeadas) + un leve ondulado fijo para que la costa no se vea poligonal
function buildIsland() {
  let pts = OUTLINE.map(toWorld);
  for (let it = 0; it < 3; it++) {
    const next = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      next.push({ x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 });
      next.push({ x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 });
    }
    pts = next;
  }
  return pts.map((p, i) => ({
    x: p.x + Math.sin(i * 1.7) * 4 + Math.sin(i * 0.53) * 3,
    y: p.y + Math.cos(i * 1.3) * 4 + Math.sin(i * 0.71) * 3,
  }));
}
const ISLAND = buildIsland();

// Poligono plano para Pixi; `scale` > 1 lo agranda desde el centro (franja de arena / bajos)
export function coastline(_steps, scale = 1) {
  return ISLAND.flatMap((p) => [WORLD.cx + (p.x - WORLD.cx) * scale, WORLD.cy + (p.y - WORLD.cy) * scale]);
}

function insideIsland(x, y) {
  let inside = false;
  for (let i = 0, j = ISLAND.length - 1; i < ISLAND.length; j = i++) {
    const a = ISLAND[i];
    const b = ISLAND[j];
    if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

function distToCoast(x, y) {
  let best = Infinity;
  for (let i = 0, j = ISLAND.length - 1; i < ISLAND.length; j = i++) {
    const a = ISLAND[j];
    const b = ISLAND[i];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const t = clamp(((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy || 1), 0, 1);
    best = Math.min(best, Math.hypot(x - (a.x + t * dx), y - (a.y + t * dy)));
  }
  return best;
}

const onLand = (x, y, margin) => insideIsland(x, y) && distToCoast(x, y) >= margin;

// y de la costa norte en la columna x (primer punto de tierra bajando desde arriba)
function northCoastY(x) {
  for (let y = ISLAND_BOX.y - 40; y < ISLAND_BOX.y + ISLAND_BOX.h; y += 1) {
    if (insideIsland(x, y)) return y;
  }
  return WORLD.cy;
}

// Ciudades con sitio fijo: Brisko y Hallowmere en la costa norte, vecinas; Thalgrove tierra adentro,
// cerca de ambas.
const ANCHORS = {
  brisko: () => {
    const x = ISLAND_BOX.x + 0.3 * ISLAND_BOX.w;
    return { x, y: northCoastY(x) + 24 };
  },
  hallowmere: () => {
    const x = ISLAND_BOX.x + 0.41 * ISLAND_BOX.w;
    return { x, y: northCoastY(x) + 24 };
  },
  thalgrove: () => {
    const x = ISLAND_BOX.x + 0.36 * ISLAND_BOX.w;
    return { x, y: northCoastY(x) + 175 };
  },
};

// Montes (cordillera central), lagos y bosques decorativos, fijos para todas las partidas
export function scenery() {
  const rnd = mulberry32(20261017);
  const items = [];
  const place = (kind, x0, y0, w, h, n, margin = 18) => {
    for (let i = 0, tries = 0; i < n && tries < n * 30; tries++) {
      const x = x0 + rnd() * w;
      const y = y0 + rnd() * h;
      if (!onLand(x, y, margin)) continue;
      items.push({ kind, x, y, s: 0.7 + rnd() * 0.8 });
      i++;
    }
  };
  const B = ISLAND_BOX;
  place('hill', B.x + 0.1 * B.w, B.y + 0.38 * B.h, 0.42 * B.w, 0.2 * B.h, 26); // cordillera
  place('hill', B.x + 0.08 * B.w, B.y + 0.68 * B.h, 0.2 * B.w, 0.2 * B.h, 6);
  place('lake', B.x + 0.1 * B.w, B.y + 0.62 * B.h, 0.12 * B.w, 0.06 * B.h, 2, 30);
  place('tree', B.x, B.y, B.w, B.h, 34);
  return items;
}

// [{ id, city }] -> Map(id -> { x, y }). Las ciudades de ANCHORS van fijas; el resto sale de un hash
// del nombre (dentro de la isla) y luego unas pasadas de separacion para que nada quede encimado.
export function layoutCities(teams) {
  const center = toWorld([0.45, 0.45]);
  const pts = [...teams]
    .sort((a, b) => a.city.localeCompare(b.city) || a.id - b.id)
    .map((t) => {
      const anchor = ANCHORS[t.city.toLowerCase()];
      if (anchor) return { id: t.id, pinned: true, ...anchor() };
      const rnd = mulberry32(hashString(t.city.toLowerCase()));
      for (let tries = 0; tries < 200; tries++) {
        const x = ISLAND_BOX.x + rnd() * ISLAND_BOX.w;
        const y = ISLAND_BOX.y + rnd() * ISLAND_BOX.h;
        if (onLand(x, y, CITY_MARGIN)) return { id: t.id, x, y };
      }
      return { id: t.id, ...center };
    });

  // si el empuje la saca de la isla, la acerca al centro hasta volver a tierra firme
  const keepInland = (p) => {
    for (let k = 0; k < 30 && !onLand(p.x, p.y, CITY_MARGIN); k++) {
      p.x += (center.x - p.x) * 0.08;
      p.y += (center.y - p.y) * 0.08;
    }
  };

  for (let iter = 0; iter < 120; iter++) {
    let moved = false;
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const a = pts[i];
        const b = pts[j];
        if (a.pinned && b.pinned) continue;
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let d = Math.hypot(dx, dy);
        if (d >= MIN_DIST) continue;
        if (d < 0.001) {
          dx = Math.cos(i + j);
          dy = Math.sin(i + j);
          d = 1;
        }
        const gap = MIN_DIST - d;
        // una ciudad fija no se mueve: la otra se lleva todo el empuje
        const pa = a.pinned ? 0 : b.pinned ? gap : gap / 2;
        const pb = b.pinned ? 0 : a.pinned ? gap : gap / 2;
        a.x -= (dx / d) * pa;
        a.y -= (dy / d) * pa;
        b.x += (dx / d) * pb;
        b.y += (dy / d) * pb;
        moved = true;
      }
    }
    pts.forEach((p) => !p.pinned && keepInland(p));
    if (!moved) break;
  }
  return new Map(pts.map((p) => [p.id, { x: p.x, y: p.y }]));
}

// Ruta de vuelo: curva cuadratica con el punto de control desplazado hacia "arriba" del trayecto
export function flightCurve(a, b) {
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const d = Math.hypot(b.x - a.x, b.y - a.y);
  const nx = -(b.y - a.y) / (d || 1);
  const ny = (b.x - a.x) / (d || 1);
  const side = ny > 0 ? -1 : 1; // la curva siempre se arquea hacia el norte
  const bend = clamp(d * 0.28, 40, 220);
  return { a, b, c: { x: mx + nx * bend * side, y: my + ny * bend * side } };
}

export function curvePoint({ a, b, c }, t) {
  const u = 1 - t;
  return {
    x: u * u * a.x + 2 * u * t * c.x + t * t * b.x,
    y: u * u * a.y + 2 * u * t * c.y + t * t * b.y,
  };
}

export function curveAngle({ a, b, c }, t) {
  const dx = 2 * (1 - t) * (c.x - a.x) + 2 * t * (b.x - c.x);
  const dy = 2 * (1 - t) * (c.y - a.y) + 2 * t * (b.y - c.y);
  return Math.atan2(dy, dx);
}

export function distanceKm(a, b) {
  if (!a || !b) return 0;
  return Math.round(Math.hypot(b.x - a.x, b.y - a.y) * KM_PER_UNIT);
}

function hslToHex(h, s, l) {
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))));
  return (f(0) << 16) | (f(8) << 8) | f(4);
}

// Mismo tono que teamColor() (utils/teamColor.js), como numero para Pixi
export function teamHex(name) {
  if (!name) return 0x64748b;
  return hslToHex(hueFromName(name.trim().toLowerCase()), 0.62, 0.45);
}
