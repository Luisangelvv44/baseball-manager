// Biografias del Salon de la Fama. Solo para exaltados: la IA la escribe una vez al entrar y
// se guarda en HallOfFameCandidate.bio; mientras no exista (IA apagada o fallida) se muestra la
// de plantilla, que se arma al vuelo. Nunca cambia votos, puntajes ni nada del legado.
const prisma = require('../db/prisma');
const { generateText, hasAlteredName, isEnabled } = require('./aiService');
const { positionName } = require('./tradeMessages');
const { getSeasonEditionMap } = require('./seasonEdition');

const BIO_TIMEOUT_MS = 25_000;
const MIN_BIO_CHARS = 200;
const MAX_BIO_CHARS = 1100;

const AWARD_LABELS = {
  MVP: 'Jugador Más Valioso',
  CY_YOUNG: 'Cy Young',
  ROOKIE_OF_YEAR: 'Novato del Año',
  SEASON_HR_RECORD: 'récord de jonrones en una temporada',
  SEASON_ERA_RECORD: 'récord de efectividad en una temporada',
};

const fullName = (p) => `${p.first_name} ${p.last_name}`;

function plural(n, one, many) {
  return `${n} ${n === 1 ? one : many}`;
}

function careerLine(role, t = {}) {
  if (role === 'PITCHER') {
    const era = t.era != null ? `, efectividad de ${Number(t.era).toFixed(2)}` : '';
    return `récord de ${t.wins ?? 0}-${t.losses ?? 0}, ${t.strikeouts ?? 0} ponches${era}`;
  }
  return `${t.hits ?? 0} hits, ${t.home_runs ?? 0} jonrones y ${t.rbi ?? 0} carreras impulsadas`;
}

// Datos de la carrera para la biografia. `c` = HallOfFameCandidate con player, primary_team.
// Lee player_season_records (equipos por temporada) y season_awards. Solo lectura.
async function gatherBioFacts(c) {
  const [records, awards, editions] = await Promise.all([
    prisma.playerSeasonRecord.findMany({
      where: { player_id: c.player_id },
      select: { season_id: true, team_id: true, team: { select: { name: true } } },
      orderBy: [{ season_id: 'asc' }, { first_day: 'asc' }],
    }),
    prisma.seasonAward.findMany({ where: { player_id: c.player_id }, select: { category: true } }),
    getSeasonEditionMap(),
  ]);

  // Trayectoria: equipos en orden de llegada, con cuantas temporadas jugo en cada uno
  const teams = [];
  for (const r of records) {
    if (!r.team?.name) continue;
    let entry = teams.find((t) => t.name === r.team.name);
    if (!entry) { entry = { name: r.team.name, seasons: new Set() }; teams.push(entry); }
    entry.seasons.add(r.season_id);
  }

  const awardCounts = {};
  for (const a of awards) if (AWARD_LABELS[a.category]) awardCounts[a.category] = (awardCounts[a.category] ?? 0) + 1;

  return {
    name: fullName(c.player),
    position: positionName(c.player.position),
    role: c.role,
    seasons: c.seasons_played,
    primaryTeam: c.primary_team?.name ?? null,
    teams: teams.map((t) => ({ name: t.name, seasons: t.seasons.size })),
    totals: c.career_totals ?? {},
    games: c.career_totals?.games ?? null,
    awards: Object.entries(awardCounts).map(([k, n]) => ({ label: AWARD_LABELS[k], count: n })),
    votePct: c.last_vote_pct,
    yearsOnBallot: c.years_on_ballot,
    inductedEdition: c.inducted_season_id != null ? editions.get(c.inducted_season_id) ?? null : null,
    heirs: (c.player.children ?? []).map(fullName),
    retiredNumbers: (c.player.retired_numbers ?? []).map((r) => ({ number: r.number, team: r.team.name })),
  };
}

function factLines(f) {
  const lines = [
    `Nombre: ${f.name}`,
    `Posición: ${f.position}`,
    `Temporadas en la liga: ${f.seasons}`,
  ];
  if (f.teams.length) lines.push(`Equipos (en orden): ${f.teams.map((t) => `${t.name} (${plural(t.seasons, 'temporada', 'temporadas')})`).join(', ')}`);
  if (f.primaryTeam) lines.push(`Equipo con el que se le identifica: ${f.primaryTeam}`);
  lines.push(`Números de carrera: ${careerLine(f.role, f.totals)}${f.games ? ` en ${f.games} juegos` : ''}`);
  // Sin premios no se menciona nada (la IA tendia a subrayar la ausencia)
  if (f.awards.length) lines.push(`Premios: ${f.awards.map((a) => `${a.label} (${a.count})`).join(', ')}`);
  lines.push(`Exaltado con el ${f.votePct}% de los votos, ${f.yearsOnBallot === 1 ? 'en su primer año en la papeleta' : `en su año ${f.yearsOnBallot} en la papeleta`}`);
  if (f.inductedEdition) lines.push(`Clase de la temporada ${f.inductedEdition}`);
  if (f.retiredNumbers.length) lines.push(`Número retirado: ${f.retiredNumbers.map((r) => `#${r.number} por ${r.team}`).join(', ')}`);
  if (f.heirs.length) lines.push(`Hijo(s) en el programa juvenil de la liga: ${f.heirs.join(', ')}`);
  return lines;
}

// Biografia de respaldo (sin IA), con los mismos datos.
function templateBio(f) {
  const parts = [];
  const where = f.primaryTeam ? `, leyenda de ${f.primaryTeam}` : '';
  parts.push(`${f.name}, ${f.position}${where}, jugó ${plural(f.seasons, 'temporada', 'temporadas')} en la liga.`);
  if (f.teams.length > 1) parts.push(`Vistió las camisetas de ${f.teams.map((t) => t.name).join(', ')}.`);
  parts.push(`Cerró su carrera con ${careerLine(f.role, f.totals)}.`);
  if (f.awards.length) parts.push(`En su vitrina: ${f.awards.map((a) => (a.count > 1 ? `${a.count} premios ${a.label}` : a.label)).join(', ')}.`);
  parts.push(`Entró al Salón de la Fama con el ${f.votePct}% de los votos${f.yearsOnBallot === 1 ? ', en su primer año en la papeleta' : ''}.`);
  if (f.retiredNumbers.length) parts.push(`Su número ${f.retiredNumbers.map((r) => `#${r.number} (${r.team})`).join(' y ')} ya no lo usará nadie más.`);
  if (f.heirs.length) parts.push(`Su legado continúa: ${f.heirs.join(' y ')} se forma en el programa juvenil.`);
  return parts.join(' ');
}

const SYSTEM = 'Eres el cronista oficial del Salón de la Fama de una liga de béisbol en un juego de gestión. '
  + 'Escribes en español neutro latinoamericano, con tono emotivo pero sobrio. Nunca inventas datos, cifras, '
  + 'apodos, lugares, familiares ni anécdotas que no se te den.';

function buildBioPrompt(f) {
  return [
    `Escribe la biografía de ${f.name} para su placa del Salón de la Fama.`,
    '',
    'Datos (los únicos que puedes usar):',
    ...factLines(f).map((l) => `- ${l}`),
    '',
    'Reglas:',
    '- Un solo párrafo de 100 a 160 palabras, en tercera persona y en pasado.',
    '- Copia los nombres propios EXACTAMENTE (jugador, equipos, hijos).',
    '- Solo puedes usar las cifras que aparecen en los datos, escritas igual (puedes omitirlas).',
    '- No inventes apodos, ciudades, fechas, rivales, lesiones ni momentos concretos.',
    '- Si tiene hijo en el programa juvenil o número retirado, ciérralo con eso.',
    'Responde solo con la biografía.',
  ].join('\n');
}

function numberTokens(text) {
  return (text.match(/\d+(?:[.,]\d+)?/g) ?? []).map((t) => t.replace(',', '.'));
}

function validBio(text, f) {
  if (typeof text !== 'string') return false;
  const t = text.trim();
  if (t.length < MIN_BIO_CHARS || t.length > MAX_BIO_CHARS || /[{}]/.test(t)) return false;
  if (!t.includes(f.name)) return false;
  const names = [f.name, f.primaryTeam, ...f.teams.map((x) => x.name), ...f.heirs];
  if (hasAlteredName(t, names)) return false;
  const allowed = new Set(numberTokens(factLines(f).join(' ')));
  return numberTokens(t).every((n) => allowed.has(n));
}

// Biografia con IA para unos datos ya reunidos, o null.
async function writeBio(facts, seasonId) {
  const result = await generateText({
    system: SYSTEM,
    prompt: buildBioPrompt(facts),
    maxTokens: 450,
    temperature: 0.7,
    seasonId,
    timeoutMs: BIO_TIMEOUT_MS,
  });
  const text = result?.text?.trim().replace(/^["'“”]+|["'“”]+$/g, '').trim();
  return text && validBio(text, facts) ? text : null;
}

const candidateInclude = {
  player: {
    select: {
      first_name: true, last_name: true, position: true,
      children: { select: { first_name: true, last_name: true }, orderBy: { id: 'asc' } },
      retired_numbers: { select: { number: true, team: { select: { name: true } } } },
    },
  },
  primary_team: { select: { name: true } },
};

const inFlight = new Set();

// Escribe y guarda la biografia de un exaltado si aun no la tiene. Nunca lanza.
async function generateBioForCandidate(candidateId, { seasonId } = {}) {
  if (!isEnabled() || inFlight.has(candidateId)) return null;
  inFlight.add(candidateId);
  try {
    const c = await prisma.hallOfFameCandidate.findUnique({ where: { id: candidateId }, include: candidateInclude });
    if (!c || c.status !== 'inducted' || c.bio) return null;
    const bio = await writeBio(await gatherBioFacts(c), seasonId ?? c.inducted_season_id);
    if (!bio) return null;
    await prisma.hallOfFameCandidate.updateMany({ where: { id: candidateId, bio: null }, data: { bio } });
    return bio;
  } catch (err) {
    console.warn(`[hof] biografia ${candidateId} fallida: ${err.message}`);
    return null;
  } finally {
    inFlight.delete(candidateId);
  }
}

// Para exaltados sin biografia (p. ej. la IA fallo al exaltarlos): se reintenta en segundo plano.
function ensureBiosInBackground(candidateIds) {
  if (!isEnabled()) return;
  (async () => {
    for (const id of candidateIds) await generateBioForCandidate(id);
  })();
}

module.exports = {
  AWARD_LABELS,
  gatherBioFacts,
  factLines,
  templateBio,
  buildBioPrompt,
  validBio,
  writeBio,
  generateBioForCandidate,
  ensureBiosInBackground,
};
