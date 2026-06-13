const prisma = require('../db/prisma');
const { FIELD_POSITIONS } = require('../seeders/generators/playerGenerator');

async function getSavedLineup(teamId) {
  const rows = await prisma.teamLineup.findMany({
    where: { team_id: teamId },
    include: { player: { select: { id: true, current_skill: true, position: true, team_id: true } } },
  });

  if (rows.length === 0) return null;

  const pitcherRow = rows.find((r) => r.is_pitcher);
  const batterRows = rows
    .filter((r) => !r.is_pitcher)
    .sort((a, b) => a.batting_order - b.batting_order);

  if (!pitcherRow || batterRows.length < 9) return null;

  // Validate all saved players still belong to this team
  const allValid =
    pitcherRow.player.team_id === teamId &&
    batterRows.every((r) => r.player.team_id === teamId);

  if (!allValid) return null;

  return {
    teamId,
    pitcher: { id: pitcherRow.player.id, current_skill: pitcherRow.player.current_skill },
    players: batterRows.slice(0, 9).map((r) => ({
      id: r.player.id,
      current_skill: r.player.current_skill,
      position: r.player.position,
    })),
  };
}

async function autoGenerateLineup(teamId) {
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

  for (const pos of FIELD_POSITIONS) {
    const candidate = nonPitchers.find((p) => p.position === pos && !used.has(p.id));
    if (candidate) {
      battingOrder.push({ ...candidate, assigned_position: pos });
      used.add(candidate.id);
    }
  }

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

async function getLineup(teamId) {
  const saved = await getSavedLineup(teamId);
  if (saved) return saved;
  return autoGenerateLineup(teamId);
}

module.exports = { getLineup };
