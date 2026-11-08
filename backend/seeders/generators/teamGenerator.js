const { TEAM_NAMES } = require('../data/names');

// Devuelve los 24 nombres de equipo fijos (cada uno con logo correspondiente),
// en orden aleatorio para decidir que equipo recibe cada nombre.
function generateTeamNames() {
  return [...TEAM_NAMES].sort(() => Math.random() - 0.5);
}

module.exports = { generateTeamNames };
