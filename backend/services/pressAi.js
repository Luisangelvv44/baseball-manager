// Capa de IA de las ruedas de prensa. Solo reescribe TEXTO: las preguntas (tema, mood, rival) y
// los tonos disponibles los eligen las plantillas, y los efectos siguen saliendo de TONE_EFFECTS.
// Todo lo que no pase la validacion se queda con el texto de plantilla.
const { generateText, hasAlteredName } = require('./aiService');
const { TONE_LABELS } = require('./pressTemplates');

const MAX_QUESTION_CHARS = 260;
const MAX_ANSWER_CHARS = 260;
const MAX_HEADLINE_CHARS = 160;
const HEADLINE_TIMEOUT_MS = 8_000;

// Personalidad estable por cadena (no hay campo en la DB: se deriva del id).
const HOST_STYLES = [
  'seria y analítica: preguntas precisas, basadas en los datos',
  'sensacionalista: busca el titular polémico y el drama',
  'cercana y local: habla como un aficionado más, con calidez',
  'irónica y punzante: preguntas con doble filo',
];

const TONE_GUIDE = {
  humilde: 'humilde: modesto, reconoce méritos ajenos o errores propios',
  confiado: 'confiado: seguro, ambicioso, sin faltar al respeto',
  provocador: 'provocador: picante contra el rival, busca el titular',
  evasivo: 'evasivo: no responde de verdad, frases cortas que esquivan el tema',
};

function hostStyle(host, satisfaction) {
  if (!host) return { name: 'la prensa local', style: 'prensa independiente, neutral', mood: null };
  const style = HOST_STYLES[Math.abs(host.id) % HOST_STYLES.length];
  let mood = null;
  if (satisfaction != null && satisfaction < 35) mood = 'La cadena está molesta con el mánager: preguntas más incómodas e insistentes.';
  else if (satisfaction != null && satisfaction > 70) mood = 'La cadena tiene buena relación con el mánager: tono más amable.';
  return { name: host.name, style, mood };
}

// Nombres propios que la IA debe copiar literalmente (DeepSeek cambio "de" por "del" en la prueba).
function protectedNames(ctx) {
  return [ctx.teamName, ctx.opponentName, ctx.injured, ctx.feat?.player, ctx.standing?.division].filter(Boolean);
}

function validText(value, max, names) {
  return typeof value === 'string'
    && value.trim().length >= 5
    && value.trim().length <= max
    && !/[{}]/.test(value)
    && !hasAlteredName(value, names);
}

function contextFacts(ctx) {
  const facts = [`Equipo del mánager: ${ctx.teamName}`];
  if (ctx.opponentName) facts.push(`Rival: ${ctx.opponentName}${ctx.rivalryHot ? ' (rivalidad muy caliente)' : ''}`);
  if (ctx.series) facts.push(`Serie recién terminada: ${ctx.series.wins} victorias, ${ctx.series.losses} derrotas`);
  if (ctx.playoff) facts.push(`Playoffs (${ctx.playoff.roundLabel}): ${ctx.playoff.outcome}`);
  if (ctx.standing) facts.push(`Clasificación: ${ctx.standing.position}.º en la ${ctx.standing.division}${ctx.standing.inPlayoffZone ? ' (zona de playoffs)' : ' (fuera de playoffs)'}`);
  if (ctx.streak?.length >= 3) facts.push(`Racha: ${ctx.streak.length} ${ctx.streak.type === 'W' ? 'victorias' : 'derrotas'} seguidas`);
  if (ctx.feat) facts.push(`Hazaña reciente: ${ctx.feat.player} (${ctx.feat.type})`);
  if (ctx.injured) facts.push(`Lesionado destacado: ${ctx.injured}`);
  if (ctx.deadlineSoon) facts.push('Se acerca el cierre de traspasos');
  return facts;
}

const SYSTEM = 'Eres el redactor de un juego de gestión de béisbol. Escribes en español neutro latinoamericano, '
  + 'textos breves y con personalidad. Nunca inventas datos, cifras ni nombres que no se te den.';

function buildEnrichPrompt(ctx, questions, host, reporter) {
  const h = hostStyle(host, host?.satisfaction);
  const base = questions.map((q) => ({
    id: q.id,
    pregunta_base: q.text,
    idea_por_tono: Object.fromEntries(q.options.map((o) => [o.tone, o.quote])),
  }));
  return [
    `Rueda de prensa organizada por "${h.name}". Estilo de la cadena: ${h.style}.`,
    h.mood,
    `Periodista: ${reporter}.`,
    '',
    'Datos del juego (los únicos que puedes usar):',
    ...contextFacts(ctx).map((f) => `- ${f}`),
    '',
    'Reescribe cada pregunta con el estilo de la cadena, manteniendo su tema. Para cada tono listado,',
    'escribe una respuesta NUEVA del mánager a esa pregunta reescrita, con ese tono:',
    ...Object.values(TONE_GUIDE).map((t) => `- ${t}`),
    '',
    'Reglas:',
    '- "idea_por_tono" es solo la intención: NO la copies, redáctala con otras palabras y conéctala con los datos.',
    '- Las respuestas deben ser coherentes con los datos (no presumas de ir ganando si el equipo viene perdiendo).',
    '- Copia los nombres propios EXACTAMENTE como aparecen (sin cambiar "de" por "del", sin abreviar).',
    `- Pregunta: máximo ${MAX_QUESTION_CHARS - 40} caracteres, sin prefijos como "Para ..." ni el nombre de la cadena.`,
    `- Respuestas: 1 o 2 frases, máximo ${MAX_ANSWER_CHARS - 40} caracteres, en primera persona.`,
    '- Devuelve exactamente los mismos ids y los mismos tonos de cada pregunta.',
    '',
    'Base:',
    JSON.stringify(base),
    '',
    'Responde SOLO con JSON: {"questions":[{"id":"q1","text":"...","answers":{"<tono>":"..."}}]}',
  ].filter((l) => l != null).join('\n');
}

// Mezcla la respuesta de la IA con las preguntas de plantilla. Cada pregunta se acepta entera
// (texto + todas sus respuestas) o se queda como estaba.
function mergeEnriched(questions, raw, names) {
  const byId = new Map((Array.isArray(raw?.questions) ? raw.questions : []).map((q) => [q?.id, q]));
  let replaced = 0;
  const merged = questions.map((q) => {
    const ai = byId.get(q.id);
    const answers = ai?.answers ?? {};
    const ok = ai
      && validText(ai.text, MAX_QUESTION_CHARS, names)
      && q.options.every((o) => validText(answers[o.tone], MAX_ANSWER_CHARS, names));
    if (!ok) return q;
    replaced += 1;
    return {
      ...q,
      text: ai.text.trim(),
      source: 'ai',
      options: q.options.map((o) => ({ ...o, quote: answers[o.tone].trim() })),
    };
  });
  return { questions: merged, replaced };
}

// Devuelve { questions, replaced, model, cost } o null si la IA no esta disponible o nada valio.
async function enrichQuestions({ ctx, questions, host, reporter, seasonId }) {
  if (!questions?.length) return null;
  const result = await generateText({
    system: SYSTEM,
    prompt: buildEnrichPrompt(ctx, questions, host, reporter),
    json: true,
    maxTokens: 300 * questions.length,
    seasonId,
  });
  if (!result?.json) return null;
  const merged = mergeEnriched(questions, result.json, protectedNames(ctx));
  if (merged.replaced === 0) return null;
  return { ...merged, model: result.model, cost: result.cost };
}

const HEADLINE_TONE_PRIORITY = ['provocador', 'confiado', 'humilde', 'evasivo'];

function buildHeadlinePrompt({ perQuestion, questions, names, host, fallback }) {
  const h = hostStyle(host, host?.satisfaction);
  const star = [...perQuestion].sort(
    (a, b) => HEADLINE_TONE_PRIORITY.indexOf(a.tone) - HEADLINE_TONE_PRIORITY.indexOf(b.tone),
  )[0];
  const lines = perQuestion.map((p) => {
    const q = questions.find((x) => x.id === p.questionId);
    return `- Pregunta: ${q?.text ?? ''}\n  Respuesta (${TONE_LABELS[p.tone] ?? p.tone}): ${p.quote}`;
  });
  return [
    `Escribe el titular de prensa de esta rueda del mánager de ${names.teamName}`
      + `${names.opponentName ? ` (rival: ${names.opponentName})` : ''}. Medio: "${h.name}" (${h.style}).`,
    '',
    ...lines,
    '',
    `El titular debe girar en torno a la respuesta más llamativa: "${star.quote}" (${TONE_LABELS[star.tone] ?? star.tone}).`,
    'Reglas: una sola línea, máximo 130 caracteres, puede citar entre «» una frase corta del mánager,',
    'copia los nombres propios EXACTAMENTE, sin comillas al inicio y al final del titular, sin inventar datos.',
    `Ejemplo del formato (no lo copies): ${fallback}`,
    'Responde solo con el titular.',
  ].join('\n');
}

// Titular de la Gaceta escrito por la IA, o null (el llamador usa pressHeadline).
async function aiHeadline({ perQuestion, questions, names, host, seasonId, fallback }) {
  if (!perQuestion?.length) return null;
  const result = await generateText({
    system: SYSTEM,
    prompt: buildHeadlinePrompt({ perQuestion, questions, names, host, fallback }),
    maxTokens: 80,
    seasonId,
    timeoutMs: HEADLINE_TIMEOUT_MS,
  });
  if (!result?.text) return null;
  const line = result.text.split('\n')[0].trim().replace(/^["'“”]+|["'“”]+$/g, '').trim();
  const nameList = [names.teamName, names.opponentName].filter(Boolean);
  if (line.length < 15 || line.length > MAX_HEADLINE_CHARS || hasAlteredName(line, nameList) || /[{}]/.test(line)) return null;
  return line;
}

module.exports = {
  HOST_STYLES,
  hostStyle,
  protectedNames,
  hasAlteredName,
  buildEnrichPrompt,
  mergeEnriched,
  enrichQuestions,
  aiHeadline,
};
