// Mensajes de plantilla de los GMs CPU en los traspasos. Puros: reciben los datos ya calculados
// por tradeService (explainTradeDecision / generateCpuTradeOffers). Son el respaldo de tradeAi.js.

const POSITION_NAMES = {
  P: 'lanzador', C: 'receptor', '1B': 'primera base', '2B': 'segunda base', '3B': 'tercera base',
  SS: 'campocorto', LF: 'jardinero izquierdo', CF: 'jardinero central', RF: 'jardinero derecho', DH: 'bateador designado',
};

function positionName(pos) {
  return POSITION_NAMES[pos] ?? pos;
}

function fullName(p) {
  return `${p.first_name} ${p.last_name}`;
}

// $1.250.000 -> "$1.3M", $350.000 -> "$350K"
function formatMoney(n) {
  const v = Number(n) || 0;
  if (v >= 1_000_000) return `$${(Math.round(v / 100_000) / 10).toString()}M`;
  if (v >= 1_000) return `$${Math.round(v / 1_000)}K`;
  return `$${v}`;
}

function concernPhrase(c) {
  switch (c.type) {
    case 'veterano': return `${fullName(c.player)} tiene ${c.player.age} años y no queremos ese riesgo`;
    case 'caro': return `el salario de ${fullName(c.player)} es demasiado alto para lo que rinde`;
    case 'titular': return `${fullName(c.player)} es nuestro titular y no lo vamos a regalar`;
    case 'pides_efectivo': return `además nos pides ${formatMoney(c.amount)} en efectivo`;
    default: return null;
  }
}

const CLOSENESS_OPENERS = {
  cerca: 'Estamos cerca, pero todavía no.',
  lejos: 'Gracias por la propuesta, pero así no nos sirve.',
  muy_lejos: 'Con todo respeto, esta oferta está muy lejos de lo que buscamos.',
};

// Rechazo de una propuesta del usuario.
function rejectionMessage(explanation) {
  const parts = [CLOSENESS_OPENERS[explanation.closeness] ?? CLOSENESS_OPENERS.lejos];
  const reasons = explanation.concerns.slice(0, 2).map(concernPhrase).filter(Boolean);
  if (reasons.length) {
    const text = reasons.join('; ');
    parts.push(`${text.charAt(0).toUpperCase()}${text.slice(1)}.`);
  }
  const hints = [];
  if (explanation.needPosition) hints.push(`incluyes un ${positionName(explanation.needPosition)}`);
  if (explanation.cashNeeded > 0) hints.push(`añades unos ${formatMoney(explanation.cashNeeded)} en efectivo`);
  if (hints.length) parts.push(`Si ${hints.join(' o ')}, lo volvemos a hablar.`);
  return parts.join(' ');
}

function acceptanceMessage({ incoming }) {
  const names = incoming.map(fullName);
  const who = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}`;
  return `Trato hecho. ${who} encaja en lo que buscábamos. Un placer hacer negocios.`;
}

// Oferta que la CPU le manda al usuario.
function offerPitchMessage({ needPosition, targetPlayer, surplusPlayer, cashOffered }) {
  const cash = cashOffered > 0 ? ` y ${formatMoney(cashOffered)} en efectivo` : '';
  return `Nos falta un ${positionName(needPosition)} y ${fullName(targetPlayer)} es justo lo que buscamos. `
    + `Te ofrecemos a ${fullName(surplusPlayer)}${cash}. Creemos que es un trato justo para ambos.`;
}

module.exports = {
  POSITION_NAMES,
  positionName,
  fullName,
  formatMoney,
  rejectionMessage,
  acceptanceMessage,
  offerPitchMessage,
};
