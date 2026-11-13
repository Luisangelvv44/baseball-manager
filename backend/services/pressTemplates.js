// Banco de plantillas de las ruedas de prensa. Puro: sin Prisma ni azar global (recibe rng),
// asi se puede testear entero. pressConferenceService arma el contexto con datos reales del
// juego y guarda en la DB las preguntas ya rellenadas.
const {
  PRESS_QUESTIONS_PER_CONFERENCE,
  PRESS_RIVALRY_PROVOKE_BONUS,
} = require('../config');

const TONES = ['humilde', 'confiado', 'provocador', 'evasivo'];

const TONE_LABELS = {
  humilde: 'Humilde',
  confiado: 'Confiado',
  provocador: 'Provocador',
  evasivo: 'Evasivo',
};

// Efecto de cada tono. confiado depende del "mood" de la pregunta (good/bad/neutral);
// la rivalidad solo se mueve en preguntas con rival.
const TONE_EFFECTS = {
  humilde: { audience: 1, satisfaction: 2, rivalry: -1 },
  confiado: { audience: { good: 3, neutral: 1, bad: -2 }, satisfaction: 1, rivalry: 0 },
  provocador: { audience: 5, satisfaction: -3, rivalry: PRESS_RIVALRY_PROVOKE_BONUS },
  evasivo: { audience: -2, satisfaction: 0, rivalry: 0 },
};

const REPORTER_FIRST = ['Valeria', 'Ignacio', 'Dolores', 'Matías', 'Celeste', 'Bruno', 'Ximena', 'Octavio', 'Renée', 'Joaquín', 'Amara', 'Teodoro'];
const REPORTER_LAST = ['Saldívar', 'Okafor', 'Lindqvist', 'Barrenechea', 'Moreau', 'Castañeda', 'Halloran', 'Prieto', 'Navarrete', 'Kowalski', 'Ibarra', 'Duarte'];

const FEAT_LABELS = {
  no_hitter: 'el juego sin hit',
  cycle: 'el ciclo',
  multi_hr: 'la exhibición de jonrones',
  walkoff: 'el walk-off',
};

// group: solo una pregunta por grupo en la misma rueda. rival: la pregunta va sobre el
// oponente (habilita el tono provocador y mueve la rivalidad).
const QUESTIONS = [
  // ---------- Resultado de la serie ----------
  {
    tag: 'series_sweep', group: 'series', priority: 100, mood: 'good', rival: true,
    when: (c) => c.trigger === 'series' && c.series && c.series.losses === 0 && c.series.wins > 0,
    texts: [
      'Barrida ante {opponent}: {wins} de {wins}. ¿Es este el mejor momento del equipo?',
      '{team} no le dio ni un respiro a {opponent}. ¿Qué cambió en el vestuario?',
    ],
    answers: {
      humilde: ['Fue una buena serie, pero {opponent} es un gran equipo. Mañana empezamos de cero.'],
      confiado: ['Así es como jugamos cuando todo encaja. Y todavía no han visto lo mejor de nosotros.'],
      provocador: ['¿{opponent}? Ni lo notamos. Que vayan preparando la revancha, porque la van a necesitar.'],
      evasivo: ['Prefiero no hablar de resultados. Ganamos tres partidos, nada más.'],
    },
  },
  {
    tag: 'series_swept', group: 'series', priority: 100, mood: 'bad', rival: true,
    when: (c) => c.trigger === 'series' && c.series && c.series.wins === 0 && c.series.losses > 0,
    texts: [
      '{opponent} les barrió {losses}-0. ¿Qué explicación le da a la afición?',
      'Tres derrotas seguidas ante {opponent}. ¿Le preocupa el estado del equipo?',
    ],
    answers: {
      humilde: ['No hay excusas. {opponent} fue mejor y nos toca trabajar el doble.'],
      confiado: ['Una mala serie no define una temporada. Este equipo va a reaccionar, se lo garantizo.'],
      provocador: ['{opponent} tuvo suerte esta vez. Que no se acostumbren, la próxima vez será distinto.'],
      evasivo: ['Estamos analizando muchas cosas internamente. No voy a entrar en detalles.'],
    },
  },
  {
    tag: 'series_won', group: 'series', priority: 90, mood: 'good', rival: true,
    when: (c) => c.trigger === 'series' && c.series && c.series.wins > c.series.losses,
    texts: [
      'Serie ganada {wins}-{losses} ante {opponent}. ¿Satisfecho con el rendimiento?',
      '{team} se queda con la serie frente a {opponent}. ¿Qué destaca de estos partidos?',
    ],
    answers: {
      humilde: ['Contento, aunque perdimos uno que pudimos ganar. Hay que seguir puliendo detalles.'],
      confiado: ['Ganar series es nuestra costumbre. El equipo sabe a lo que juega.'],
      provocador: ['{opponent} nos ganó un partido y seguro lo celebran como un campeonato. Nosotros nos llevamos la serie.'],
      evasivo: ['Fue una serie. Ahora pensamos en la siguiente.'],
    },
  },
  {
    tag: 'series_lost', group: 'series', priority: 90, mood: 'bad', rival: true,
    when: (c) => c.trigger === 'series' && c.series && c.series.losses > c.series.wins,
    texts: [
      'Serie perdida {wins}-{losses} ante {opponent}. ¿Dónde se escapó?',
      '{opponent} se llevó la serie. ¿Faltó algo en los momentos clave?',
    ],
    answers: {
      humilde: ['Nos faltó contundencia. Lo asumo y lo corregiremos.'],
      confiado: ['Estuvimos cerca. Con este nivel vamos a ganar muchas más series de las que perdemos.'],
      provocador: ['{opponent} ganó la serie, pero no ganó el respeto de nadie con ese juego.'],
      evasivo: ['No tengo mucho que decir. Hay que mirar adelante.'],
    },
  },

  // ---------- Playoffs ----------
  {
    tag: 'playoff_champion', group: 'playoff', priority: 120, mood: 'good', rival: true,
    when: (c) => c.playoff?.outcome === 'champion',
    texts: [
      '¡{team} campeón tras vencer a {opponent} en la final! ¿Qué siente en este momento?',
      'Campeones. ¿A quién le dedica este título?',
    ],
    answers: {
      humilde: ['A la afición y a estos jugadores, que se dejaron todo. {opponent} fue un rival enorme.'],
      confiado: ['Lo dije desde el principio: este equipo estaba hecho para ganar. Y no será el último.'],
      provocador: ['A todos los que dudaron. Y a {opponent}, que tendrá que ver nuestra celebración por la tele.'],
      evasivo: ['Déjenme disfrutarlo primero. Ya habrá tiempo para hablar.'],
    },
  },
  {
    tag: 'playoff_advanced', group: 'playoff', priority: 110, mood: 'good', rival: true,
    when: (c) => c.playoff?.outcome === 'advanced',
    texts: [
      '{team} elimina a {opponent} y avanza en los playoffs. ¿Hasta dónde puede llegar?',
      'Serie de {round} superada ante {opponent}. ¿Ya piensa en el siguiente rival?',
    ],
    answers: {
      humilde: ['Un paso más, nada más. {opponent} nos exigió al máximo.'],
      confiado: ['Hasta el final. Este grupo no se conforma con participar.'],
      provocador: ['{opponent} ya puede irse de vacaciones. Nosotros todavía tenemos trabajo.'],
      evasivo: ['Partido a partido. No voy a hacer pronósticos.'],
    },
  },
  {
    tag: 'playoff_eliminated', group: 'playoff', priority: 110, mood: 'bad', rival: true,
    when: (c) => c.playoff?.outcome === 'eliminated',
    texts: [
      '{opponent} los deja fuera de los playoffs. ¿Qué balance hace de la temporada?',
      'Eliminados en {round}. ¿Qué le faltó a {team}?',
    ],
    answers: {
      humilde: ['Felicito a {opponent}. Fueron mejores y nos vamos a casa con la cabeza alta.'],
      confiado: ['Duele, pero la base está. El año que viene volveremos más fuertes.'],
      provocador: ['{opponent} pasó, sí. Veremos cuánto les dura la alegría.'],
      evasivo: ['Ahora no es momento de balances. Necesito pensar con calma.'],
    },
  },
  {
    tag: 'playoff_group_qualified', group: 'playoff', priority: 110, mood: 'good', rival: false,
    when: (c) => c.playoff?.outcome === 'group_qualified',
    texts: [
      '{team} supera la liguilla y se mete en cuartos. ¿Qué mensaje manda a sus rivales?',
      'Clasificados a cuartos. ¿Cómo llega el equipo físicamente?',
    ],
    answers: {
      humilde: ['Superamos un grupo muy duro. Ahora toca descansar y preparar bien la serie.'],
      confiado: ['Que nos estudien. Llegamos en el mejor momento.'],
      evasivo: ['El mensaje lo daremos en el campo.'],
    },
  },
  {
    tag: 'playoff_group_eliminated', group: 'playoff', priority: 110, mood: 'bad', rival: false,
    when: (c) => c.playoff?.outcome === 'group_eliminated',
    texts: [
      '{team} cae en la liguilla de playoffs. ¿Fue una decepción?',
      'Fuera en la fase de grupos. ¿Qué cambios vienen para el próximo año?',
    ],
    answers: {
      humilde: ['Sí, lo es. Esperábamos más y asumo mi parte de responsabilidad.'],
      confiado: ['Llegar a playoffs ya dice mucho de este proyecto. Volveremos.'],
      evasivo: ['Los cambios se hablarán dentro del club, no aquí.'],
    },
  },

  // ---------- Rivalidad ----------
  {
    tag: 'rivalry_hot', group: 'rivalry', priority: 80, mood: 'neutral', rival: true,
    when: (c) => c.opponentName && c.rivalryHot,
    texts: [
      'La rivalidad con {opponent} está más encendida que nunca. ¿Cómo la vive usted?',
      'Los aficionados de {opponent} no los quieren ni ver. ¿Algo que decirles?',
    ],
    answers: {
      humilde: ['Respeto mucho a {opponent}. Rivalidad sí, pero dentro del campo.'],
      confiado: ['Las rivalidades se ganan jugando, y últimamente las estamos ganando nosotros.'],
      provocador: ['Que sigan gritando. Nos encanta jugar en su estadio y verlo vaciarse en la novena.'],
      evasivo: ['Es un rival más del calendario. Nada especial.'],
    },
  },

  // ---------- Rachas ----------
  {
    tag: 'win_streak', group: 'streak', priority: 70, mood: 'good', rival: false,
    when: (c) => c.streak?.type === 'W' && c.streak.length >= 3,
    texts: [
      '{streak} victorias seguidas. ¿Cuál es el secreto de esta racha?',
      'El equipo encadena {streak} triunfos. ¿Hay que soñar en grande?',
    ],
    answers: {
      humilde: ['No hay secreto, solo trabajo. Las rachas se acaban y hay que estar preparados.'],
      confiado: ['El secreto es que somos buenos. Y la racha no tiene por qué acabar pronto.'],
      evasivo: ['No me gusta hablar de rachas. Trae mala suerte.'],
    },
  },
  {
    tag: 'lose_streak', group: 'streak', priority: 75, mood: 'bad', rival: false,
    when: (c) => c.streak?.type === 'L' && c.streak.length >= 3,
    texts: [
      '{streak} derrotas consecutivas. ¿Está en riesgo su puesto?',
      'El equipo no gana en {streak} partidos. ¿Qué va a cambiar?',
    ],
    answers: {
      humilde: ['La responsabilidad es mía. Vamos a revisar todo, empezando por mí.'],
      confiado: ['Mi puesto no está en duda. Este equipo saldrá de esto antes de lo que creen.'],
      evasivo: ['Esa pregunta deberían hacérsela a la directiva.'],
    },
  },

  // ---------- Clasificación ----------
  {
    tag: 'standing_top', group: 'standing', priority: 60, mood: 'good', rival: false,
    when: (c) => c.trigger === 'series' && c.standing?.position === 1,
    texts: [
      '{team} lidera la {division}. ¿Se siente favorito?',
      'Primeros de la {division}. ¿Le pesa la presión de ser el equipo a batir?',
    ],
    answers: {
      humilde: ['Queda mucha temporada. El liderato no se celebra hasta el final.'],
      confiado: ['Somos favoritos porque nos lo hemos ganado. Y pensamos seguir arriba.'],
      evasivo: ['La tabla la miro en septiembre.'],
    },
  },
  {
    tag: 'standing_out', group: 'standing', priority: 65, mood: 'bad', rival: false,
    when: (c) => c.trigger === 'series' && c.standing && !c.standing.inPlayoffZone,
    texts: [
      '{team} está {position}.º en la {division}, fuera de puestos de playoffs. ¿Hay tiempo para remontar?',
      'Fuera de zona de playoffs. ¿Cree que este equipo puede clasificarse?',
    ],
    answers: {
      humilde: ['Tenemos que mejorar mucho. Lo sabemos y estamos en ello.'],
      confiado: ['Claro que sí. Vamos a estar en playoffs, apúntelo.'],
      evasivo: ['No miro la tabla. Solo el próximo partido.'],
    },
  },
  {
    tag: 'standing_in', group: 'standing', priority: 40, mood: 'neutral', rival: false,
    when: (c) => c.trigger === 'series' && c.standing?.inPlayoffZone && c.standing.position > 1,
    texts: [
      '{team} es {position}.º en la {division}, en zona de playoffs. ¿Le basta con eso?',
    ],
    answers: {
      humilde: ['Es un buen punto de partida, pero todavía no hemos conseguido nada.'],
      confiado: ['No. Queremos el primer puesto y vamos a por él.'],
      evasivo: ['Estamos donde estamos. Ya veremos al final.'],
    },
  },

  // ---------- Hazañas, lesiones, mercado ----------
  {
    tag: 'feat', group: 'feat', priority: 55, mood: 'good', rival: false,
    when: (c) => !!c.feat,
    texts: [
      'Todavía se habla de {feat} de {player}. ¿Qué le dijo después del partido?',
      '{player} firmó {feat}. ¿Está ante una futura estrella?',
    ],
    answers: {
      humilde: ['Le felicité, pero el mérito es de todo el equipo que lo respaldó.'],
      confiado: ['{player} es de los mejores de la liga, y esto es solo el comienzo.'],
      evasivo: ['Esas cosas me las guardo para el vestuario.'],
    },
  },
  {
    tag: 'injury', group: 'injury', priority: 50, mood: 'bad', rival: false,
    when: (c) => !!c.injured,
    texts: [
      '¿Cómo afecta al equipo la baja de {injured}?',
      '{injured} sigue en la enfermería. ¿Hay fecha para su regreso?',
    ],
    answers: {
      humilde: ['Es una baja muy sensible. Otros tendrán que dar un paso al frente.'],
      confiado: ['Tenemos plantilla de sobra para cubrirlo. No vamos a bajar el nivel.'],
      evasivo: ['Los médicos darán la información cuando corresponda.'],
    },
  },
  {
    tag: 'deadline', group: 'market', priority: 45, mood: 'neutral', rival: false,
    when: (c) => c.trigger === 'series' && c.deadlineSoon,
    texts: [
      'Se acerca el cierre de traspasos. ¿Va a reforzar el equipo?',
      'Faltan pocos días para la fecha límite de traspasos. ¿Hay alguna operación en marcha?',
    ],
    answers: {
      humilde: ['Estamos atentos, pero confío en los que tengo.'],
      confiado: ['Si sale algo que nos haga campeones, lo haremos. Tenemos con qué.'],
      evasivo: ['No hablo de jugadores de otros equipos.'],
    },
  },

  // ---------- Comodín ----------
  {
    tag: 'fans', group: 'fans', priority: 10, mood: 'neutral', rival: false,
    when: () => true,
    texts: [
      '¿Qué mensaje le manda a la afición de {team}?',
      '¿Cómo valora el apoyo del público en estas semanas?',
    ],
    answers: {
      humilde: ['Solo gracias. Sin ellos este equipo no sería nada.'],
      confiado: ['Que sigan llenando el estadio, porque les vamos a dar muchas alegrías.'],
      evasivo: ['Que sigan apoyando, como siempre.'],
    },
  },
];

// Reemplaza {clave} por vars[clave]; las claves sin valor quedan como texto vacio.
function fillTemplate(str, vars) {
  return str.replace(/\{(\w+)\}/g, (_, key) => (vars[key] == null ? '' : String(vars[key])));
}

function pick(arr, rng) {
  return arr[Math.floor(rng() * arr.length) % arr.length];
}

function reporterName(rng) {
  return `${pick(REPORTER_FIRST, rng)} ${pick(REPORTER_LAST, rng)}`;
}

function templateVars(ctx) {
  return {
    team: ctx.teamName,
    opponent: ctx.opponentName,
    wins: ctx.series?.wins,
    losses: ctx.series?.losses,
    streak: ctx.streak?.length,
    position: ctx.standing?.position,
    division: ctx.standing?.division ?? 'división',
    player: ctx.feat?.player,
    feat: ctx.feat ? (FEAT_LABELS[ctx.feat.type] ?? 'su gran actuación') : null,
    injured: ctx.injured,
    round: ctx.playoff?.roundLabel,
  };
}

// Elige hasta PRESS_QUESTIONS_PER_CONFERENCE preguntas aplicables (una por grupo, por prioridad;
// el azar solo desempata y elige la variante de texto) y las devuelve ya rellenadas.
function pickQuestions(ctx, rng = Math.random) {
  const eligible = QUESTIONS
    .filter((q) => (!q.rival || ctx.opponentName) && q.when(ctx))
    .map((q) => ({ q, tie: rng() }))
    .sort((a, b) => b.q.priority - a.q.priority || a.tie - b.tie);

  const usedGroups = new Set();
  const chosen = [];
  for (const { q } of eligible) {
    if (usedGroups.has(q.group)) continue;
    usedGroups.add(q.group);
    chosen.push(q);
    if (chosen.length >= PRESS_QUESTIONS_PER_CONFERENCE) break;
  }

  const vars = templateVars(ctx);
  return chosen.map((q, i) => ({
    id: `q${i + 1}`,
    tag: q.tag,
    mood: q.mood,
    rival: q.rival,
    text: fillTemplate(pick(q.texts, rng), vars),
    options: TONES
      .filter((tone) => q.answers[tone] && (tone !== 'provocador' || q.rival))
      .map((tone) => ({ tone, label: TONE_LABELS[tone], quote: fillTemplate(pick(q.answers[tone], rng), vars) })),
  }));
}

function toneEffect(tone, mood, rival) {
  const e = TONE_EFFECTS[tone];
  const audience = typeof e.audience === 'number' ? e.audience : (e.audience[mood] ?? 0);
  return { audience, satisfaction: e.satisfaction, rivalry: rival ? e.rivalry : 0 };
}

// answers: [{ questionId, tone }]. Devuelve los deltas totales y por pregunta, mas las citas
// elegidas. Lanza si falta una respuesta o el tono no es una opcion valida de esa pregunta.
function computeEffects(questions, answers) {
  const byId = new Map((answers ?? []).map((a) => [a.questionId, a.tone]));
  const totals = { audience: 0, satisfaction: 0, rivalry: 0 };
  const perQuestion = questions.map((q) => {
    const tone = byId.get(q.id);
    const option = q.options.find((o) => o.tone === tone);
    if (!option) {
      const err = new Error(`Respuesta inválida para la pregunta ${q.id}`);
      err.code = 'PRESS_INVALID_ANSWER';
      throw err;
    }
    const effect = toneEffect(tone, q.mood, q.rival);
    totals.audience += effect.audience;
    totals.satisfaction += effect.satisfaction;
    totals.rivalry += effect.rivalry;
    return { questionId: q.id, tone, quote: option.quote, ...effect };
  });
  return { ...totals, perQuestion };
}

const HEADLINE_TONE_ORDER = ['provocador', 'confiado', 'humilde', 'evasivo'];

function shortQuote(quote) {
  const first = quote.split(/(?<=[.!?])\s/)[0].replace(/[.]$/, '');
  return first.length > 90 ? `${first.slice(0, 87).trimEnd()}…` : first;
}

// Titular de la Gaceta a partir de la respuesta mas llamativa.
function pressHeadline(perQuestion, { teamName, opponentName }) {
  const best = [...perQuestion].sort(
    (a, b) => HEADLINE_TONE_ORDER.indexOf(a.tone) - HEADLINE_TONE_ORDER.indexOf(b.tone)
  )[0];
  const quote = `«${shortQuote(best.quote)}»`;
  switch (best.tone) {
    case 'provocador':
      return opponentName
        ? `${quote}: el mánager de ${teamName} calienta la rivalidad con ${opponentName}`
        : `${quote}: el mánager de ${teamName} lanza un desafío`;
    case 'confiado':
      return `${quote}: el mánager de ${teamName} se muestra seguro ante la prensa`;
    case 'humilde':
      return `${quote}: el mánager de ${teamName} pide calma`;
    default:
      return `${quote}: el mánager de ${teamName} esquiva las preguntas`;
  }
}

function skippedHeadline({ teamName }) {
  return `El mánager de ${teamName} no se presenta ante la prensa`;
}

module.exports = {
  TONES,
  TONE_LABELS,
  TONE_EFFECTS,
  QUESTIONS,
  fillTemplate,
  reporterName,
  pickQuestions,
  toneEffect,
  computeEffects,
  pressHeadline,
  skippedHeadline,
};
