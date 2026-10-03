// Constructores Pixi de cada parte del estadio. Cada uno devuelve
// { body, over?, top?, update?, tick?, shadows, focus, scaffold? }.
// Portado de la demo "Estadio · vista cenital", adaptado a los niveles del juego.
import * as PIXI from 'pixi.js';
import {
  BAND, EDGE_MAX, FIELD, FIELD_TF, FRAME, arcPts, edgeR, fieldStyle, flat, frameArc, frameRadius, framePoly,
  framePt, layoutSections, makeTf, mixColor, mulberry32, polar, polyline, rectWorld, shade, sidePos, standPath,
  wedgePoly,
} from './geometry.js';

const TEAM = { dark: 0x2b2f38, accent: 0x8fa3b3 };
const SEAT_A = 0x8fa3b3;
const SEAT_B = 0x6c8193;
const CROWD = [0xeef2f5, 0xc9d3dc, 0x20242c, 0x20242c, 0xd9b44a];

function drawCrowd(g, rows, rng, density) {
  const buckets = CROWD.map(() => []);
  for (const pts of rows) {
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const n = Math.floor(Math.hypot(b.x - a.x, b.y - a.y) / 9);
      for (let k = 0; k < n; k++) {
        if (rng() > density) continue;
        const u = (k + 0.5) / n;
        buckets[Math.floor(rng() * CROWD.length)].push(a.x + (b.x - a.x) * u - 1.5, a.y + (b.y - a.y) * u - 1.5);
      }
    }
  }
  buckets.forEach((arr, ci) => {
    if (!arr.length) return;
    g.beginFill(CROWD[ci], 0.95);
    for (let i = 0; i < arr.length; i += 2) g.drawRect(arr[i], arr[i + 1], 3, 3);
    g.endFill();
  });
}

// ---------- Campo (nivel 1-10) ----------
// 1-3 cesped irregular · 2+ cesped en el infield · 4-6 franjas · 5+ pista de advertencia
// 6+ anillos en el infield · 7-9 cuadros · 8+ borde de pista · 10 franja con los colores del equipo.
// Sin muro: el jardin llega hasta el primer anillo de gradas (edgeR), que hace de muro.
function buildField(level) {
  const style = fieldStyle(level);
  const body = new PIXI.Container();
  const ground = new PIXI.Graphics(); // en coordenadas del mundo (sin girar)
  const diamond = FIELD.apply(new PIXI.Container()); // terreno de juego girado y escalado
  const g = new PIXI.Graphics();
  diamond.addChild(g);
  body.addChild(ground, diamond);
  const GR = [
    { foul: 0x3d8240, fair: 0x4a9446, inf: 0x4a9446 },
    { foul: 0x3a7c3d, a: 0x4a9a47, b: 0x428f42, inf: 0x4e9c4a },
    { foul: 0x377538, a: 0x54a850, b: 0x3e8c40, inf: 0x5bb056 },
  ][style];
  const wall = arcPts(edgeR, -45, 45, 90); // borde del jardin = cara interna de las gradas
  // todo el interior del marco del bowl es cesped de foul territory
  ground.beginFill(GR.foul);
  ground.drawPolygon(flat(framePoly(0)));
  ground.endFill();
  g.beginFill(style === 0 ? GR.fair : GR.b);
  g.drawPolygon(flat([{ x: 0, y: 0 }].concat(wall)));
  g.endFill();

  if (style === 0) {
    const rng = mulberry32(77);
    const patches = [70, 45, 25][level - 1];
    for (let i = 0; i < patches; i++) {
      const d = -42 + rng() * 84;
      const r = 60 + rng() * (edgeR(d) - 130);
      const p = polar(r, d);
      g.beginFill(rng() > 0.5 ? 0x5aa352 : 0x3f8440, 0.45);
      g.drawCircle(p.x, p.y, 16 + rng() * 34);
      g.endFill();
    }
  } else {
    const step = style === 1 ? 55 : 60;
    const wedge = 6;
    for (let k = 0; k * step < EDGE_MAX; k++) {
      const r0 = k * step;
      const r1 = r0 + step;
      const cells = style === 1
        ? [[-45, 45]]
        : Array.from({ length: 15 }, (_, j) => [-45 + wedge * j, -45 + wedge * (j + 1)]);
      cells.forEach(([d0, d1], j) => {
        const parity = style === 1 ? k % 2 : (k + j) % 2;
        const steps = style === 1 ? 30 : 3;
        const A = arcPts((d) => Math.min(r1, edgeR(d)), d0, d1, steps);
        const B = arcPts((d) => Math.min(r0, edgeR(d)), d1, d0, steps);
        g.beginFill(parity ? GR.a : GR.b);
        g.drawPolygon(flat(A.concat(B)));
        g.endFill();
      });
    }
  }
  if (level >= 5) {
    const o = arcPts(edgeR, -45, 45, 90);
    const inn = arcPts((d) => edgeR(d) - 55, -45, 45, 90);
    g.beginFill(0xa5784d);
    g.drawPolygon(flat(o.concat(inn.slice().reverse())));
    g.endFill();
    if (level >= 8) {
      g.lineStyle(2, 0x8c6540, 0.7);
      polyline(g, inn);
      g.lineStyle(0);
    }
  }
  // infield: tierra, cesped interior, loma
  g.beginFill(0xb98b5e);
  g.drawCircle(0, -133, 209);
  g.endFill();
  if (level >= 6) {
    for (let r = 150; r <= 204; r += 9) {
      g.lineStyle(1.5, 0x8d6740, 0.18);
      g.drawCircle(0, -133, r);
    }
    g.lineStyle(0);
  }
  if (level >= 2) {
    const s = 0.62;
    const c = -140;
    g.beginFill(GR.inf ?? 0x4e9c4a);
    g.drawPolygon([0, c + 140 * s, 140 * s, c, 0, c - 140 * s, -140 * s, c]);
    g.endFill();
  }
  g.beginFill(0xc9a070);
  g.drawCircle(0, -133, 26);
  g.endFill();
  g.beginFill(0xffffff);
  g.drawRect(-6, -135, 12, 3);
  g.endFill();
  // lineas, home, cajas de bateo, bases
  g.lineStyle(2 + Math.floor((level - 1) / 3), 0xffffff, 0.85);
  g.moveTo(0, 0);
  g.lineTo(-513, -513);
  g.moveTo(0, 0);
  g.lineTo(513, -513);
  g.lineStyle(2, 0xffffff, 0.8);
  g.drawRect(-34, -22, 20, 38);
  g.drawRect(14, -22, 20, 38);
  g.lineStyle(0);
  g.beginFill(0xffffff);
  g.drawPolygon([-9, -9, 9, -9, 9, 0, 0, 9, -9, 0]);
  g.endFill();
  [[140, -140], [0, -280], [-140, -140]].forEach(([x, y]) => {
    g.beginFill(0xffffff);
    g.lineStyle(1.5, 0x20242c, 0.7);
    g.drawPolygon([x, y - 10, x + 10, y, x, y + 10, x - 10, y]);
    g.endFill();
    g.lineStyle(0);
  });
  // dugouts y backstop
  const dugoutShadows = [];
  for (const side of [-1, 1]) {
    const c = [sidePos(side, 150, 55), sidePos(side, 300, 55), sidePos(side, 300, 88), sidePos(side, 150, 88)];
    g.beginFill(TEAM.dark);
    g.lineStyle(2, TEAM.accent, 0.6);
    g.drawPolygon(flat(c));
    g.endFill();
    g.lineStyle(0);
    const m1 = sidePos(side, 165, 72);
    const m2 = sidePos(side, 285, 72);
    g.lineStyle(3, 0x59606e, 1);
    g.moveTo(m1.x, m1.y);
    g.lineTo(m2.x, m2.y);
    g.lineStyle(0);
    dugoutShadows.push({ type: 'poly', pts: c, h: 8, solid: true });
  }
  g.lineStyle(3, 0xcfd6dd, 0.7);
  polyline(g, standPath(62, 0));
  g.lineStyle(0);
  // pared del jardin al pie de las gradas, y postes de foul (sobre las sombras)
  const over = FIELD.apply(new PIXI.Container());
  const w = new PIXI.Graphics();
  over.addChild(w);
  const WALL_OFF = 8; // la pared queda justo delante de la primera fila de gradas
  const wallLine = arcPts((d) => edgeR(d) - WALL_OFF, -45, 45, 90);
  w.lineStyle(14, 0x14171d, 1); // contorno
  polyline(w, wallLine);
  if (level >= 10) {
    for (let i = 0; i < wallLine.length - 1; i++) {
      w.lineStyle(11, i % 6 < 3 ? TEAM.dark : 0x3b4250, 1);
      w.moveTo(wallLine[i].x, wallLine[i].y);
      w.lineTo(wallLine[i + 1].x, wallLine[i + 1].y);
    }
  } else {
    w.lineStyle(11, TEAM.dark, 1);
    polyline(w, wallLine);
  }
  // remate acolchado del lado del campo
  w.lineStyle(3, TEAM.accent, 0.9);
  polyline(w, arcPts((d) => edgeR(d) - WALL_OFF - 5, -45, 45, 90));
  w.lineStyle(0);
  const poles = [-45, 45].map((d) => polar(edgeR(d) - WALL_OFF, d));
  poles.forEach((p) => {
    w.lineStyle(2, 0x14171d, 1);
    w.beginFill(0xffd23f);
    w.drawCircle(p.x, p.y, 6);
    w.endFill();
  });
  w.lineStyle(0);
  return {
    body,
    over,
    focus: { ...FIELD.toWorld({ x: 0, y: -450 }), z: 1.05 },
    shadows: FIELD.shadows(
      [{ type: 'line', pts: wallLine, w: 12, h: 18 }]
        .concat(poles.map((p) => ({ type: 'pole', x: p.x, y: p.y, h: 110, w: 4 })))
        .concat(dugoutShadows)
    ),
    scaffold: [{ x: FRAME.cx - FRAME.a, y: FRAME.cy - FRAME.b, w: FRAME.a * 2, h: FRAME.b * 2 }],
  };
}

// ---------- Gradas: bowl que replica el grid de secciones ----------
// Cada celda del grid es una porcion angular de su anillo (planta). Las gradas cambian de aspecto
// segun su nivel (1-15); las celdas vacias se ven como lotes sin construir.
const AISLE = 5; // ancho del pasillo entre porciones (unidades del mundo)
const CONCOURSE_WIDTH = 22; // ancho de la explanada alrededor del anillo exterior
// Cada planta esta mas elevada que la anterior (bowl escalonado): proyecta sombra sobre las plantas
// interiores. Altura relativa sobre la planta de adentro = RING_RISE + 2 * nivel.
const RING_RISE = 18;

function seatTiers(level) {
  if (level <= 3) return { bench: true, tiers: [{ f0: 0, f1: 1, color: 0x59606e }] };
  if (level <= 7) return { tiers: [{ f0: 0, f1: 1, color: SEAT_A }] };
  if (level <= 11) return { tiers: [{ f0: 0, f1: 0.55, color: SEAT_A }, { f0: 0.55, f1: 0.65, walk: true }, { f0: 0.65, f1: 1, color: SEAT_B }] };
  return {
    boxes: true,
    tiers: [
      { f0: 0, f1: 0.4, color: SEAT_A }, { f0: 0.4, f1: 0.47, walk: true },
      { f0: 0.47, f1: 0.8, color: SEAT_B }, { f0: 0.8, f1: 0.86, walk: true },
      { f0: 0.86, f1: 1, color: TEAM.dark, boxes: true },
    ],
  };
}

const LABEL_STYLE = new PIXI.TextStyle({
  fontFamily: 'system-ui, sans-serif', fontSize: 20, fontWeight: '700', fill: 0xffffff,
  stroke: 0x14171d, strokeThickness: 4,
});

function buildStands({ sections, floors }) {
  const body = new PIXI.Container();
  const g = new PIXI.Graphics();
  const labels = new PIXI.Container();
  body.addChild(g, labels);
  const rng = mulberry32(900 + floors);
  const shadows = [];
  const outerOff = floors * BAND;

  // explanada alrededor del anillo exterior
  g.beginFill(0x3a404c);
  g.drawPolygon(flat(framePoly(outerOff + CONCOURSE_WIDTH)));
  g.beginHole();
  g.drawPolygon(flat(framePoly(outerOff)));
  g.endHole();
  g.endFill();
  g.lineStyle(2, 0x14171d, 1);
  g.drawPolygon(flat(framePoly(outerOff + CONCOURSE_WIDTH)));
  g.lineStyle(0);

  for (const { section, ring, t0: a0, t1: a1 } of layoutSections(sections, floors)) {
    const off0 = (ring - 1) * BAND + 4;
    const off1 = ring * BAND - 4;
    // recorta los extremos para dejar un pasillo entre porciones
    const gap = AISLE / 2 / frameRadius((a0 + a1) / 2, off0);
    const t0 = a0 + gap;
    const t1 = a1 - gap;
    const poly = wedgePoly(t0, t1, off0, off1);
    const mid = framePt((t0 + t1) / 2, (off0 + off1) / 2);

    if (section.section_type !== 'grandstand') {
      // lote vacio: asfalto con contorno tenue y un "+"
      g.beginFill(0x252a33);
      g.lineStyle(2, 0x59606e, 0.6);
      g.drawPolygon(flat(poly));
      g.endFill();
      g.lineStyle(3, 0x59606e, 0.7);
      g.moveTo(mid.x - 9, mid.y);
      g.lineTo(mid.x + 9, mid.y);
      g.moveTo(mid.x, mid.y - 9);
      g.lineTo(mid.x, mid.y + 9);
      g.lineStyle(0);
      continue;
    }

    const level = section.upgrade_level;
    const spec = seatTiers(level);
    g.beginFill(0x3a404c);
    g.drawPolygon(flat(poly));
    g.endFill();

    const depth = off1 - off0;
    const rowsTotal = 2 + level;
    const crowdRows = [];
    for (const T of spec.tiers) {
      const ta = off0 + T.f0 * depth;
      const tb = off0 + T.f1 * depth;
      if (T.walk) {
        g.beginFill(0x4b5262);
        g.drawPolygon(flat(wedgePoly(t0, t1, ta, tb)));
        g.endFill();
        continue;
      }
      if (T.boxes) {
        // palcos: franja oscura con ventanales
        g.beginFill(T.color);
        g.drawPolygon(flat(wedgePoly(t0, t1, ta, tb)));
        g.endFill();
        g.lineStyle(3, TEAM.accent, 0.8);
        polyline(g, frameArc(t0, t1, (ta + tb) / 2));
        g.lineStyle(0);
        continue;
      }
      const rows = Math.max(1, Math.round(rowsTotal * (T.f1 - T.f0)));
      for (let k = 0; k < rows; k++) {
        const pts = frameArc(t0, t1, ta + ((k + 0.5) * (tb - ta)) / rows);
        g.lineStyle(Math.max(2, Math.min(5, ((tb - ta) / rows) * 0.6)), k % 2 ? shade(T.color, 0.86) : T.color, 1);
        polyline(g, pts);
        crowdRows.push(pts);
      }
      g.lineStyle(0);
    }
    drawCrowd(g, crowdRows, rng, spec.bench ? 0.15 : Math.min(0.75, 0.2 + level * 0.035));
    g.lineStyle(2, 0x14171d, 1);
    g.drawPolygon(flat(poly));
    g.lineStyle(0);
    shadows.push({ type: 'poly', pts: poly, h: 6 + 3 * level + (ring - 1) * RING_RISE, solid: true });
    // sombra sobre las plantas interiores (la escena la recorta a la zona de gradas de adentro)
    if (ring >= 2) {
      shadows.push({ type: 'poly', pts: poly, h: RING_RISE + 2 * level, solid: true, onStands: (ring - 1) * BAND });
    }

    const label = new PIXI.Text(`Nv ${level}`, LABEL_STYLE);
    label.anchor.set(0.5);
    label.position.set(mid.x, mid.y);
    labels.addChild(label);
  }

  return { body, shadows, focus: { x: FRAME.cx, y: FRAME.cy, z: 1 } };
}

// ---------- Iluminacion (nivel 1-5) ----------
const deg = (d) => (d * Math.PI) / 180;
// Las N torres se reparten a angulos iguales (360/N) desde el centro del estadio, simetricas respecto
// al eje home-jardin central, y cada una cae donde su rayo corta el borde exterior de la explanada.
const FIELD_AXIS = -Math.PI / 2 + FIELD_TF.rotation; // direccion del jardin central desde el centro
const poleAngles = (n) => Array.from({ length: n }, (_, i) => FIELD_AXIS + ((Math.PI * 2) / n) * (i + 0.5));
const POLE_ANGLES = { two: poleAngles(2), four: poleAngles(4), six: poleAngles(6) };
const LIGHTS = [
  null,
  { angles: POLE_ANGLES.two, pool: 780, alpha: 0.34, tint: 0xffe6a6, h: 140 },
  { angles: POLE_ANGLES.four, pool: 820, alpha: 0.3, tint: 0xffe6a6, h: 150 },
  { angles: POLE_ANGLES.four, pool: 860, alpha: 0.3, tint: 0xfff4dc, h: 155 },
  { angles: POLE_ANGLES.six, pool: 900, alpha: 0.24, tint: 0xfff4dc, h: 165 },
  { angles: POLE_ANGLES.six, pool: 980, alpha: 0.28, tint: 0xffffff, h: 175 },
];
let glowTex = null;
function getGlowTex() {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const x = c.getContext('2d');
  const gr = x.createRadialGradient(128, 128, 0, 128, 128, 128);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.35, 'rgba(255,255,255,.55)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = gr;
  x.fillRect(0, 0, 256, 256);
  glowTex = PIXI.Texture.from(c);
  return glowTex;
}
function buildLights(level, floors) {
  const L = LIGHTS[level];
  const body = new PIXI.Container();
  const pts = L.angles.map((a) => framePt(a, floors * BAND + CONCOURSE_WIDTH));
  const g = new PIXI.Graphics();
  body.addChild(g);
  pts.forEach((p) => {
    g.beginFill(0x59606e);
    g.lineStyle(2, 0x14171d, 1);
    g.drawCircle(p.x, p.y, 8);
    g.endFill();
    g.lineStyle(0);
  });
  const top = new PIXI.Container();
  const pools = [];
  const halos = [];
  const heads = new PIXI.Graphics();
  pts.forEach((p) => {
    // el haz apunta hacia el campo: al infield o al jardin, el que quede mas cerca de la torre
    const inf = FIELD.toWorld({ x: 0, y: -300 });
    const of = FIELD.toWorld({ x: 0, y: -750 });
    const t = Math.hypot(inf.x - p.x, inf.y - p.y) < Math.hypot(of.x - p.x, of.y - p.y) ? inf : of;
    const sx = t.x - p.x;
    const sy = t.y - p.y;
    const d = Math.hypot(sx, sy) || 1;
    const dist = Math.min(d * 0.55, 420);
    const s = new PIXI.Sprite(getGlowTex());
    s.anchor.set(0.5);
    s.blendMode = PIXI.BLEND_MODES.ADD;
    s.tint = L.tint;
    s.position.set(p.x + (sx / d) * dist, p.y + (sy / d) * dist);
    s.width = s.height = L.pool;
    top.addChild(s);
    pools.push(s);
    const h = new PIXI.Sprite(getGlowTex());
    h.anchor.set(0.5);
    h.blendMode = PIXI.BLEND_MODES.ADD;
    h.tint = 0xfff0b0;
    h.position.set(p.x, p.y - 16);
    h.width = h.height = 110;
    top.addChild(h);
    halos.push(h);
  });
  top.addChild(heads);
  let last = -1;
  const update = (env) => {
    pools.forEach((s) => { s.alpha = env.lf * L.alpha; });
    halos.forEach((h) => { h.alpha = env.lf * 0.9; });
    if (Math.abs(env.lf - last) > 0.02 || last < 0) {
      last = env.lf;
      heads.clear();
      const col = mixColor(0x8d97a1, level >= 3 ? 0xffffff : 0xfff3c0, env.lf);
      pts.forEach((p) => {
        heads.beginFill(0x20242c);
        heads.drawRoundedRect(p.x - 13, p.y - 25, 26, 16, 3);
        heads.endFill();
        heads.beginFill(col);
        for (let r = 0; r < 2; r++) for (let c = 0; c < 4; c++) heads.drawCircle(p.x - 9 + c * 6, p.y - 21 + r * 6, 2.4);
        heads.endFill();
      });
    }
  };
  const shadows = pts.map((p) => ({ type: 'pole', x: p.x, y: p.y, h: L.h, w: 5, head: true }));
  return {
    body, top, update, shadows,
    focus: { x: 0, y: -200, z: 1.2 },
    scaffold: pts.map((p) => ({ x: p.x - 24, y: p.y - 24, w: 48, h: 48 })),
  };
}

// ---------- Marcador (nivel 1-5): pegado al borde exterior del estadio, tras el jardin central ----------
// Cada panel se dibuja centrado en (0,0) con su base del lado +y, y se apoya sobre el borde exterior
// de la explanada, girado segun la tangente del borde en ese punto (la base mira hacia el estadio).
const BOARD_SCALE = FIELD_TF.scale;

// Angulo a partir de theta en el que la cuerda sobre el borde mide `dist`
function angleAtChord(theta, edge, dist, sign) {
  const base = framePt(theta, edge);
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    const q = framePt(theta + sign * mid, edge);
    if (Math.hypot(q.x - base.x, q.y - base.y) < dist) lo = mid;
    else hi = mid;
  }
  return theta + sign * lo;
}

// Transformacion de un panel recto de semiancho `halfW` apoyado en el borde (offset `edge`) en el
// angulo theta, con su base a `inner` unidades locales de su centro. Como el borde es curvo, la base
// se apoya en dos puntos del borde (al 70% del semiancho): el centro pisa un poco la explanada y los
// extremos apenas se separan.
function edgeTf(theta, edge, inner, halfW) {
  const d = 0.7 * halfW * BOARD_SCALE;
  const a = framePt(angleAtChord(theta, edge, d, -1), edge);
  const b = framePt(angleAtChord(theta, edge, d, 1), edge);
  let rotation = Math.atan2(b.y - a.y, b.x - a.x);
  const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  // el eje +y local (la base) debe apuntar hacia el centro del estadio
  if (-Math.sin(rotation) * (FRAME.cx - m.x) + Math.cos(rotation) * (FRAME.cy - m.y) < 0) rotation += Math.PI;
  const k = inner * BOARD_SCALE; // el centro queda hacia afuera de la base
  return makeTf({ x: m.x + Math.sin(rotation) * k, y: m.y - Math.cos(rotation) * k, rotation, scale: BOARD_SCALE });
}

function buildBoard(level, floors) {
  const body = new PIXI.Container();
  const top = new PIXI.Container();
  const rng = mulberry32(31 + level);
  const shadows = [];
  const scaffold = [];
  const edge = floors * BAND + CONCOURSE_WIDTH;
  const cf = FIELD.toWorld({ x: 0, y: -edgeR(0) });
  const theta = Math.atan2(cf.y - FRAME.cy, cf.x - FRAME.cx); // direccion del jardin central
  let tick = null;
  let mainTf = null;

  // Agrega un panel: `draw(g, sg)` dibuja en local (g = estructura, sg = luces) y devuelve
  // { w, h, inner, shadowH }; el panel queda apoyado en el borde en el angulo `at`.
  const addPanel = (at, inner, halfW, draw) => {
    const tf = edgeTf(at, edge, inner, halfW);
    const g = tf.apply(new PIXI.Graphics());
    const sg = tf.apply(new PIXI.Graphics());
    body.addChild(g);
    top.addChild(sg);
    const { w, h, shadowH } = draw(g, sg);
    shadows.push(...tf.shadows([{ type: 'poly', pts: rectWorld(0, 0, w, h, 0), h: shadowH, solid: true }]));
    scaffold.push(tf.rect(-w / 2 - 20, -h / 2 - 20, w + 40, h + 40));
    return tf;
  };

  if (level === 1) {
    // marcador manual
    mainTf = addPanel(theta, 13, 38, (g) => {
      g.beginFill(0x1f3a2a);
      g.lineStyle(2, TEAM.accent, 1);
      g.drawRoundedRect(-38, -13, 76, 26, 3);
      g.endFill();
      g.lineStyle(0);
      g.beginFill(0xf2f2f2);
      for (let i = 0; i < 9; i++) g.drawRect(-32 + i * 7.5, -7, 5, 5);
      for (let i = 0; i < 9; i++) g.drawRect(-32 + i * 7.5, 2, 5, 5);
      g.endFill();
      return { w: 76, h: 26, shadowH: 14 };
    });
  } else if (level <= 3) {
    // LED (2) o LED grande (3)
    const half = level === 2 ? 88 : 124;
    mainTf = addPanel(theta, 23, half, (g, sg) => {
      g.beginFill(TEAM.dark);
      g.lineStyle(2, TEAM.accent, 1);
      g.drawRoundedRect(-half, -16, half * 2, 32, 3);
      g.endFill();
      g.lineStyle(0);
      g.beginFill(0x3a404c);
      g.drawRect(-half, 16, half * 2, 7);
      g.endFill();
      sg.beginFill(0x120f08);
      sg.drawRect(-half + 6, -10, half * 2 - 12, 20);
      sg.endFill();
      sg.beginFill(0xffb347);
      const cols = Math.floor((half * 2 - 16) / 5);
      for (let r = 0; r < 3; r++) for (let c = 0; c < cols; c++) if (rng() > 0.45) sg.drawRect(-half + 8 + c * 5, -9 + r * 6.4, 3.4, 4.4);
      sg.endFill();
      return { w: half * 2, h: 32, shadowH: 40 };
    });
  } else {
    // pantalla de video (4), + marcadores laterales (5) apoyados cada uno sobre la curva del borde
    let screen = null;
    mainTf = addPanel(theta, 38, 150, (g, sg) => {
      g.beginFill(TEAM.dark);
      g.lineStyle(3, TEAM.accent, 1);
      g.drawRoundedRect(-150, -28, 300, 56, 4);
      g.endFill();
      g.lineStyle(0);
      g.beginFill(0x3a404c);
      g.drawRect(-150, 28, 300, 10);
      g.endFill();
      screen = sg;
      return { w: 300, h: 56, shadowH: 62 };
    });
    if (level >= 5) {
      for (const sign of [-1, 1]) {
        const at = angleAtChord(theta, edge, (150 + 6 + 40) * BOARD_SCALE, sign);
        addPanel(at, 27, 40, (g, sg) => {
          g.beginFill(TEAM.dark);
          g.lineStyle(2, TEAM.accent, 1);
          g.drawRoundedRect(-40, -20, 80, 40, 3);
          g.endFill();
          g.lineStyle(0);
          g.beginFill(0x3a404c);
          g.drawRect(-40, 20, 80, 7);
          g.endFill();
          sg.beginFill(0x120f08);
          sg.drawRect(-35, -15, 70, 30);
          sg.endFill();
          sg.beginFill(0xffb347);
          for (let r = 0; r < 4; r++) for (let c = 0; c < 10; c++) if (rng() > 0.5) sg.drawRect(-33 + c * 6.6, -13 + r * 7, 4, 4.6);
          sg.endFill();
          return { w: 80, h: 40, shadowH: 40 };
        });
      }
    }
    const drawScreen = (ph) => {
      screen.clear();
      screen.beginFill(0x0c1218);
      screen.drawRect(-146, -24, 292, 48);
      screen.endFill();
      const n = 30;
      const w = 292 / n;
      for (let i = 0; i < n; i++) {
        screen.beginFill(mixColor(0x2f4a60, 0xbfd0dc, (Math.sin(i * 0.45 + ph) + 1) / 2));
        screen.drawRect(-146 + i * w, -24, w + 0.5, 48);
        screen.endFill();
      }
      const bx = -146 + ((ph * 22) % 292);
      screen.beginFill(0xffffff, 0.55);
      screen.drawRect(bx, -24, 10, 48);
      screen.endFill();
    };
    drawScreen(0);
    let ph = 0;
    tick = () => {
      ph += 0.5;
      drawScreen(ph);
    };
  }

  const zoom = level === 1 ? 3.2 : level <= 3 ? 2.6 : 2.2;
  return { body, top, tick, shadows, scaffold, focus: { ...mainTf.toWorld({ x: 0, y: 0 }), z: zoom } };
}

// ---------- Instalaciones medicas (nivel 1-5): edificio fuera del bowl, sobre el lado de 1B (borde inferior) ----------
function buildMedical(level, floors) {
  const body = new PIXI.Container();
  const g = new PIXI.Graphics();
  body.addChild(g);
  const w = 50 + level * 16;
  const h = 34 + level * 6;
  const theta = deg(70);
  const c = framePt(theta, floors * BAND + CONCOURSE_WIDTH + 30 + h / 2);
  const rot = theta - Math.PI / 2; // largo tangente al bowl; el eje y local apunta hacia afuera
  g.position.set(c.x, c.y);
  g.rotation = rot;
  const shadows = [];
  // edificio principal
  g.beginFill(0xdfe4e8);
  g.lineStyle(2, 0x14171d, 1);
  g.drawRoundedRect(-w / 2, -h / 2, w, h, 3);
  g.endFill();
  g.lineStyle(0);
  g.beginFill(0xc5ccd3);
  g.drawRect(-w / 2 + 4, -h / 2 + 4, w - 8, 5);
  g.endFill();
  shadows.push({ type: 'poly', pts: rectWorld(c.x, c.y, w, h, rot), h: 10 + level * 5, solid: true });
  // ala adicional (nivel 4+)
  if (level >= 4) {
    const ww = 40;
    const wh = h + 18;
    g.beginFill(0xcfd6dd);
    g.lineStyle(2, 0x14171d, 1);
    g.drawRoundedRect(w / 2 - 2, -wh / 2, ww, wh, 3);
    g.endFill();
    g.lineStyle(0);
    const off = { x: Math.cos(rot) * (w / 2 + ww / 2 - 2), y: Math.sin(rot) * (w / 2 + ww / 2 - 2) };
    shadows.push({ type: 'poly', pts: rectWorld(c.x + off.x, c.y + off.y, ww, wh, rot), h: 14, solid: true });
  }
  // cruz roja en el techo
  const cs = 6 + level;
  g.beginFill(0xd23b3b);
  g.drawRect(-cs / 2, -cs * 1.5, cs, cs * 3);
  g.drawRect(-cs * 1.5, -cs / 2, cs * 3, cs);
  g.endFill();
  // equipamiento exterior: piscina de recuperacion (3+), helipuerto (5)
  if (level >= 3) {
    g.beginFill(0x4aa3c9);
    g.lineStyle(2, 0xcfd6dd, 1);
    g.drawRoundedRect(-w / 2, h / 2 + 8, 34, 18, 4);
    g.endFill();
    g.lineStyle(0);
  }
  if (level >= 5) {
    g.beginFill(0x3a404c);
    g.lineStyle(2, 0xffd23f, 1);
    g.drawCircle(-w / 2 - 34, 0, 24);
    g.endFill();
    g.lineStyle(3, 0xffffff, 1);
    g.moveTo(-w / 2 - 41, -9);
    g.lineTo(-w / 2 - 41, 9);
    g.moveTo(-w / 2 - 27, -9);
    g.lineTo(-w / 2 - 27, 9);
    g.moveTo(-w / 2 - 41, 0);
    g.lineTo(-w / 2 - 27, 0);
    g.lineStyle(0);
  }
  const ext = w + 120;
  return {
    body,
    shadows,
    focus: { x: c.x, y: c.y, z: 2.4 },
    scaffold: [{ x: c.x - ext / 2, y: c.y - ext / 2, w: ext, h: ext }],
  };
}

// Cada constructor recibe el estado visual completo y toma lo que necesita
export const BUILD = {
  field: (s) => buildField(s.field),
  stands: (s) => buildStands({ sections: s.sections, floors: s.floors }),
  lights: (s) => buildLights(s.lights, s.floors),
  board: (s) => buildBoard(s.board, s.floors),
  medical: (s) => buildMedical(s.medical, s.floors),
};

// Firma de cada parte: si no cambia, no se reconstruye
export const SIGNATURE = {
  field: (s) => String(s.field),
  stands: (s) => `${s.floors}|${s.sections.map((x) => `${x.id}:${x.section_type}:${x.upgrade_level}`).join(',')}`,
  lights: (s) => `${s.lights}|${s.floors}`,
  board: (s) => `${s.board}|${s.floors}`,
  medical: (s) => `${s.medical}|${s.floors}`,
};

export const LAYER_OF = { field: 'ground', medical: 'stands', stands: 'stands', board: 'board', lights: 'lights' };
export const ORDER = ['field', 'medical', 'stands', 'board', 'lights'];
export { TEAM };
