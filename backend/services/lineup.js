const prisma = require('../db/prisma');
const { FIELD_POSITIONS } = require('../seeders/generators/playerGenerator');

// Arma un lineup simple: 1 pitcher (mejor current_skill) + 9 bateadores
// (intenta cubrir cada posicion de campo, rellena con lo que haya).
// Devuelve null si el equipo no tiene suficientes jugadores.
async function getLineup(teamId) {
  const players = await prisma.player.findMany({
    where: { team_id: teamId },
    select: { id: true, first_name: true, last_name: true, position: true, current_skill: true },
  });

  const pitchers = players
    .filter((p) => p.position === 'P')
    .sort((a, b) => b.current_skill - a.current_skill);

  if (pitchers.length === 0) return null;
  const pitcher = pitchers[0];

  const nonPitchers = players.filter((p) => p.position !== 'P');
  if (nonPitchers.length < 9) return null;

  const used = new Set();
  const battingOrder = [];

  // 1. intenta cubrir cada posicion de campo con un jugador de esa posicion
  for (const pos of FIELD_POSITIONS) {
    const candidate = nonPitchers.find((p) => p.position === pos && !used.has(p.id));
    if (candidate) {
      battingOrder.push({ ...candidate, assigned_position: pos });
      used.add(candidate.id);
    }
  }

  // 2. rellena huecos con cualquier jugador no usado, hasta 9
  for (const p of nonPitchers) {
    if (battingOrder.length >= 9) break;
    if (!used.has(p.id)) {
      battingOrder.push({ ...p, assigned_position: p.position });
      used.add(p.id);
    }
  }

  if (battingOrder.length < 9) return null;

  return {
    teamId,
    pitcher: { id: pitcher.id, current_skill: pitcher.current_skill },
    players: battingOrder.slice(0, 9).map((p) => ({
      id: p.id,
      current_skill: p.current_skill,
      position: p.assigned_position,
    })),
  };
}

module.exports = { getLineup };
