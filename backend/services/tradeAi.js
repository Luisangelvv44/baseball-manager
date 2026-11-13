// Mensajes de los GMs CPU con IA. La decision (aceptar/rechazar, que se ofrece, cuanto efectivo)
// ya la tomo tradeService; la IA solo redacta. Si falla o no pasa la validacion, el llamador usa
// la plantilla de tradeMessages.js.
const { generateText, hasAlteredName } = require('./aiService');
const {
  positionName,
  fullName,
  formatMoney,
  rejectionMessage,
  acceptanceMessage,
  offerPitchMessage,
} = require('./tradeMessages');

const MAX_MESSAGE_CHARS = 420;
const DEFAULT_TIMEOUT_MS = 8_000;

// Personalidad del GM derivada de su agresividad en subastas (0.05 - 0.25).
function gmStyle(bidAggressiveness) {
  const a = Number(bidAggressiveness ?? 0.1);
  if (a >= 0.18) return 'agresivo y directo, habla de ganar ya, frases cortas';
  if (a <= 0.09) return 'conservador y cauteloso, prudente con el dinero y los riesgos';
  return 'cordial y negociador, educado pero firme';
}

const KIND_GOALS = {
  rejection: 'Rechazas la propuesta del otro mánager. Explica los motivos y termina con la pista para retomar la negociación.',
  acceptance: 'Aceptas la propuesta del otro mánager. Mensaje breve y satisfecho.',
  offer: 'Le propones un traspaso al otro mánager. Explica qué necesitas y por qué la oferta le conviene.',
};

const SYSTEM = 'Eres el gerente general (GM) de un equipo de béisbol en un juego de gestión. '
  + 'Escribes en español neutro latinoamericano, en primera persona del plural ("nosotros"), dirigiéndote al otro mánager. '
  + 'Nunca inventas datos, cifras ni nombres que no se te den.';

// Tokens numericos de un texto ("1.3", "34", "350"), para comprobar que la IA no invente cifras.
function numberTokens(text) {
  return (text.match(/\d+(?:[.,]\d+)?/g) ?? []).map((t) => t.replace(',', '.'));
}

function buildPrompt({ kind, teamName, otherTeamName, style, facts, fallback }) {
  return [
    `Eres el GM de ${teamName}. Tu estilo: ${style}.`,
    `Le escribes al mánager de ${otherTeamName}.`,
    KIND_GOALS[kind],
    '',
    'Datos (los únicos que puedes usar):',
    ...facts.map((f) => `- ${f}`),
    '',
    'Reglas:',
    '- 2 o 3 frases, máximo 350 caracteres, sin saludo ni firma.',
    '- Copia los nombres propios EXACTAMENTE (equipos y jugadores, sin cambiar "de" por "del").',
    '- Solo puedes usar las cifras que aparecen en los datos, escritas igual.',
    '- Si los datos incluyen una pista para negociar, debe aparecer en el mensaje.',
    `Mensaje de referencia (redáctalo distinto, con tu estilo): ${fallback}`,
    'Responde solo con el mensaje.',
  ].join('\n');
}

function validMessage(text, { names, facts }) {
  if (typeof text !== 'string') return false;
  const t = text.trim();
  if (t.length < 20 || t.length > MAX_MESSAGE_CHARS || /[{}]/.test(t)) return false;
  if (hasAlteredName(t, names)) return false;
  const allowed = new Set(numberTokens(facts.join(' ')));
  return numberTokens(t).every((n) => allowed.has(n));
}

// opts: { kind, teamName, otherTeamName, bidAggressiveness, facts, names, fallback, seasonId, timeoutMs }
// Devuelve el mensaje de la IA o null.
async function writeGmMessage(opts) {
  const result = await generateText({
    system: SYSTEM,
    prompt: buildPrompt({ ...opts, style: gmStyle(opts.bidAggressiveness) }),
    maxTokens: 200,
    seasonId: opts.seasonId,
    timeoutMs: opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  });
  if (!result?.text) return null;
  const text = result.text.trim().replace(/^["'“”]+|["'“”]+$/g, '').trim();
  return validMessage(text, opts) ? text : null;
}

function playerFact(p) {
  return `${fullName(p)} (${positionName(p.position)}, ${p.age} años, destreza ${p.current_skill}, salario ${formatMoney(p.salary)}/año)`;
}

const CONCERN_FACTS = {
  veterano: (c) => `Motivo: ${fullName(c.player)} tiene ${c.player.age} años, riesgo por edad`,
  caro: (c) => `Motivo: el salario de ${fullName(c.player)} es demasiado alto para su rendimiento`,
  titular: (c) => `Motivo: ${fullName(c.player)} es nuestro titular en su posición`,
  pides_efectivo: (c) => `Motivo: además nos piden ${formatMoney(c.amount)} en efectivo`,
};

const CLOSENESS_FACTS = {
  cerca: 'La oferta está cerca de ser aceptable',
  lejos: 'A la oferta le falta bastante',
  muy_lejos: 'La oferta está muy lejos de ser aceptable',
};

// Respuesta del GM a una propuesta del usuario. Devuelve { message, source }.
async function composeDecisionMessage({ cpuTeam, userTeamName, trade, explanation, seasonId }) {
  const incoming = trade.items.filter((i) => i.from_team_id !== cpuTeam.id).map((i) => i.player);
  const outgoing = trade.items.filter((i) => i.from_team_id === cpuTeam.id).map((i) => i.player);
  const fallback = explanation.accepted
    ? acceptanceMessage({ incoming })
    : rejectionMessage(explanation);

  const facts = [
    `Nos ofrecen: ${incoming.map(playerFact).join('; ')}`,
    `Nos piden: ${outgoing.map(playerFact).join('; ')}`,
  ];
  if (Number(trade.cash_offered) > 0) facts.push(`Efectivo que nos ofrecen: ${formatMoney(trade.cash_offered)}`);
  if (!explanation.accepted) {
    facts.push(CLOSENESS_FACTS[explanation.closeness] ?? CLOSENESS_FACTS.lejos);
    for (const c of explanation.concerns.slice(0, 2)) facts.push(CONCERN_FACTS[c.type](c));
    if (explanation.needPosition) facts.push(`Pista: aceptaríamos más fácil si incluyen un ${positionName(explanation.needPosition)}`);
    if (explanation.cashNeeded > 0) facts.push(`Pista: con unos ${formatMoney(explanation.cashNeeded)} más en efectivo lo cerraríamos`);
  }

  const text = await writeGmMessage({
    kind: explanation.accepted ? 'acceptance' : 'rejection',
    teamName: cpuTeam.name,
    otherTeamName: userTeamName,
    bidAggressiveness: cpuTeam.bid_aggressiveness,
    facts,
    names: [cpuTeam.name, userTeamName, ...incoming.map(fullName), ...outgoing.map(fullName)],
    fallback,
    seasonId,
  }).catch(() => null);
  return text ? { message: text, source: 'ai' } : { message: fallback, source: 'template' };
}

// Mensaje que acompana una oferta de la CPU al usuario. Devuelve { message, source }.
async function composeOfferMessage({ cpuTeam, userTeamName, needPosition, targetPlayer, surplusPlayer, cashOffered, seasonId, timeoutMs }) {
  const fallback = offerPitchMessage({ needPosition, targetPlayer, surplusPlayer, cashOffered });
  const facts = [
    `Nuestra posición más floja: ${positionName(needPosition)}`,
    `Queremos: ${playerFact(targetPlayer)}`,
    `Ofrecemos: ${playerFact(surplusPlayer)}`,
  ];
  if (cashOffered > 0) facts.push(`Además ofrecemos ${formatMoney(cashOffered)} en efectivo`);

  const text = await writeGmMessage({
    kind: 'offer',
    teamName: cpuTeam.name,
    otherTeamName: userTeamName,
    bidAggressiveness: cpuTeam.bid_aggressiveness,
    facts,
    names: [cpuTeam.name, userTeamName, fullName(targetPlayer), fullName(surplusPlayer)],
    fallback,
    seasonId,
    timeoutMs,
  }).catch(() => null);
  return text ? { message: text, source: 'ai' } : { message: fallback, source: 'template' };
}

module.exports = {
  composeDecisionMessage,
  composeOfferMessage,
  gmStyle,
  numberTokens,
  buildPrompt,
  validMessage,
  writeGmMessage,
};
