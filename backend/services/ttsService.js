// Texto a voz via OpenRouter (/audio/speech, compatible con OpenAI). Por defecto Kokoro 82M.
// Nunca lanza: devuelve un Buffer mp3 o null (sin clave, en Jest, error o timeout) y el
// llamador sigue sin audio.
require('dotenv').config();
const { TTS_MODEL, TTS_VOICE, TTS_TIMEOUT_MS } = require('../config');
const { isEnabled } = require('./aiService');

const OPENROUTER_TTS_URL = 'https://openrouter.ai/api/v1/audio/speech';

async function synthesizeSpeech(text, { voice, model, timeoutMs } = {}) {
  if (!text || !text.trim() || !isEnabled()) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs ?? TTS_TIMEOUT_MS);
  try {
    const res = await fetch(OPENROUTER_TTS_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: model || process.env.TTS_MODEL || TTS_MODEL,
        input: text,
        voice: voice || process.env.TTS_VOICE || TTS_VOICE,
        response_format: 'mp3',
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      console.warn(`[ttsService] HTTP ${res.status} ${detail.slice(0, 200)}`);
      return null;
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    return buffer.length ? buffer : null;
  } catch (err) {
    console.warn(`[ttsService] ${err.name === 'AbortError' ? 'timeout' : err.message}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { synthesizeSpeech };
