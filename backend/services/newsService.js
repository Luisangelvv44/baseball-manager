const prisma = require('../db/prisma');

async function createNews(type, headline, season_day, seasonId, opts = {}) {
  const { teamId = null, alert = false } = opts;
  return prisma.newsItem.create({
    data: {
      type,
      headline,
      season_day: season_day ?? 0,
      season_id: seasonId ?? null,
      team_id: teamId ?? null,
      alert: !!alert,
    },
  });
}

module.exports = { createNews };
