const { TEAM_NICKNAMES, FICTIONAL_CITIES } = require('../data/names');

// Genera "count" nombres unicos del tipo "Ciudad Apodo" (ej: "Brisko Hawks")
function generateTeamNames(count) {
  const cities = [...FICTIONAL_CITIES].sort(() => Math.random() - 0.5);
  const nicknames = [...TEAM_NICKNAMES].sort(() => Math.random() - 0.5);

  const names = [];
  for (let i = 0; i < count; i++) {
    const city = cities[i % cities.length];
    const nick = nicknames[i % nicknames.length];
    names.push(`${city} ${nick}`);
  }
  return names;
}

module.exports = { generateTeamNames };
