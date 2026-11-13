jest.mock('../services/aiService', () => ({
  generateText: jest.fn(),
  hasAlteredName: jest.requireActual('../services/aiService').hasAlteredName,
}));

const { generateText } = require('../services/aiService');
const {
  HOST_STYLES,
  hostStyle,
  hasAlteredName,
  buildEnrichPrompt,
  mergeEnriched,
  enrichQuestions,
  aiHeadline,
} = require('../services/pressAi');

const ctx = {
  trigger: 'series',
  teamName: 'Halcones de Norte',
  opponentName: 'Toros de Sur',
  series: { wins: 3, losses: 0 },
  standing: { position: 1, inPlayoffZone: true, division: 'División Oeste Norte' },
  streak: { type: 'W', length: 5 },
  rivalryHot: true,
  injured: 'Leo Paz',
};

const questions = [
  {
    id: 'q1', tag: 'series_sweep', mood: 'good', rival: true,
    text: 'Barrida ante Toros de Sur. ¿Mejor momento?',
    options: [
      { tone: 'humilde', label: 'Humilde', quote: 'Fue una buena serie.' },
      { tone: 'provocador', label: 'Provocador', quote: 'Ni lo notamos.' },
    ],
  },
  {
    id: 'q2', tag: 'injury', mood: 'bad', rival: false,
    text: '¿Cómo afecta la baja de Leo Paz?',
    options: [{ tone: 'evasivo', label: 'Evasivo', quote: 'Los médicos dirán.' }],
  },
];

const goodAi = {
  questions: [
    {
      id: 'q1',
      text: 'Tres de tres contra Toros de Sur, ¿es la mejor versión de Halcones de Norte?',
      answers: { humilde: 'Jugamos bien, pero Toros de Sur nos exigió mucho.', provocador: 'Que Toros de Sur vaya pidiendo la revancha.' },
    },
    {
      id: 'q2',
      text: 'Sin Leo Paz en el campocorto, ¿quién da un paso al frente?',
      answers: { evasivo: 'Eso lo verán en el campo.' },
    },
  ],
};

const names = ['Halcones de Norte', 'Toros de Sur', 'Leo Paz', 'División Oeste Norte'];

beforeEach(() => jest.clearAllMocks());

describe('hasAlteredName', () => {
  it('detecta "del" en lugar de "de"', () => {
    expect(hasAlteredName('Ganaron los Toros del Sur', names)).toBe(true);
  });
  it('acepta el nombre exacto y textos sin nombres', () => {
    expect(hasAlteredName('Ganaron los Toros de Sur ayer', names)).toBe(false);
    expect(hasAlteredName('Gran serie del equipo', names)).toBe(false);
  });
});

describe('hostStyle', () => {
  it('estilo estable por id y humor segun satisfaccion', () => {
    const h = hostStyle({ id: 5, name: 'Canal 7' }, 20);
    expect(h.style).toBe(HOST_STYLES[5 % HOST_STYLES.length]);
    expect(h.mood).toMatch(/molesta/);
    expect(hostStyle({ id: 5, name: 'Canal 7' }, 90).mood).toMatch(/buena relación/);
    expect(hostStyle(null).name).toBe('la prensa local');
  });
});

describe('buildEnrichPrompt', () => {
  it('incluye datos, tonos de cada pregunta y la regla de nombres', () => {
    const p = buildEnrichPrompt(ctx, questions, { id: 1, name: 'Canal 7', satisfaction: 50 }, 'Valeria Prieto');
    expect(p).toContain('Canal 7');
    expect(p).toContain('Toros de Sur');
    expect(p).toContain('"provocador":"Ni lo notamos."');
    expect(p).toMatch(/EXACTAMENTE/);
  });
});

describe('mergeEnriched', () => {
  it('reemplaza texto y citas, conserva tono/mood/rival', () => {
    const { questions: out, replaced } = mergeEnriched(questions, goodAi, names);
    expect(replaced).toBe(2);
    expect(out[0]).toMatchObject({ id: 'q1', tag: 'series_sweep', mood: 'good', rival: true, source: 'ai' });
    expect(out[0].options.map((o) => o.tone)).toEqual(['humilde', 'provocador']);
    expect(out[0].options[1].quote).toBe('Que Toros de Sur vaya pidiendo la revancha.');
  });

  it('pregunta con un tono faltante o un nombre alterado se queda con la plantilla', () => {
    const bad = {
      questions: [
        { id: 'q1', text: 'Barrida a los Toros del Sur, ¿y ahora?', answers: goodAi.questions[0].answers },
        { id: 'q2', text: 'Pregunta valida sobre la lesion', answers: {} },
      ],
    };
    const { questions: out, replaced } = mergeEnriched(questions, bad, names);
    expect(replaced).toBe(0);
    expect(out).toEqual(questions);
  });

  it('tolera basura', () => {
    expect(mergeEnriched(questions, null, names).replaced).toBe(0);
    expect(mergeEnriched(questions, { questions: 'x' }, names).replaced).toBe(0);
  });
});

describe('enrichQuestions', () => {
  it('pide JSON con el seasonId y devuelve lo mezclado', async () => {
    generateText.mockResolvedValue({ json: goodAi, model: 'm', cost: 0.0001 });
    const r = await enrichQuestions({ ctx, questions, host: null, reporter: 'X', seasonId: 7 });
    expect(generateText).toHaveBeenCalledWith(expect.objectContaining({ json: true, seasonId: 7 }));
    expect(r.replaced).toBe(2);
    expect(r.model).toBe('m');
  });

  it('null si la IA no responde o nada es valido', async () => {
    generateText.mockResolvedValue(null);
    expect(await enrichQuestions({ ctx, questions, seasonId: 7 })).toBeNull();
    generateText.mockResolvedValue({ json: { questions: [] } });
    expect(await enrichQuestions({ ctx, questions, seasonId: 7 })).toBeNull();
  });
});

describe('aiHeadline', () => {
  const perQuestion = [{ questionId: 'q1', tone: 'provocador', quote: 'Ni lo notamos.' }];
  const n = { teamName: 'Halcones de Norte', opponentName: 'Toros de Sur' };

  it('limpia comillas externas y devuelve la primera linea', async () => {
    generateText.mockResolvedValue({ text: '"El mánager de Halcones de Norte: «Ni lo notamos»"\nextra' });
    const h = await aiHeadline({ perQuestion, questions, names: n, seasonId: 7, fallback: 'F' });
    expect(h).toBe('El mánager de Halcones de Norte: «Ni lo notamos»');
  });

  it('rechaza nombres alterados, textos muy largos o vacios', async () => {
    generateText.mockResolvedValueOnce({ text: 'Los Halcones del Norte calientan el clásico' });
    expect(await aiHeadline({ perQuestion, questions, names: n, fallback: 'F' })).toBeNull();
    generateText.mockResolvedValueOnce({ text: 'x'.repeat(200) });
    expect(await aiHeadline({ perQuestion, questions, names: n, fallback: 'F' })).toBeNull();
    generateText.mockResolvedValueOnce(null);
    expect(await aiHeadline({ perQuestion, questions, names: n, fallback: 'F' })).toBeNull();
  });
});
