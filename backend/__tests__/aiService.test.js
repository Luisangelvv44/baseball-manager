const ai = require('../services/aiService');
const { AI_PRIMARY_MODEL, AI_FALLBACK_MODEL, AI_SEASON_BUDGET_USD } = require('../config');

function okResponse(content, usage = { prompt_tokens: 100, completion_tokens: 50, cost: 0.00003 }) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ model: 'x', choices: [{ message: { content } }], usage }),
  };
}

function errResponse(status = 500, message = 'boom') {
  return { ok: false, status, json: async () => ({ error: { message } }) };
}

describe('aiService', () => {
  const origFetch = global.fetch;
  const origKey = process.env.OPENROUTER_API_KEY;

  beforeEach(() => {
    process.env.OPENROUTER_API_KEY = 'test-key';
    process.env.AI_ENABLE_IN_TESTS = '1';
    delete process.env.AI_PRIMARY_MODEL;
    delete process.env.AI_FALLBACK_MODEL;
    global.fetch = jest.fn();
    ai.resetSpend();
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    global.fetch = origFetch;
    delete process.env.AI_ENABLE_IN_TESTS;
    if (origKey === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = origKey;
    jest.restoreAllMocks();
  });

  test('sin clave devuelve null sin llamar a la API', async () => {
    delete process.env.OPENROUTER_API_KEY;
    expect(await ai.generateText({ prompt: 'hola' })).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('en Jest queda apagada salvo que el test la active', async () => {
    delete process.env.AI_ENABLE_IN_TESTS;
    expect(ai.isEnabled()).toBe(false);
    expect(await ai.generateText({ prompt: 'hola' })).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('usa el modelo principal con razonamiento desactivado', async () => {
    global.fetch.mockResolvedValue(okResponse('Texto'));
    const r = await ai.generateText({ prompt: 'hola', system: 'sys', seasonId: 1 });
    expect(r.text).toBe('Texto');
    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body.model).toBe(AI_PRIMARY_MODEL);
    expect(body.reasoning).toEqual({ enabled: false });
    expect(body.messages[0]).toEqual({ role: 'system', content: 'sys' });
    expect(ai.getSpent(1)).toBeCloseTo(0.00003);
  });

  test('si el principal falla pasa al respaldo', async () => {
    global.fetch.mockResolvedValueOnce(errResponse()).mockResolvedValueOnce(okResponse('Respaldo'));
    const r = await ai.generateText({ prompt: 'hola' });
    expect(r.text).toBe('Respaldo');
    expect(JSON.parse(global.fetch.mock.calls[1][1].body).model).toBe(AI_FALLBACK_MODEL);
  });

  test('si todos fallan devuelve null (el llamador usa plantillas)', async () => {
    global.fetch.mockRejectedValue(new Error('network'));
    expect(await ai.generateText({ prompt: 'hola' })).toBeNull();
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  test('al superar el presupuesto de la temporada solo usa el modelo gratis', async () => {
    global.fetch.mockResolvedValue(okResponse('a', { prompt_tokens: 1, completion_tokens: 1, cost: AI_SEASON_BUDGET_USD }));
    await ai.generateText({ prompt: 'uno', seasonId: 7 });
    await ai.generateText({ prompt: 'dos', seasonId: 7 });
    const models = global.fetch.mock.calls.map((c) => JSON.parse(c[1].body).model);
    expect(models).toEqual([AI_PRIMARY_MODEL, AI_FALLBACK_MODEL]);
  });

  test('modo JSON: parsea, acepta ```json``` y descarta JSON invalido', async () => {
    global.fetch.mockResolvedValueOnce(okResponse('```json\n{"a":1}\n```'));
    expect((await ai.generateText({ prompt: 'x', json: true })).json).toEqual({ a: 1 });

    global.fetch.mockResolvedValueOnce(okResponse('no es json')).mockResolvedValueOnce(okResponse('{"b":2}'));
    const r = await ai.generateText({ prompt: 'x', json: true });
    expect(r.json).toEqual({ b: 2 });
  });

  test('calcula el coste con la tabla de precios si no viene usage.cost', async () => {
    global.fetch.mockResolvedValue(okResponse('t', { prompt_tokens: 1_000_000, completion_tokens: 1_000_000 }));
    const r = await ai.generateText({ prompt: 'x' });
    expect(r.cost).toBeCloseTo(0.538);
  });
});
