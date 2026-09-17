const prisma = require('../db/prisma');

// Rangos validos de cada componente en PlayerSprite.jsx (frontend/src/components/PlayerSprite.jsx):
// HEAD_ORDER (5), EYE_ORDER (10), FACE_ORDER (5), SKIN_TONE_ORDER (8).
const HEAD_COUNT = 5;
const EYE_COUNT = 10;
const FACE_COUNT = 5;
const SKIN_TONE_COUNT = 8;

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomAppearanceData(playerId) {
  return {
    player_id: playerId,
    head_number: randomInt(1, HEAD_COUNT),
    eye_type: randomInt(1, EYE_COUNT),
    face_type: randomInt(1, FACE_COUNT),
    skin_tone: randomInt(1, SKIN_TONE_COUNT),
  };
}

// Crea la apariencia de un jugador recien creado (create de a uno). `client` puede ser
// el prisma singleton o un tx de transaccion.
async function assignAppearance(client, playerId) {
  return client.playerAppearance.create({ data: randomAppearanceData(playerId) });
}

// Rellena apariencia para cualquier Player que todavia no tenga una fila en
// PlayerAppearance: cubre createMany (que no devuelve ids) y sirve como backfill
// general. Idempotente y segura de llamar tantas veces como haga falta.
async function syncMissingAppearances(client = prisma) {
  const missing = await client.player.findMany({
    where: { appearance: null },
    select: { id: true },
  });
  if (missing.length === 0) return 0;

  await client.playerAppearance.createMany({
    data: missing.map((p) => randomAppearanceData(p.id)),
    skipDuplicates: true,
  });
  return missing.length;
}

module.exports = { assignAppearance, syncMissingAppearances, randomAppearanceData };
