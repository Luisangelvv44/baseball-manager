const { buildIntroText, availableHooks, numberToSpanish, seededRng } = require('../services/introNarration');

const baseFacts = {
  city: 'Brisko',
  homeName: 'Brisko Wolves',
  awayName: 'Thalgrove Miners',
  homePitcher: 'Diego Molina',
  awayPitcher: 'Hiroshi Takahashi',
  playoffRound: null,
  isRivalry: false,
  streaks: [],
  hrLeader: null,
  heir: null,
};

describe('numberToSpanish', () => {
  it.each([
    [0, 'cero'], [7, 'siete'], [16, 'dieciséis'], [22, 'veintidós'], [30, 'treinta'],
    [45, 'cuarenta y cinco'], [100, 'cien'], [134, 'ciento treinta y cuatro'],
  ])('%i -> %s', (n, words) => {
    expect(numberToSpanish(n)).toBe(words);
  });

  it('apocopa "uno" delante de sustantivo masculino', () => {
    expect(numberToSpanish(21, { masculine: true })).toBe('veintiún');
    expect(numberToSpanish(31, { masculine: true })).toBe('treinta y un');
    expect(numberToSpanish(21)).toBe('veintiuno');
  });
});

describe('buildIntroText', () => {
  it('incluye ciudad, equipos y abridores, sin cifras', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const text = buildIntroText(baseFacts, { rng: seededRng(seed) });
      expect(text).toContain('Brisko');
      expect(text).toContain('Thalgrove Miners');
      expect(text).toContain('Hiroshi Takahashi');
      expect(text).toContain('Diego Molina');
      expect(text).not.toMatch(/\d/);
    }
  });

  it('es determinista con la misma semilla', () => {
    const facts = { ...baseFacts, isRivalry: true, hrLeader: { name: 'Kevin Barnes', count: 28 } };
    expect(buildIntroText(facts, { rng: seededRng(42) })).toBe(buildIntroText(facts, { rng: seededRng(42) }));
  });

  it('sin abridores usa el enfrentamiento corto', () => {
    const text = buildIntroText({ ...baseFacts, homePitcher: null, awayPitcher: null }, { rng: () => 0 });
    expect(text).toContain('Los Thalgrove Miners visitan a los Brisko Wolves.');
    expect(text).not.toContain('loma');
  });

  it('en la final usa apertura y gancho de final', () => {
    const text = buildIntroText({ ...baseFacts, playoffRound: 3, isRivalry: true }, { rng: () => 0 });
    expect(text).toMatch(/final/i);
    expect(text).toContain('Nueve entradas para la gloria.');
    expect(text).not.toContain('rivalidad');
  });

  it('menciona la racha con letras', () => {
    const facts = { ...baseFacts, streaks: [{ teamName: 'Brisko Wolves', type: 'W', length: 5 }] };
    const text = buildIntroText(facts, { rng: () => 0, streakMin: 3 });
    expect(text).toContain('Los Brisko Wolves llegan con cinco victorias al hilo.');
  });
});

describe('availableHooks', () => {
  it('ignora rachas cortas y jonroneros por debajo del minimo', () => {
    const hooks = availableHooks({
      ...baseFacts,
      streaks: [{ teamName: 'X', type: 'L', length: 2 }],
      hrLeader: { name: 'Kevin Barnes', count: 4 },
    }, { streakMin: 3, hrMin: 10 });
    expect(hooks).toEqual([]);
  });

  it('elige la racha mas larga y escribe los jonrones con apocope', () => {
    const hooks = availableHooks({
      ...baseFacts,
      streaks: [
        { teamName: 'A', type: 'W', length: 3 },
        { teamName: 'B', type: 'L', length: 6 },
      ],
      hrLeader: { name: 'Kevin Barnes', count: 21 },
      heir: { name: 'Leo Castillo', parentName: 'Ramon Castillo' },
    }, { streakMin: 3, hrMin: 10 });
    expect(hooks.map((h) => h.key)).toEqual(['lossStreak', 'heir', 'homers']);
    expect(hooks[0].vars).toEqual({ team: 'B', n: 'seis' });
    expect(hooks[2].vars.n).toBe('veintiún');
  });
});
