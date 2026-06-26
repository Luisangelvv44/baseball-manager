const prisma = require('../db/prisma');

async function createNews(type, headline, season_day) {
  return prisma.newsItem.create({ data: { type, headline, season_day: season_day ?? 0 } });
}

module.exports = { createNews };
