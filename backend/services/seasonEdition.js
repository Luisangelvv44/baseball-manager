const prisma = require('../db/prisma');

// Número de edición = posición de la temporada en orden cronológico (por id), empezando en 1.
// No se usa el id porque el autoincrement no se reinicia entre partidas.

async function getSeasonEditionMap() {
  const seasons = await prisma.season.findMany({ orderBy: { id: 'asc' }, select: { id: true } });
  return new Map((seasons || []).map((s, i) => [s.id, i + 1]));
}

async function getSeasonEdition(seasonId) {
  return prisma.season.count({ where: { id: { lte: seasonId } } });
}

module.exports = { getSeasonEditionMap, getSeasonEdition };
