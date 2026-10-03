// Geometria y utilidades puras de la vista cenital del estadio (sin Pixi).
// Coordenadas del mundo: home en (0,0), el campo crece hacia -y.

export const S2 = Math.SQRT1_2;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, k) => a + (b - a) * k;
export const sstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
export const ease = (k) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
export const flat = (pts) => {
  const a = [];
  for (const p of pts) a.push(p.x, p.y);
  return a;
};
const quad = (a, c, b, u) => ({
  x: (1 - u) * (1 - u) * a.x + 2 * (1 - u) * u * c.x + u * u * b.x,
  y: (1 - u) * (1 - u) * a.y + 2 * (1 - u) * u * c.y + u * u * b.y,
});
const channel = (c, s) => (c >> s) & 255;
export const shade = (c, k) =>
  (Math.round(Math.min(255, channel(c, 16) * k)) << 16) |
  (Math.round(Math.min(255, channel(c, 8) * k)) << 8) |
  Math.round(Math.min(255, channel(c, 0) * k));
export const mixColor = (c1, c2, k) =>
  (Math.round(lerp(channel(c1, 16), channel(c2, 16), k)) << 16) |
  (Math.round(lerp(channel(c1, 8), channel(c2, 8), k)) << 8) |
  Math.round(lerp(channel(c1, 0), channel(c2, 0), k));

export function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function polyline(g, pts) {
  g.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
}

// Posicion a distancia t a lo largo de la linea de foul y w hacia afuera (side: -1 izq, +1 der)
export const sidePos = (side, t, w) => ({ x: side * S2 * (t + w), y: S2 * (w - t) });

const ARC = 14;
// Contorno de tribuna a distancia w de las lineas de foul: punta izquierda -> detras de home -> punta derecha
export function standPath(w, tMax) {
  const pts = [];
  const n = Math.max(1, Math.ceil(tMax / 35));
  for (let i = n; i >= 0; i--) pts.push(sidePos(-1, (tMax * i) / n, w));
  const L0 = sidePos(-1, 0, w);
  const R0 = sidePos(1, 0, w);
  const C = { x: 0, y: 1.83 * w };
  for (let i = 1; i < ARC; i++) pts.push(quad(L0, C, R0, i / ARC));
  for (let i = 0; i <= n; i++) pts.push(sidePos(1, (tMax * i) / n, w));
  return pts;
}
export const bandPoly = (wa, wb, tMax) => standPath(wb, tMax).concat(standPath(wa, tMax).reverse());

// Punto a distancia r de home en el angulo d (grados; 0 = jardin central)
export const polar = (r, d) => {
  const a = (d * Math.PI) / 180;
  return { x: r * Math.sin(a), y: -r * Math.cos(a) };
};
export function arcPts(rf, d0, d1, steps) {
  const o = [];
  for (let i = 0; i <= steps; i++) {
    const d = d0 + ((d1 - d0) * i) / steps;
    o.push(polar(rf(d), d));
  }
  return o;
}

export function rectWorld(cx, cy, w, h, rot) {
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  return [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]].map(([x, y]) => ({
    x: cx + x * c - y * s,
    y: cy + x * s + y * c,
  }));
}

// ----- Bowl de gradas: mapeo del grid de secciones al mundo -----
// El campo queda dentro de un marco "superelipse" (casi cuadrado, como el grid). Cada planta del
// grid es una banda de ancho BAND hacia afuera; cada celda del anillo es una porcion angular.
// Orientacion: fila creciente del grid = hacia home (+y), columna = x.

export const FRAME = { cx: 0, cy: -400, a: 600, b: 560, n: 4 };
export const BAND = 120;

// Radio del marco desplazado `off` unidades hacia afuera, en la direccion theta
export function frameRadius(theta, off = 0) {
  const a = FRAME.a + off;
  const b = FRAME.b + off;
  const c = Math.abs(Math.cos(theta)) / a;
  const s = Math.abs(Math.sin(theta)) / b;
  return Math.pow(Math.pow(c, FRAME.n) + Math.pow(s, FRAME.n), -1 / FRAME.n);
}
export function framePt(theta, off = 0) {
  const r = frameRadius(theta, off);
  return { x: FRAME.cx + r * Math.cos(theta), y: FRAME.cy + r * Math.sin(theta) };
}
export function frameArc(t0, t1, off, maxStep = 0.03) {
  const n = Math.max(2, Math.ceil(Math.abs(t1 - t0) / maxStep));
  const pts = [];
  for (let i = 0; i <= n; i++) pts.push(framePt(t0 + ((t1 - t0) * i) / n, off));
  return pts;
}
export const framePoly = (off = 0) => frameArc(0, Math.PI * 2, off, 0.02).slice(0, -1);
// Poligono de la banda [off0, off1] entre los angulos t0..t1
export const wedgePoly = (t0, t1, off0, off1) => frameArc(t0, t1, off1).concat(frameArc(t1, t0, off0));

// Anillo (1 = el mas cercano al campo) de una celda en un grid de N = 2F+2 con el campo 2x2 al centro
export function ringOf(row, col, floors) {
  const lo = floors + 1;
  const hi = floors + 2;
  const d = (v) => (v < lo ? lo - v : v > hi ? v - hi : 0);
  return Math.max(d(row), d(col));
}

// Porciones angulares de cada seccion del grid: [{ section, ring, t0, t1 }]
export function layoutSections(sections, floors) {
  const center = floors + 1.5;
  const rings = {};
  for (const s of sections) {
    if (s.section_type === 'field') continue;
    const ring = ringOf(s.row_pos, s.col_pos, floors);
    if (ring < 1) continue;
    const theta = Math.atan2(s.row_pos - center, s.col_pos - center);
    (rings[ring] ||= []).push({ section: s, ring, theta });
  }
  const out = [];
  for (const cells of Object.values(rings)) {
    cells.sort((a, b) => a.theta - b.theta);
    const n = cells.length;
    cells.forEach((cell, i) => {
      const prev = i === 0 ? cells[n - 1].theta - Math.PI * 2 : cells[i - 1].theta;
      const next = i === n - 1 ? cells[0].theta + Math.PI * 2 : cells[i + 1].theta;
      out.push({ ...cell, t0: (prev + cell.theta) / 2, t1: (cell.theta + next) / 2 });
    });
  }
  return out;
}

// ----- Transformaciones de coordenadas locales al mundo -----
// Un `tf` coloca un dibujo hecho en coordenadas locales: lo traslada a (x, y), lo gira y lo escala.
export function makeTf({ x, y, rotation, scale }) {
  const c = Math.cos(rotation) * scale;
  const s = Math.sin(rotation) * scale;
  const toWorld = (p) => ({ x: x + p.x * c - p.y * s, y: y + p.x * s + p.y * c });
  return {
    toWorld,
    apply(container) {
      container.position.set(x, y);
      container.rotation = rotation;
      container.scale.set(scale);
      return container;
    },
    // sombras definidas en coordenadas locales -> mundo
    shadows: (list) => list.map((sh) => (sh.type === 'pole' ? { ...sh, ...toWorld(sh) } : { ...sh, pts: sh.pts.map(toWorld) })),
    // caja (en el mundo) que envuelve un rectangulo local
    rect(rx, ry, w, h) {
      const pts = [[rx, ry], [rx + w, ry], [rx + w, ry + h], [rx, ry + h]].map(([px, py]) => toWorld({ x: px, y: py }));
      const xs = pts.map((p) => p.x);
      const ys = pts.map((p) => p.y);
      const x0 = Math.min(...xs);
      const y0 = Math.min(...ys);
      return { x: x0, y: y0, w: Math.max(...xs) - x0, h: Math.max(...ys) - y0 };
    },
  };
}

// ----- Terreno de juego -----
// El campo se dibuja en coordenadas locales (home en (0,0), jardin central hacia -y) y se coloca en
// el bowl girado 45 grados en sentido horario: home queda hacia la esquina inferior izquierda y las
// lineas de foul corren paralelas a los bordes. No hay muro: el jardin llega hasta el primer anillo
// de gradas, que hace de muro.
export const FIELD_TF = { x: -405, y: -25, rotation: Math.PI / 4, scale: 1.1 };
export const FIELD = makeTf(FIELD_TF);

const insideFrame = (p) => {
  const dx = p.x - FRAME.cx;
  const dy = p.y - FRAME.cy;
  return Math.hypot(dx, dy) < frameRadius(Math.atan2(dy, dx), 0);
};
// Distancia local desde home hasta el borde del bowl, en el angulo d (grados; 0 = jardin central)
function rayToFrame(d) {
  const a = (d * Math.PI) / 180;
  const dir = { x: Math.sin(a), y: -Math.cos(a) };
  let lo = 0;
  let hi = 3000;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (insideFrame(FIELD.toWorld({ x: dir.x * mid, y: dir.y * mid }))) lo = mid;
    else hi = mid;
  }
  return lo;
}
const EDGE_STEP = 0.5;
const EDGE_TABLE = Array.from({ length: 90 / EDGE_STEP + 1 }, (_, i) => rayToFrame(-45 + i * EDGE_STEP));
// Radio del borde del jardin (las gradas) en el angulo d, en coordenadas locales del campo
export function edgeR(d) {
  const f = (clamp(d, -45, 45) + 45) / EDGE_STEP;
  const i = Math.min(EDGE_TABLE.length - 2, Math.floor(f));
  return lerp(EDGE_TABLE[i], EDGE_TABLE[i + 1], f - i);
}
export const EDGE_MAX = Math.max(...EDGE_TABLE);

// Estilo del cesped (0 = irregular, 1 = franjas, 2 = cuadros) segun nivel del campo (1-10)
export const fieldStyle = (level) => (level >= 7 ? 2 : level >= 4 ? 1 : 0);
