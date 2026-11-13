// IA de texto via OpenRouter. Solo redacta: las mecanicas las decide siempre el codigo.
// generateText() prueba el modelo principal (de pago) y luego el de respaldo (gratis);
// si ambos fallan devuelve null y el llamador usa sus plantillas.
require('dotenv').config();
const {
  AI_PRIMARY_MODEL,
  AI_FALLBACK_MODEL,
  AI_SEASON_BUDGET_USD,
  AI_TIMEOUT_MS,
  AI_DEFAULT_MAX_TOKENS,
  AI_DEFAULT_TEMPERATURE,
  AI_MODEL_PRICING,
} = require('../config');

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

// Gasto acumulado por temporada (en memoria; se persistira al integrar las funciones).
const spentBySeason = new Map();

function getApiKey() {
  return process.env.OPENROUTER_API_KEY || null;
}

// En Jest la IA queda apagada (la clave real de .env se carga igual) salvo que el test la active.
function isEnabled() {
  if (process.env.NODE_ENV === 'test' && process.env.AI_ENABLE_IN_TESTS !== '1') return false;
  return Boolean(getApiKey());
}

function modelChain() {
  return [
    process.env.AI_PRIMARY_MODEL || AI_PRIMARY_MODEL,
    process.env.AI_FALLBACK_MODEL || AI_FALLBACK_MODEL,
  ].filter((m, i, arr) => m && arr.indexOf(m) === i);
}

function isFreeModel(model) {
  if (model.endsWith(':free')) return true;
  const p = AI_MODEL_PRICING[model];
  return Boolean(p && p.input === 0 && p.output === 0);
}

function estimateCost(model, usage) {
  if (!usage) return 0;
  if (typeof usage.cost === 'number') return usage.cost;
  const p = AI_MODEL_PRICING[model];
  if (!p) return 0;
  return (usage.prompt_tokens || 0) * p.input + (usage.completion_tokens || 0) * p.output;
}

function getSpent(seasonId) {
  return spentBySeason.get(seasonId) || 0;
}

function recordSpend(seasonId, usd) {
  if (seasonId == null || !usd) return;
  spentBySeason.set(seasonId, getSpent(seasonId) + usd);
}

function resetSpend() {
  spentBySeason.clear();
}

// Quita bloques ```json ... ``` que algunos modelos anaden aunque se pida JSON puro.
function parseJson(text) {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  return JSON.parse(cleaned);
}

// Una llamada a un modelo concreto. Lanza error si falla; devuelve texto + metricas.
async function callModel(model, { system, prompt, maxTokens, temperature, json, timeoutMs } = {}) {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error('OPENROUTER_API_KEY no configurada');

  const messages = [];
  if (system) messages.push({ role: 'system', content: system });
  messages.push({ role: 'user', content: prompt });

  const body = {
    model,
    messages,
    max_tokens: maxTokens ?? AI_DEFAULT_MAX_TOKENS,
    temperature: temperature ?? AI_DEFAULT_TEMPERATURE,
    // Sin razonamiento: son textos cortos y los tokens de pensamiento se cobran como salida.
    reasoning: { enabled: false },
  };
  if (json) body.response_format = { type: 'json_object' };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs ?? AI_TIMEOUT_MS);
  const started = Date.now();
  let res;
  try {
    res = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  const data = await res.json().catch(() => null);
  if (!res.ok || !data || data.error) {
    const msg = data?.error?.message || `HTTP ${res.status}`;
    throw new Error(`${model}: ${msg}`);
  }

  const text = data.choices?.[0]?.message?.content;
  if (!text || !text.trim()) throw new Error(`${model}: respuesta vacia`);

  const result = {
    model: data.model || model,
    text: text.trim(),
    usage: data.usage || null,
    cost: estimateCost(model, data.usage),
    latencyMs: Date.now() - started,
  };
  if (json) {
    try {
      result.json = parseJson(result.text);
    } catch {
      throw new Error(`${model}: JSON invalido`);
    }
  }
  return result;
}

// Punto de entrada para el juego. Nunca lanza: devuelve null si no hay IA disponible.
// opts: { system, prompt, maxTokens, temperature, json, seasonId, timeoutMs }
async function generateText(opts) {
  if (!isEnabled() || !opts?.prompt) return null;
  const overBudget = getSpent(opts.seasonId) >= AI_SEASON_BUDGET_USD;

  for (const model of modelChain()) {
    if (overBudget && !isFreeModel(model)) continue;
    try {
      const result = await callModel(model, opts);
      recordSpend(opts.seasonId, result.cost);
      return result;
    } catch (err) {
      console.warn(`[aiService] ${err.message}`);
    }
  }
  return null;
}

module.exports = {
  generateText,
  callModel,
  isEnabled,
  modelChain,
  getSpent,
  resetSpend,
  parseJson,
};
