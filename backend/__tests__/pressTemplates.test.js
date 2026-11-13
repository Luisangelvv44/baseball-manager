const {
  QUESTIONS,
  TONES,
  fillTemplate,
  pickQuestions,
  computeEffects,
  pressHeadline,
  skippedHeadline,
  reporterName,
} = require('../services/pressTemplates');
const { PRESS_QUESTIONS_PER_CONFERENCE, PRESS_RIVALRY_PROVOKE_BONUS } = require('../config');

// rng determinista
function seq(values) {
  let i = 0;
  return () => values[i++ % values.length];
}

const baseCtx = {
  trigger: 'series',
  teamName: 'Halcones de Norte',
  opponentName: 'Toros de Sur',
  series: { wins: 3, losses: 0 },
  playoff: null,
  standing: { position: 1, inPlayoffZone: true, division: 'División Oeste Norte' },
  streak: { type: 'W', length: 5 },
  rivalryHot: true,
  feat: { type: 'cycle', player: 'Ana Ruiz' },
  injured: 'Leo Paz',
  deadlineSoon: true,
};

describe('fillTemplate', () => {
  it('replaces known keys and blanks unknown ones', () => {
    expect(fillTemplate('{a} vs {b}{c}', { a: 'X', b: 'Y' })).toBe('X vs Y');
  });
});

describe('pickQuestions', () => {
  it('returns the configured number of questions, one per group, highest priority first', () => {
    const qs = pickQuestions(baseCtx, seq([0.1, 0.5, 0.9]));
    expect(qs).toHaveLength(PRESS_QUESTIONS_PER_CONFERENCE);
    expect(qs[0].tag).toBe('series_sweep');
    expect(qs.map((q) => q.id)).toEqual(['q1', 'q2', 'q3']);
    const groups = qs.map((q) => QUESTIONS.find((x) => x.tag === q.tag).group);
    expect(new Set(groups).size).toBe(groups.length);
  });

  it('fills every placeholder', () => {
    for (let i = 0; i < 20; i++) {
      const qs = pickQuestions(baseCtx, Math.random);
      for (const q of qs) {
        expect(q.text).not.toMatch(/\{\w+\}/);
        for (const o of q.options) expect(o.quote).not.toMatch(/\{\w+\}/);
      }
    }
  });

  it('only offers the provocative tone on questions about the opponent', () => {
    const qs = pickQuestions(baseCtx, Math.random);
    for (const q of qs) {
      const tones = q.options.map((o) => o.tone);
      expect(tones.includes('provocador')).toBe(q.rival);
    }
  });

  it('skips rival questions when there is no opponent and falls back to the fans question', () => {
    const qs = pickQuestions({
      trigger: 'playoff_group', teamName: 'Halcones', opponentName: null,
      playoff: { outcome: 'group_qualified' }, streak: { type: 'W', length: 1 },
    }, seq([0.3]));
    expect(qs.map((q) => q.tag)).toEqual(['playoff_group_qualified', 'fans']);
    expect(qs.every((q) => !q.rival)).toBe(true);
  });

  it('picks the series result matching the record', () => {
    const lost = pickQuestions({ ...baseCtx, series: { wins: 1, losses: 2 } }, seq([0.5]));
    expect(lost[0].tag).toBe('series_lost');
    const swept = pickQuestions({ ...baseCtx, series: { wins: 0, losses: 3 } }, seq([0.5]));
    expect(swept[0].tag).toBe('series_swept');
  });

  it('every question in the bank defines humilde, confiado and evasivo answers', () => {
    for (const q of QUESTIONS) {
      for (const tone of ['humilde', 'confiado', 'evasivo']) expect(q.answers[tone]?.length).toBeGreaterThan(0);
      if (q.rival) expect(q.answers.provocador?.length).toBeGreaterThan(0);
    }
  });
});

describe('computeEffects', () => {
  const questions = [
    { id: 'q1', mood: 'good', rival: true, options: TONES.map((tone) => ({ tone, quote: `${tone}.` })) },
    { id: 'q2', mood: 'bad', rival: false, options: ['humilde', 'confiado', 'evasivo'].map((tone) => ({ tone, quote: `${tone}.` })) },
  ];

  it('adds up the tone effects', () => {
    const e = computeEffects(questions, [{ questionId: 'q1', tone: 'provocador' }, { questionId: 'q2', tone: 'confiado' }]);
    expect(e.audience).toBe(5 - 2);
    expect(e.satisfaction).toBe(-3 + 1);
    expect(e.rivalry).toBe(PRESS_RIVALRY_PROVOKE_BONUS);
    expect(e.perQuestion.map((p) => p.tone)).toEqual(['provocador', 'confiado']);
  });

  it('confiado scores better on good moods', () => {
    const e = computeEffects(questions, [{ questionId: 'q1', tone: 'confiado' }, { questionId: 'q2', tone: 'humilde' }]);
    expect(e.audience).toBe(3 + 1);
    expect(e.rivalry).toBe(0);
  });

  it('humilde cools the rivalry on rival questions', () => {
    const e = computeEffects(questions, [{ questionId: 'q1', tone: 'humilde' }, { questionId: 'q2', tone: 'evasivo' }]);
    expect(e.rivalry).toBe(-1);
    expect(e.audience).toBe(1 - 2);
  });

  it('throws on a missing answer or an invalid tone', () => {
    expect(() => computeEffects(questions, [{ questionId: 'q1', tone: 'humilde' }])).toThrow(/q2/);
    expect(() => computeEffects(questions, [
      { questionId: 'q1', tone: 'humilde' }, { questionId: 'q2', tone: 'provocador' },
    ])).toThrow();
  });
});

describe('headlines', () => {
  it('quotes the most striking answer', () => {
    const h = pressHeadline(
      [{ tone: 'humilde', quote: 'Calma. Todo bien.' }, { tone: 'provocador', quote: 'Que tiemblen. Vamos a por ellos.' }],
      { teamName: 'Halcones', opponentName: 'Toros' }
    );
    expect(h).toBe('«Que tiemblen»: el mánager de Halcones calienta la rivalidad con Toros');
  });

  it('reports a skipped conference', () => {
    expect(skippedHeadline({ teamName: 'Halcones' })).toMatch(/no se presenta/);
  });

  it('builds a reporter name', () => {
    expect(reporterName(seq([0, 0]))).toMatch(/^\S+ \S+$/);
  });
});
