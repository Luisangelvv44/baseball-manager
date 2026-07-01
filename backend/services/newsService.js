const prisma = require('../db/prisma');

async function createNews(type, headline, season_day, seasonId) {
  return prisma.newsItem.create({ data: { type, headline, season_day: season_day ?? 0, season_id: seasonId ?? null } });
}

module.exports = { createNews };
