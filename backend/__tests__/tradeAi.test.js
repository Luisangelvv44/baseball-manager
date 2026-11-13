jest.mock('../services/aiService', () => ({
  generateText: jest.fn(),
  isEnabled: jest.fn().mockReturnValue(false),
  hasAlteredName: jest.requireActual('../services/aiService').hasAlteredName,
}));

const { generateText } = require('../services/aiService');
const { explainTradeDecision } = require('../services/tradeService');
const { rejectionMessage, offerPitchMessage, formatMoney } = require('../services/tradeMessages');
const {
  gmStyle, numberTokens, validMessage, composeDecisionMessage, composeOfferMessage,
} = require('../services/tradeAi');

const base = { potential_coefficient: 30, growth_age: 28, contract_years_remaining: 1, rookie_contract: false, level: 'MAJOR' };
const vet = { ...base, id: 11, first_name: 'Ramón', last_name: 'Castillo', position: 'C', age: 37, current_skill: 40, salary: 3_000_000 };
const star = { ...base, id: 22, first_name: 'Marco', last_name: 'Díaz', position: 'SS', age: 27, current_skill: 88, salary: 900_000 };
const cpuTeam = { id: 2, name: 'Toros de Sur', bid_aggressiveness: 0.2 };
const trade = {
  proposer_team_id: 1, recipient_team_id: 2, cash_offered: 0, cash_requested: 0,
  items: [{ from_team_id: 1, player: vet }, { from_team_id: 2, player: star }],
};
const roster = [
  { id: 22, position: 'SS', current_skill: 88, salary: 900_000 },
  { id: 23, position: 'SS', current_skill: 60, salary: 500_000 },
  { id: 24, position: 'CF', current_skill: 40, salary: 400_000 },
];

beforeEach(() => jest.clearAllMocks());

describe('explainTradeDecision', () => {
  it('rechazo con motivos, posicion floja y efectivo necesario', () => {
    const ex = explainTradeDecision(cpuTeam, trade, roster);
    expect(ex.accepted).toBe(false);
    expect(ex.concerns.map((c) => c.type)).toEqual(['veterano', 'titular']);
    expect(ex.needPosition).toBe('CF');
    expect(ex.cashNeeded % 50_000).toBe(0);
    expect(ex.cashNeeded).toBeGreaterThan(0);
  });

  it('no dice "cerca" cuando el valor total es negativo y falta mucho', () => {
    const pricey = { ...vet, age: 35, current_skill: 90, salary: 30_000_000, contract_years_remaining: 3 };
    const cheap = { ...star, current_skill: 40, salary: 300_000 };
    const ex = explainTradeDecision(cpuTeam, { ...trade, items: [{ from_team_id: 1, player: pricey }, { from_team_id: 2, player: cheap }] }, roster);
    expect(ex.accepted).toBe(false);
    expect(ex.closeness).toBe('muy_lejos');
  });

  it('el efectivo sugerido basta para que la CPU acepte', () => {
    const ex = explainTradeDecision(cpuTeam, trade, roster);
    const withCash = explainTradeDecision(cpuTeam, { ...trade, cash_offered: ex.cashNeeded }, roster);
    expect(withCash.accepted).toBe(true);
    expect(withCash.cashNeeded).toBe(0);
  });

  it('marca como caro a quien cobra mas del doble por punto que la mediana', () => {
    const pricey = { ...vet, age: 30, current_skill: 50, salary: 2_000_000 };
    const ex = explainTradeDecision(cpuTeam, { ...trade, items: [{ from_team_id: 1, player: pricey }, { from_team_id: 2, player: star }] }, roster);
    expect(ex.concerns[0]).toMatchObject({ type: 'caro' });
  });
});

describe('plantillas', () => {
  it('formatMoney', () => {
    expect(formatMoney(1_250_000)).toBe('$1.3M');
    expect(formatMoney(350_000)).toBe('$350K');
  });

  it('rejectionMessage incluye motivo y pistas', () => {
    const msg = rejectionMessage(explainTradeDecision(cpuTeam, trade, roster));
    expect(msg).toMatch(/Ramón Castillo tiene 37 años/);
    expect(msg).toMatch(/jardinero central/);
  });

  it('offerPitchMessage', () => {
    expect(offerPitchMessage({ needPosition: 'SS', targetPlayer: star, surplusPlayer: vet, cashOffered: 100_000 }))
      .toMatch(/campocorto.*Marco Díaz.*Ramón Castillo y \$100K/);
  });
});

describe('validacion', () => {
  const opts = { names: ['Toros de Sur', 'Marco Díaz'], facts: ['Marco Díaz, 27 años, salario $1.3M'] };

  it('gmStyle por agresividad', () => {
    expect(gmStyle(0.22)).toMatch(/agresivo/);
    expect(gmStyle(0.06)).toMatch(/conservador/);
    expect(gmStyle(0.12)).toMatch(/cordial/);
  });

  it('numberTokens', () => expect(numberTokens('27 años y $1,3M')).toEqual(['27', '1.3']));

  it('acepta cifras de los datos y rechaza inventadas o nombres alterados', () => {
    expect(validMessage('Marco Díaz tiene 27 años y cobra $1.3M, no lo soltamos.', opts)).toBe(true);
    expect(validMessage('Marco Díaz tiene 28 años, no lo soltamos por nada.', opts)).toBe(false);
    expect(validMessage('Los Toros del Sur no venden a su campocorto, lo sentimos.', opts)).toBe(false);
    expect(validMessage('corto', opts)).toBe(false);
  });
});

describe('composeDecisionMessage / composeOfferMessage', () => {
  const explanation = explainTradeDecision(cpuTeam, trade, roster);

  it('usa la IA si es valida y pasa las pistas en los datos', async () => {
    generateText.mockResolvedValue({ text: '"No nos interesa Ramón Castillo con 37 años. Trae un jardinero central y hablamos."' });
    const r = await composeDecisionMessage({ cpuTeam, userTeamName: 'Halcones de Norte', trade, explanation, seasonId: 7 });
    expect(r).toEqual({ source: 'ai', message: 'No nos interesa Ramón Castillo con 37 años. Trae un jardinero central y hablamos.' });
    const call = generateText.mock.calls[0][0];
    expect(call.prompt).toMatch(/Pista: .*jardinero central/);
    expect(call.prompt).toMatch(/agresivo/);
    expect(call.seasonId).toBe(7);
  });

  it('cae a la plantilla si la IA inventa una cifra, no responde o lanza', async () => {
    generateText.mockResolvedValueOnce({ text: 'Necesitamos 5 millones extra para cerrar esto con ustedes.' });
    expect((await composeDecisionMessage({ cpuTeam, userTeamName: 'H', trade, explanation })).source).toBe('template');
    generateText.mockResolvedValueOnce(null);
    expect((await composeDecisionMessage({ cpuTeam, userTeamName: 'H', trade, explanation })).source).toBe('template');
    generateText.mockRejectedValueOnce(new Error('x'));
    const r = await composeOfferMessage({ cpuTeam, userTeamName: 'H', needPosition: 'SS', targetPlayer: star, surplusPlayer: vet, cashOffered: 0 });
    expect(r.source).toBe('template');
    expect(r.message).toMatch(/campocorto/);
  });
});
