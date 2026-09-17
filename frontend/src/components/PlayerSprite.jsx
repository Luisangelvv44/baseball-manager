import React from "react";

/**
 * Datos de equipo: color principal (fill), color de acento (accent),
 * y el texto que va en el pecho (region / mascota), tomados de cada escudo.
 */
const TEAMS = {
  "adalveer-outlaws": { fill: "#2b1a0d", accent: "#c98a3a", region: "ADALVEER", mascot: "OUTLAWS" },
  "brisko-wolves": { fill: "#2b2f38", accent: "#8fa3b3", region: "BRISKO", mascot: "WOLVES" },
  "calderex-voyagers": { fill: "#123a3a", accent: "#5ecfc2", region: "CALDEREX", mascot: "VOYAGERS" },
  "crownridge-pioneers": { fill: "#1f3d2e", accent: "#e0c157", region: "CROWNRIDGE", mascot: "PIONEERS" },
  "drommel-raptors": { fill: "#2e1a47", accent: "#9b5de5", region: "DROMMEL", mascot: "RAPTORS" },
  "druvask-knights": { fill: "#1c1c2e", accent: "#b8b8d1", region: "DRUVASK", mascot: "KNIGHTS" },
  "esterfall-marauders": { fill: "#4a1620", accent: "#d94f4f", region: "ESTERFALL", mascot: "MARAUDERS" },
  "hallowmere-foxes": { fill: "#4a2412", accent: "#e8813f", region: "HALLOWMERE", mascot: "FOXES" },
  "norhaven-sailors": { fill: "#0a2f4a", accent: "#f2c744", region: "NORHAVEN", mascot: "SAILORS" },
  "ostrava-bay-comets": { fill: "#0f2a45", accent: "#4fb4d9", region: "OSTRAVA BAY", mascot: "COMETS" },
  "pellanor-giants": { fill: "#1e2a1e", accent: "#7fae63", region: "PELLANOR", mascot: "GIANTS" },
  "ravenholt-hawks": { fill: "#3a0d0d", accent: "#e8752c", region: "RAVENHOLT", mascot: "HAWKS" },
  "sundermere-crushers": { fill: "#402a12", accent: "#e0a339", region: "SUNDERMERE", mascot: "CRUSHERS" },
  "thalgrove-miners": { fill: "#3d2b1f", accent: "#c9a24b", region: "THALGROVE", mascot: "MINERS" },
  "veltmoor-sentinels": { fill: "#1a1a1a", accent: "#c0c0c0", region: "VELTMOOR", mascot: "SENTINELS" },
  "westvane-rebels": { fill: "#3a1414", accent: "#c74b4b", region: "WESTVANE", mascot: "REBELS" },
  // Uniforme neutro blanco/MLB: agentes libres, o cuando no se conoce ningun equipo.
  "free-agent": { fill: "#f4f4f2", accent: "#1c2733", region: "FREE", mascot: "AGENT" },
};

const OUTLINE = "#33302c";

/**
 * Oscurece un color hex un % dado (0-1). Se usa para la sombra de la
 * visera de la gorra a partir del color principal del equipo.
 */
function darkenColor(hex, percent) {
  const num = parseInt(hex.replace("#", ""), 16);
  const r = Math.max(0, Math.floor(((num >> 16) & 0xff) * (1 - percent)));
  const g = Math.max(0, Math.floor(((num >> 8) & 0xff) * (1 - percent)));
  const b = Math.max(0, Math.floor((num & 0xff) * (1 - percent)));
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

/**
 * Gorra de beisbol (basada en gorra_mlb.svg), reescalada y reposicionada
 * para anclar en el mismo punto en todas las cabezas: como las cejas de
 * TODOS los tipos de cabeza estan ancladas al mismo lugar (x=93/147,
 * y~78-84 del lienzo 240x280), la visera se coloca justo por encima de
 * ese punto (borde inferior en y=80 aprox.) sin importar el tipo de
 * cabeza. El transform mapea el bounding box original de la gorra
 * (x:150-530, y:88-345 del SVG fuente, 680x480) a un ancho de 180 (mas
 * ancho que la cabeza mas ancha, que mide 160) centrado en x=120, con
 * la copa sobresaliendo por encima de la cabeza (hasta y=-42) para que
 * quede calada y no flotando.
 */
function CapMLB({ fill, accent, initials }) {
  const shadow = darkenColor(fill, 0.3);
  return (
    <g transform="translate(-41.1, -68.71) scale(0.474)">
      {/* visera (por debajo de la copa) */}
      <path
        d="M 150 300 Q 245 235 340 235 Q 435 235 530 300
           L 530 345 Q 435 280 340 280 Q 245 280 150 345 Z"
        fill={shadow}
        stroke={OUTLINE}
        strokeWidth={3}
      />
      <path
        d="M 150 345 Q 245 280 340 280 Q 435 280 530 345"
        fill="none"
        stroke={accent}
        strokeWidth={6}
        strokeLinecap="round"
        opacity={0.9}
      />
      {/* copa */}
      <path
        d="M 150 300 Q 150 110 340 95 Q 530 110 530 300
           Q 435 235 340 235 Q 245 235 150 300 Z"
        fill={fill}
        stroke={OUTLINE}
        strokeWidth={3}
      />
      <path d="M 240 103 Q 252 175 245 251" fill="none" stroke={OUTLINE} strokeWidth="2" opacity="0.3" />
      <path d="M 340 95 L 340 235" fill="none" stroke={OUTLINE} strokeWidth="2" opacity="0.3" />
      <path d="M 440 103 Q 428 175 435 251" fill="none" stroke={OUTLINE} strokeWidth="2" opacity="0.3" />
      <circle cx="340" cy="97" r="9" fill={shadow} stroke={OUTLINE} strokeWidth="1" />
      {/* parche frontal con iniciales del equipo */}
      <ellipse cx="340" cy="190" rx="65" ry="36" fill="#eef1f6" stroke={OUTLINE} strokeWidth="2" />
      <text
        x="340"
        y="203"
        textAnchor="middle"
        fontSize="40"
        fontWeight="700"
        fill={fill}
        fontFamily="Arial, sans-serif"
      >
        {initials}
      </text>
    </g>
  );
}

/**
 * 8 tonos de piel predefinidos (base + sombra para el degradado del cuello),
 * ordenados de mas claro a mas oscuro para cubrir un rango amplio de tonos
 * reales de piel de distintas partes del mundo.
 */
const SKIN_TONES = {
  porcelana: { base: "#F2D5C0", shadow: "#D6AE93" },
  claro: { base: "#E3AD84", shadow: "#B68A6A" },
  dorado: { base: "#D9A066", shadow: "#A8763F" },
  oliva: { base: "#C89A6C", shadow: "#9A6F45" },
  canela: { base: "#B97D4B", shadow: "#8C5A2F" },
  bronce: { base: "#96603A", shadow: "#6E4423" },
  castano: { base: "#6E4429", shadow: "#4A2B18" },
  ebano: { base: "#402A1E", shadow: "#241610" },
};

// El "numero de tono de piel" (1-8) se mapea a estas claves, en este orden.
const SKIN_TONE_ORDER = ["porcelana", "claro", "dorado", "oliva", "canela", "bronce", "castano", "ebano"];

function resolveSkinTone(skinToneNumberOrName) {
  if (typeof skinToneNumberOrName === "number") {
    const key = SKIN_TONE_ORDER[skinToneNumberOrName - 1];
    return SKIN_TONES[key] ?? SKIN_TONES[SKIN_TONE_ORDER[1]];
  }
  return SKIN_TONES[skinToneNumberOrName] ?? SKIN_TONES[SKIN_TONE_ORDER[1]];
}

/**
 * Cada cabeza define: orejas (elipses), el rectangulo de cuello
 * (anclado siempre a y=280 de alto real) y la forma de la cabeza.
 * El orden del arreglo HEAD_ORDER define que numero corresponde a cada una (1-5).
 */
const HEADS = {
  redonda: {
    ears: [
      { cx: 55, cy: 115, rx: 14, ry: 20 },
      { cx: 185, cy: 115, rx: 14, ry: 20 },
    ],
    neck: { x: 90, y: 170, width: 60, height: 110 },
    shape: <circle cx="120" cy="110" r="75" />,
  },
  ovalada: {
    ears: [
      { cx: 62, cy: 110, rx: 12, ry: 18 },
      { cx: 178, cy: 110, rx: 12, ry: 18 },
    ],
    neck: { x: 95, y: 183, width: 50, height: 97 },
    shape: <ellipse cx="120" cy="105" rx="62" ry="90" />,
  },
  cuadrada: {
    ears: [
      { cx: 50, cy: 115, rx: 13, ry: 22 },
      { cx: 190, cy: 115, rx: 13, ry: 22 },
    ],
    neck: { x: 88, y: 183, width: 64, height: 97 },
    shape: (
      <path
        d="M55,95 Q55,20 120,20 Q185,20 185,95 L185,150 Q185,192 148,196 L92,196 Q55,192 55,150 Z"
        strokeLinejoin="round"
      />
    ),
  },
  angular: {
    ears: [
      { cx: 56, cy: 105, rx: 11, ry: 17 },
      { cx: 184, cy: 105, rx: 11, ry: 17 },
    ],
    neck: { x: 98, y: 193, width: 44, height: 87 },
    shape: (
      <path
        d="M60,85 Q60,20 120,20 Q180,20 180,85 L175,140 Q170,178 120,208 Q70,178 65,140 Z"
        strokeLinejoin="round"
      />
    ),
  },
  ancha: {
    ears: [
      { cx: 42, cy: 115, rx: 16, ry: 24 },
      { cx: 198, cy: 115, rx: 16, ry: 24 },
    ],
    neck: { x: 80, y: 178, width: 80, height: 100 },
    shape: <ellipse cx="120" cy="110" rx="80" ry="85" />,
  },
};

// El "numero de cabeza" (1-5) se mapea a estas claves, en este orden.
const HEAD_ORDER = ["redonda", "ovalada", "cuadrada", "angular", "ancha"];

/**
 * Cada tipo de ojo es un fragmento SVG ya posicionado sobre el mismo
 * punto de anclaje para todas las cabezas (ojo izq. en x=93, der. en
 * x=147, altura y=100 del lienzo 240x280), cada uno con su ceja.
 * El orden de EYE_ORDER define que numero (1-10) corresponde a cada uno.
 */
const EYES = {
  redondos_simples: (
    <>
      <circle cx="93" cy="100" r="7" fill={OUTLINE} />
      <circle cx="147" cy="100" r="7" fill={OUTLINE} />
      <path d="M82,82 Q93,79 104,82" stroke={OUTLINE} strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M136,82 Q147,79 158,82" stroke={OUTLINE} strokeWidth="3" fill="none" strokeLinecap="round" />
    </>
  ),
  ovalados: (
    <>
      <ellipse cx="93" cy="100" rx="6" ry="9" fill={OUTLINE} />
      <ellipse cx="147" cy="100" rx="6" ry="9" fill={OUTLINE} />
      <path d="M82,81 Q93,78 104,81" stroke={OUTLINE} strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M136,81 Q147,78 158,81" stroke={OUTLINE} strokeWidth="3" fill="none" strokeLinecap="round" />
    </>
  ),
  almendra: (
    <>
      <path d="M82,100 Q93,91 104,100 Q93,109 82,100 Z" fill={OUTLINE} />
      <path d="M136,100 Q147,91 158,100 Q147,109 136,100 Z" fill={OUTLINE} />
      <path d="M82,83 Q92,79 104,84" stroke={OUTLINE} strokeWidth="2.5" fill="none" strokeLinecap="round" />
      <path d="M136,84 Q148,79 158,83" stroke={OUTLINE} strokeWidth="2.5" fill="none" strokeLinecap="round" />
    </>
  ),
  grandes_anime: (
    <>
      <circle cx="93" cy="100" r="12" fill="#ffffff" stroke={OUTLINE} strokeWidth="1.5" />
      <circle cx="93" cy="100" r="7" fill={OUTLINE} />
      <circle cx="90" cy="97" r="2.5" fill="#ffffff" />
      <circle cx="147" cy="100" r="12" fill="#ffffff" stroke={OUTLINE} strokeWidth="1.5" />
      <circle cx="147" cy="100" r="7" fill={OUTLINE} />
      <circle cx="144" cy="97" r="2.5" fill="#ffffff" />
      <path d="M80,78 Q93,74 106,78" stroke={OUTLINE} strokeWidth="2" fill="none" strokeLinecap="round" />
      <path d="M134,78 Q147,74 160,78" stroke={OUTLINE} strokeWidth="2" fill="none" strokeLinecap="round" />
    </>
  ),
  serios_entrecerrados: (
    <>
      <path d="M82,100 Q93,96 104,100" stroke={OUTLINE} strokeWidth="4" fill="none" strokeLinecap="round" />
      <path d="M136,100 Q147,96 158,100" stroke={OUTLINE} strokeWidth="4" fill="none" strokeLinecap="round" />
      <path d="M83,87 L103,89" stroke={OUTLINE} strokeWidth="3.5" strokeLinecap="round" />
      <path d="M137,89 L157,87" stroke={OUTLINE} strokeWidth="3.5" strokeLinecap="round" />
    </>
  ),
  sorprendidos: (
    <>
      <circle cx="93" cy="100" r="10" fill="#ffffff" stroke={OUTLINE} strokeWidth="2" />
      <circle cx="93" cy="100" r="4" fill={OUTLINE} />
      <circle cx="147" cy="100" r="10" fill="#ffffff" stroke={OUTLINE} strokeWidth="2" />
      <circle cx="147" cy="100" r="4" fill={OUTLINE} />
      <path d="M84,83 Q93,78 102,83" stroke={OUTLINE} strokeWidth="2.5" fill="none" strokeLinecap="round" />
      <path d="M138,83 Q147,78 156,83" stroke={OUTLINE} strokeWidth="2.5" fill="none" strokeLinecap="round" />
    </>
  ),
  guino: (
    <>
      <path d="M82,100 Q93,96 104,100" stroke={OUTLINE} strokeWidth="4" fill="none" strokeLinecap="round" />
      <circle cx="147" cy="100" r="7" fill={OUTLINE} />
      <path d="M82,81 Q92,75 105,84" stroke={OUTLINE} strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M136,82 Q147,79 158,82" stroke={OUTLINE} strokeWidth="3" fill="none" strokeLinecap="round" />
    </>
  ),
  enojados: (
    <>
      <path d="M83,94 L102,99 L102,105 L83,103 Z" fill={OUTLINE} />
      <path d="M82,87 L104,96" stroke={OUTLINE} strokeWidth="3.5" strokeLinecap="round" />
      <path d="M157,94 L138,99 L138,105 L157,103 Z" fill={OUTLINE} />
      <path d="M158,87 L136,96" stroke={OUTLINE} strokeWidth="3.5" strokeLinecap="round" />
    </>
  ),
  somnoliento: (
    <>
      <path d="M82,98 Q92,104 104,95" stroke={OUTLINE} strokeWidth="3.5" fill="none" strokeLinecap="round" />
      <path d="M136,95 Q148,104 158,98" stroke={OUTLINE} strokeWidth="3.5" fill="none" strokeLinecap="round" />
      <path d="M83,89 Q93,91 103,88" stroke={OUTLINE} strokeWidth="3.5" fill="none" strokeLinecap="round" />
      <path d="M137,88 Q147,91 157,89" stroke={OUTLINE} strokeWidth="3.5" fill="none" strokeLinecap="round" />
    </>
  ),
  brillante_estrella: (
    <>
      <circle cx="93" cy="100" r="8" fill={OUTLINE} />
      <path d="M90.0,93.0 L90.9,96.1 L94.0,97.0 L90.9,97.9 L90.0,101.0 L89.1,97.9 L86.0,97.0 L89.1,96.1 Z" fill="#ffffff" />
      <circle cx="147" cy="100" r="8" fill={OUTLINE} />
      <path d="M144.0,93.0 L144.9,96.1 L148.0,97.0 L144.9,97.9 L144.0,101.0 L143.1,97.9 L140.0,97.0 L143.1,96.1 Z" fill="#ffffff" />
      <path d="M83,82 Q93,77 103,82" stroke={OUTLINE} strokeWidth="2.5" fill="none" strokeLinecap="round" />
      <path d="M137,82 Q147,77 157,82" stroke={OUTLINE} strokeWidth="2.5" fill="none" strokeLinecap="round" />
    </>
  ),
};

// El "numero de ojos" (1-10) se mapea a estas claves, en este orden.
const EYE_ORDER = [
  "redondos_simples",
  "ovalados",
  "almendra",
  "grandes_anime",
  "serios_entrecerrados",
  "sorprendidos",
  "guino",
  "enojados",
  "somnoliento",
  "brillante_estrella",
];

/**
 * Nariz y boca van soldadas en una sola pieza: un solo numero elige la
 * combinacion completa, no son intercambiables por separado. Todas
 * comparten el mismo anclaje (centradas en x=120, nariz ~y=107-128,
 * boca ~y=144-170) sobre el lienzo 240x280.
 */
const FACES = {
  clasica: (
    <>
      <path d="M121,107 L119,124 Q118,128 122,128" stroke={OUTLINE} strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M100,148 Q120,164 140,148" stroke={OUTLINE} strokeWidth="4" fill="none" strokeLinecap="round" />
    </>
  ),
  seria: (
    <>
      <path d="M120,107 L120,127" stroke={OUTLINE} strokeWidth="3" strokeLinecap="round" />
      <path d="M103,152 L137,152" stroke={OUTLINE} strokeWidth="4" strokeLinecap="round" />
    </>
  ),
  ladeada: (
    <>
      <path d="M119,107 L122,123 Q124,126 128,125" stroke={OUTLINE} strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M101,150 Q118,160 139,144" stroke={OUTLINE} strokeWidth="4" fill="none" strokeLinecap="round" />
    </>
  ),
  sorpresa: (
    <>
      <path d="M120,107 L120,125" stroke={OUTLINE} strokeWidth="3" strokeLinecap="round" />
      <ellipse cx="120" cy="152" rx="9" ry="12" fill="#5c2323" stroke={OUTLINE} strokeWidth="3" />
    </>
  ),
  risa_amplia: (
    <>
      <path d="M121,107 L119,122 Q118,125 121,125" stroke={OUTLINE} strokeWidth="3" fill="none" strokeLinecap="round" />
      <path
        d="M98,148 Q120,146 142,148 Q138,168 120,170 Q102,168 98,148 Z"
        fill="#5c2323"
        stroke={OUTLINE}
        strokeWidth="3"
      />
      <rect x="104" y="148" width="32" height="7" rx="2" fill="#ffffff" />
    </>
  ),
};

// El "numero de rostro" (1-5) se mapea a estas claves, en este orden.
const FACE_ORDER = ["clasica", "seria", "ladeada", "sorpresa", "risa_amplia"];

function resolveHead(headNumberOrName) {
  if (typeof headNumberOrName === "number") {
    const key = HEAD_ORDER[headNumberOrName - 1];
    return HEADS[key] ?? HEADS[HEAD_ORDER[0]];
  }
  return HEADS[headNumberOrName] ?? HEADS[HEAD_ORDER[0]];
}

function resolveTeam(teamSlug) {
  return TEAMS[teamSlug] ?? TEAMS["free-agent"];
}

// Convierte un nombre de equipo (tal cual viene de la BD, ej. "Brisko Wolves") al slug
// que usa TEAMS (ej. "brisko-wolves"). Sin nombre (agente libre / equipo desconocido)
// devuelve el slug del uniforme blanco neutro.
export function teamSlugFromName(name) {
  if (!name) return "free-agent";
  return name.trim().toLowerCase().replace(/\s+/g, "-");
}

function resolveEyes(eyeNumberOrName) {
  if (typeof eyeNumberOrName === "number") {
    const key = EYE_ORDER[eyeNumberOrName - 1];
    return EYES[key] ?? EYES[EYE_ORDER[0]];
  }
  return EYES[eyeNumberOrName] ?? EYES[EYE_ORDER[0]];
}

function resolveFace(faceNumberOrName) {
  if (typeof faceNumberOrName === "number") {
    const key = FACE_ORDER[faceNumberOrName - 1];
    return FACES[key] ?? FACES[FACE_ORDER[0]];
  }
  return FACES[faceNumberOrName] ?? FACES[FACE_ORDER[0]];
}

/**
 * <PlayerSprite headNumber={2} eyeType={6} faceType={3} skinTone={5} team="ravenholt-hawks" />
 * headNumber acepta 1-5 (ver HEAD_ORDER) o el nombre textual ("redonda", "ovalada", etc).
 * eyeType acepta 1-10 (ver EYE_ORDER) o el nombre textual ("sorprendidos", "enojados", etc).
 * faceType (nariz+boca, pieza unica no separable) acepta 1-5 (ver FACE_ORDER) o el
 * nombre textual ("clasica", "seria", "ladeada", "sorpresa", "risa_amplia").
 * skinTone acepta 1-8 (ver SKIN_TONE_ORDER) o el nombre textual ("canela", "ebano", etc).
 * team acepta cualquier slug de TEAMS. La gorra usa automaticamente los
 * colores y las iniciales de ese equipo, no es un parametro aparte.
 */
export default function PlayerSprite({
  headNumber = 1,
  eyeType = 1,
  faceType = 1,
  skinTone = 2,
  team = "free-agent",
  width = 160,
  className,
}) {
  const head = resolveHead(headNumber);
  const eyes = resolveEyes(eyeType);
  const face = resolveFace(faceType);
  const skin = resolveSkinTone(skinTone);
  const { fill, accent, region, mascot } = resolveTeam(team);
  const initials = `${region.trim().charAt(0)}${mascot.trim().charAt(0)}`;
  const gradId = `neckGrad-${team}-${headNumber}-${eyeType}-${faceType}-${skinTone}`;

  return (
    <svg
      width={width}
      viewBox="-75 -60 390 480"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label={`Jugador de ${team}`}
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={skin.base} />
          <stop offset="100%" stopColor={skin.shadow} />
        </linearGradient>
      </defs>

      {/* cuello (detras del cuerpo) */}
      <rect
        x={head.neck.x}
        y={head.neck.y}
        width={head.neck.width}
        height={head.neck.height}
        fill={`url(#${gradId})`}
        stroke={OUTLINE}
        strokeWidth={4}
      />

      {/*
        Brazos: solo hay un diseño para cada lado (no son variantes
        seleccionables). Triceps+antebrazo van soldados en un solo trazo,
        saliendo con el mismo angulo de la manga. Se dibujan ANTES de la
        camiseta a proposito: la manga y el torso tapan el triceps y parte
        del antebrazo (igual que una manga real cubre el hombro), y solo
        el codo (que sobresale del contorno del torso) y la mano (dibujada
        aparte, despues de la camiseta) quedan visibles.
      */}
      <path
        d="M216,245 L286,301 L214,346"
        stroke={OUTLINE}
        strokeWidth={30}
        strokeLinejoin="round"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M216,245 L286,301 L214,346"
        stroke={skin.base}
        strokeWidth={24}
        strokeLinejoin="round"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M24,245 L-46,301 L26,346"
        stroke={OUTLINE}
        strokeWidth={30}
        strokeLinejoin="round"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M24,245 L-46,301 L26,346"
        stroke={skin.base}
        strokeWidth={24}
        strokeLinejoin="round"
        strokeLinecap="round"
        fill="none"
      />

      {/* cuerpo / camiseta del equipo */}
      <path
        d="M70,205 L170,205 Q200,210 205,243 L222,403 L18,403 L35,243 Q40,210 70,205 Z"
        fill={fill}
        stroke="#14161b"
        strokeWidth={4}
      />
      <path
        d="M59.5,211.1 L13.5,224.9 Q3.0,228.0 3.5,239.0 L5.5,287.0 Q6.0,298.0 13.7,290.1 L42.3,260.9 Q50.0,253.0 54.5,242.9 L65.5,218.1 Q70.0,208.0 59.5,211.1 Z"
        fill={fill}
        stroke="#14161b"
        strokeWidth={4}
      />
      <path
        d="M180.5,211.1 L226.5,224.9 Q237.0,228.0 236.5,239.0 L234.5,287.0 Q234.0,298.0 226.3,290.1 L197.7,260.9 Q190.0,253.0 185.5,242.9 L174.5,218.1 Q170.0,208.0 180.5,211.1 Z"
        fill={fill}
        stroke="#14161b"
        strokeWidth={4}
      />
      <path d="M3.5,239.0 L5.5,287.0" stroke={accent} strokeWidth={6} strokeLinecap="round" />
      <path d="M236.5,239.0 L234.5,287.0" stroke={accent} strokeWidth={6} strokeLinecap="round" />
      <path
        d="M95,205 L120,231 L145,205"
        fill="none"
        stroke={accent}
        strokeWidth={6}
        strokeLinejoin="round"
        strokeLinecap="round"
      />

      <text
        x="120"
        y="296"
        textAnchor="middle"
        fontFamily="Arial, sans-serif"
        fontWeight="700"
        fontSize="15"
        letterSpacing="1"
        fill={accent}
      >
        {region}
      </text>
      <text
        x="120"
        y="322"
        textAnchor="middle"
        fontFamily="Arial, sans-serif"
        fontWeight="700"
        fontSize="19"
        letterSpacing="1"
        fill={accent}
      >
        {mascot}
      </text>

      {/* mano derecha: puno cerrado (al frente, justo en el borde del torso) */}
      <circle cx="216" cy="346" r="15" fill={skin.base} stroke={OUTLINE} strokeWidth={4} />
      <path d="M210,339 L210,346" stroke={OUTLINE} strokeWidth={1.5} strokeLinecap="round" />
      <path d="M216,337 L216,345" stroke={OUTLINE} strokeWidth={1.5} strokeLinecap="round" />
      <path d="M222,339 L222,346" stroke={OUTLINE} strokeWidth={1.5} strokeLinecap="round" />

      {/* mano izquierda: guante de beisbol (al frente, justo en el borde del torso) */}
      <path
        d="M3,333 Q-4,318 14,311 Q34,307 42,324 Q46,342 30,354 Q12,358 3,333 Z"
        fill="#8B5A2B"
        stroke={OUTLINE}
        strokeWidth={3}
      />
      <path d="M10,333 Q18,343 10,355" stroke={OUTLINE} strokeWidth={2} fill="none" />

      {/* cabeza (al frente, tapa la parte superior del cuello) */}
      {head.ears.map((e, i) => (
        <ellipse key={i} cx={e.cx} cy={e.cy} rx={e.rx} ry={e.ry} fill={skin.base} stroke={OUTLINE} strokeWidth={4} />
      ))}
      {React.cloneElement(head.shape, { fill: skin.base, stroke: OUTLINE, strokeWidth: 4 })}

      {/* gorra de beisbol del equipo: siempre encima de la cabeza, calada
          sobre la frente (nunca flotando) y mas ancha que cualquier cabeza */}
      <CapMLB fill={fill} accent={accent} initials={initials} />

      {/* ojos y rostro (nariz+boca), al frente de todo */}
      {eyes}
      {face}
    </svg>
  );
}

// Utilidades por si las necesitas en selectores/formularios de tu app.
export const TEAM_LIST = Object.keys(TEAMS);
export const HEAD_COUNT = HEAD_ORDER.length;
export const EYE_COUNT = EYE_ORDER.length;
export const FACE_COUNT = FACE_ORDER.length;
export const SKIN_TONE_COUNT = SKIN_TONE_ORDER.length;
export { TEAMS, HEAD_ORDER, EYE_ORDER, FACE_ORDER, SKIN_TONES, SKIN_TONE_ORDER };
