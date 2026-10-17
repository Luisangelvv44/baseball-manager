// Convierte los NewsItem de un día (más los marcadores de /news/gazette) en notas de periódico:
// antetítulo, titular, bajada y cuerpo. Todo el texto sale de datos reales del juego; cuando no
// hay datos para desarrollar una nota, se publica solo con su bajada.

export const SECTIONS = [
  { id: 'portada', label: 'Portada' },
  { id: 'partidos', label: 'Partidos', types: ['game', 'walkoff', 'extra_innings', 'streak', 'rivalry'] },
  { id: 'hazanas', label: 'Hazañas', types: ['no_hitter', 'cycle', 'multi_hr', 'derby', 'awards'] },
  { id: 'mercado', label: 'Mercado', types: ['auction', 'signing', 'trade'] },
  { id: 'enfermeria', label: 'Enfermería', types: ['injury'] },
  { id: 'finanzas', label: 'Finanzas', types: ['loan'] },
  { id: 'mio', label: 'Mi equipo' },
];

const KICKER = {
  game: 'Crónica', walkoff: 'Walk-off', extra_innings: 'Innings extra', streak: 'Rachas', rivalry: 'Rivalidad',
  no_hitter: 'Joya monticular', cycle: 'El ciclo', multi_hr: 'Jonrones', derby: 'Home Run Derby', awards: 'Premios',
  auction: 'Subastas', signing: 'Movimientos', trade: 'Traspasos', injury: 'Parte médico', loan: 'El Banco',
};

const REPORTERS = {
  partidos: ['Marguerite Oyelaran', 'Tobías Ferrán'],
  hazanas: ['Idris Calloway', 'Lucía Brenner'],
  mercado: ['Renata Voss', 'Aurelio Kanté'],
  enfermeria: ['Dra. Elsa Moravec'],
  finanzas: ['Anselmo Quiroga'],
};

// Peso para decidir qué va a portada. Las notas del equipo del usuario suben.
const PRIORITY = {
  no_hitter: 100, cycle: 90, awards: 85, derby: 80, walkoff: 70, auction: 60, trade: 55,
  extra_innings: 50, rivalry: 45, multi_hr: 40, streak: 35, loan: 30, game: 10, signing: 20, injury: 5,
};
const MINE_BONUS = { game: 45, injury: 30 };

const ORDINALS = ['primera', 'segunda', 'tercera', 'cuarta', 'quinta', 'sexta', 'séptima', 'octava', 'novena', 'décima'];
const ordinal = (n) => ORDINALS[n - 1] ?? `${n}.ª`;

export function sectionOf(type) {
  return SECTIONS.find((s) => s.types?.includes(type))?.id ?? 'partidos';
}

export function priorityOf(item) {
  return (PRIORITY[item.type] ?? 15) + (item.mine ? (MINE_BONUS[item.type] ?? 50) : 0);
}

const cleanHeadline = (h) => h.replace(/^[^\p{L}\p{N}¡¿]+/u, '').trim();

function hash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function findGame(item, games) {
  return games.find((g) => g.home.name && g.away.name
    && item.headline.includes(g.home.name) && item.headline.includes(g.away.name)) ?? null;
}

// Entrada en la que el ganador tomó la ventaja que ya no soltó, y su mayor racimo de carreras.
function gameShape(game) {
  const win = game[game.winner];
  const lose = game[game.winner === 'home' ? 'away' : 'home'];
  let w = 0;
  let l = 0;
  let decisive = null;
  for (let i = 0; i < game.innings; i++) {
    const halves = game.winner === 'home'
      ? [[0, Number(lose.line[i]) || 0], [Number(win.line[i]) || 0, 0]]
      : [[Number(win.line[i]) || 0, 0], [0, Number(lose.line[i]) || 0]];
    for (const [dw, dl] of halves) {
      const ledBefore = w > l;
      w += dw;
      l += dl;
      if (w > l && !ledBefore) decisive = i + 1;
      if (w <= l) decisive = null;
    }
  }
  const nums = win.line.map((r) => Number(r) || 0);
  const big = Math.max(...nums);
  return { win, lose, decisive, big, bigInning: nums.indexOf(big) + 1 };
}

function gameBody(item, game, ctx) {
  const { win, lose, decisive, big, bigInning } = gameShape(game);
  const where = game.winner === 'home' ? 'en casa' : 'como visitante';
  const p = [];
  let first = `${win.name} se impuso ${win.runs}-${lose.runs} a ${lose.name} ${where}.`;
  if (decisive) {
    first += ` La ventaja que ya no soltaría llegó en la ${ordinal(decisive)} entrada`;
    first += big >= 3 && bigInning === decisive ? `, con un racimo de ${big} carreras.` : '.';
  }
  p.push(first);
  if (item.type === 'walkoff') p.push(`El triunfo se decidió en el último turno al bate del local, sin dejar respuesta posible.`);
  if (item.type === 'extra_innings') p.push(`Hicieron falta ${game.innings} entradas para encontrar un ganador.`);
  let second = `Los ganadores conectaron ${win.hits} imparables por ${lose.hits} de sus rivales.`;
  if (big >= 3 && bigInning !== decisive) second += ` Su mejor entrada fue la ${ordinal(bigInning)}, con ${big} carreras.`;
  p.push(second);
  if (ctx.isLatest) {
    const rec = ctx.standings.find((t) => t.id === win.team_id);
    const pos = ctx.standings.findIndex((t) => t.id === win.team_id) + 1;
    if (rec) p.push(`Con el resultado, ${win.name} queda con marca de ${rec.wins}-${rec.losses}, ${pos}.º en la tabla general.`);
  }
  return p;
}

function deckFor(item, game) {
  const h = item.headline;
  switch (item.type) {
    case 'game':
    case 'walkoff':
    case 'extra_innings':
    case 'rivalry':
      if (!game) return 'Resultado de la jornada.';
      return game.innings > 9
        ? `Duelo de ${game.innings} entradas; ${game[game.winner].hits} imparables del ganador.`
        : `Pizarra de ${game.away.runs + game.home.runs} carreras y ${game.away.hits + game.home.hits} imparables entre ambos.`;
    case 'no_hitter':
      return h.includes('perfecto')
        ? 'Ni un solo corredor rival llegó a base en todo el partido.'
        : 'El rival terminó el partido sin conectar un solo imparable.';
    case 'cycle': return 'Sencillo, doble, triple y jonrón en una misma tarde: una de las rarezas del juego.';
    case 'multi_hr': return 'Una tarde de poder que se quedará en el libro de récords de la temporada.';
    case 'derby': return 'El concurso de cuadrangulares ya tiene campeón.';
    case 'awards': return 'La liga entregó sus distinciones de la temporada.';
    case 'streak': return h.includes('racha ganadora') ? 'La racha sigue viva.' : 'La caída no encuentra freno.';
    case 'trade': return 'Los términos del acuerdo pueden consultarse en la oficina de traspasos.';
    case 'signing': return 'Un nuevo nombre en la plantilla de las Mayores.';
    case 'injury': return h.includes('volvió') ? 'Alta médica.' : 'Baja temporal en la plantilla.';
    case 'loan': return 'Movimiento en las cuentas del Banco de la liga.';
    default: return '';
  }
}

function auctionDetails(item) {
  const m = item.headline.match(/^(.+) ganó la subasta de (.+): (\d+) año\(s\), \$([\d.]+)M\/año/);
  if (!m) return null;
  const [, team, player, years, amt] = m;
  const total = (Number(amt) * Number(years)).toFixed(2);
  return {
    headline: `${team} se queda con ${player} por $${Number(amt).toFixed(1)} millones anuales`,
    deck: `Contrato de ${years} temporada${years === '1' ? '' : 's'}: $${total} millones comprometidos en total.`,
    body: [
      `Cerró la ventana de ofertas y ${team} terminó como mejor postor por ${player}. El monto de una oferta es siempre salario anual, sin importar los años del contrato.`,
    ],
  };
}

const LINKS = { trade: ['/trades', 'Ver traspasos'], auction: ['/market', 'Ir al mercado'], loan: ['/bank', 'Ir al Banco'], injury: ['/roster', 'Ver plantilla'] };

export function buildStory(item, ctx) {
  const section = sectionOf(item.type);
  const game = ['game', 'walkoff', 'extra_innings', 'rivalry'].includes(item.type) ? findGame(item, ctx.games) : null;
  const auction = item.type === 'auction' ? auctionDetails(item) : null;
  const reporters = REPORTERS[section] ?? ['Redacción'];
  const story = {
    id: `n${item.id}`,
    item,
    section,
    mine: item.mine,
    kicker: KICKER[item.type] ?? 'La liga',
    headline: auction?.headline ?? cleanHeadline(item.headline),
    deck: auction?.deck ?? deckFor(item, game),
    by: reporters[hash(String(item.id)) % reporters.length],
    body: auction?.body ?? (game ? gameBody(item, game, ctx) : []),
    game,
    link: game ? [`/game/${game.id}`, 'Ver el partido'] : LINKS[item.type] ?? null,
    priority: priorityOf(item),
  };
  return story;
}

export function luxuryStory(tax, userTeamName) {
  const m = (n) => `$${(n / 1_000_000).toFixed(2)}M`;
  const excess = Math.max(0, tax.payroll - tax.threshold);
  const verb = tax.charged ? 'pagó' : 'pagaría';
  return {
    id: 'luxury',
    section: 'finanzas',
    mine: true,
    kicker: 'Impuesto de lujo',
    headline: tax.total_tax > 0
      ? `${userTeamName} ${verb} ${m(tax.total_tax)} por exceder el umbral de nómina`
      : `${userTeamName} se mantiene libre del impuesto de lujo`,
    deck: 'El cálculo castiga el gasto por encima del percentil 75 de la liga y también el costo por punto de skill.',
    by: 'Anselmo Quiroga',
    body: [tax.total_tax > 0
      ? `La nómina de ${m(tax.payroll)} supera en ${m(excess)} el umbral de la liga. El exceso se grava por tramos y, si el costo por punto de skill está por encima de la mediana, llega además un recargo por ineficiencia.`
      : `La nómina de ${m(tax.payroll)} queda por debajo del umbral de ${m(tax.threshold)} que marca el percentil 75 de la liga.`],
    table: tax.total_tax > 0 ? {
      title: `Desglose ${tax.charged ? 'del cobro' : 'de la proyección'} · día ${tax.day}`,
      rows: [
        ['Umbral de la liga (percentil 75)', m(tax.threshold)],
        [`Nómina de ${userTeamName}`, m(tax.payroll)],
        ['Exceso sobre el umbral', m(excess)],
        ['Impuesto por tramos', m(tax.bracket_tax)],
        [`Recargo: $${Math.round(tax.cost_per_skill / 1000)}K por punto de skill (mediana $${Math.round(tax.league_median_cost_per_skill / 1000)}K)`, m(tax.inefficiency_tax)],
      ],
      total: ['Total', m(tax.total_tax)],
    } : null,
    link: ['/finances', 'Ver finanzas'],
    priority: 58,
  };
}

const QUOTES = [
  ['Un contrato largo no protege a nadie de una oferta más alta.', 'Un agente que pidió no ser nombrado'],
  ['El béisbol es un juego de nueve entradas, pero las temporadas se ganan en la oficina.', 'Un gerente de la liga'],
  ['La pelota no sabe cuánto cobras.', 'Un veterano del dugout'],
  ['Cada racha termina; lo difícil es saber cuándo empieza.', 'Un mánager en conferencia de prensa'],
  ['El público perdona una derrota, no una tribuna vacía.', 'Un dueño de franquicia'],
];

const ADS = [
  { t: 'Se busca', x: 'Lanzador zurdo con buen brazo y mejor carácter. Abstenerse equipos sin cupo.' },
  { t: 'Se traspasa', x: 'Cupo de roster, poco uso. Precio a convenir.' },
  { t: 'Se vende', x: 'Bate de ceniza firmado por una Leyenda. Sin grietas.' },
  { t: 'Perdido', x: 'Un contrato de cinco años. Último paradero: la mesa de subastas.' },
  { t: 'Clínica deportiva', x: 'Recuperación de lesiones en tiempo récord. Pregunte por nuestras instalaciones médicas.' },
  { t: 'Academia', x: 'Formamos talento desde los ocho años. Programa de diez temporadas.' },
  { t: 'Se alquila', x: 'Palco en anillo uno, vista privilegiada al home. Solo temporada completa.' },
  { t: 'Ofrezco', x: 'Servicio de ojeo en todas las divisiones. Informes en un día.' },
];

export function quoteFor(day) {
  return QUOTES[day % QUOTES.length];
}

export function adsFor(day, teams) {
  const picks = [0, 1, 2, 3].map((i) => ADS[(day + i * 3) % ADS.length]);
  const names = teams.map((t) => t.name);
  return [
    ...picks.map((a, i) => ({ ...a, tel: names.length ? `Preguntar en ${names[(day * 7 + i * 5) % names.length]}` : 'Preguntar en taquilla' })),
    { t: 'Aviso a los equipos', x: 'Quien no suba su oferta antes del cierre, que no se queje después.', tel: 'La Dirección', dbl: true },
  ];
}
