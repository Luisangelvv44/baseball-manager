const prisma = require('../db/prisma');
const { generatePlayer, POSITIONS, randomInt } = require('../seeders/generators/playerGenerator');
const { releasePlayerWithPenalty, findWeakestRosterPlayer } = require('./auctionService');

async function giveCpuTeamsRevenue() {
    const cpuTeamsRevenue = await prisma.team.findMany({
        where: { is_user_team: false },
        select: { id: true, fan_base: true },
    });

    for (const ct of cpuTeamsRevenue) {
        const revenuePerFan = Math.floor(Math.random() * 51) + 50; // $50–$100 entero por fan
        const revenue = ct.fan_base * revenuePerFan;
        if (revenue > 0) {
            await prisma.team.update({
                where: { id: ct.id },
                data: { budget: { increment: revenue } },
            });
        }
    }
}

async function getMissingPositions(teamId) {
  const grouped = await prisma.player.groupBy({
    by: ['position'],
    where: { team_id: teamId, status: 'active', level: 'MAJOR' },
    _count: { id: true },
  });
  const present = new Set(grouped.map((g) => g.position));
  return POSITIONS.filter((p) => !present.has(p));
}

// Corrige una posicion vacia liberando (con multa) al jugador mas debil de otra posicion
// con excedente, y creando de inmediato un reemplazo asignado directo a la posicion faltante
// (como si viniera recien graduado de las menores: 22-26 anios, 30-70 de skill actual).
// Devuelve false (no-op silencioso) si no hay excedente cortable o el budget no alcanza.
async function tryFillPosition(teamId, missingPosition) {
  const grouped = await prisma.player.groupBy({
    by: ['position'],
    where: { team_id: teamId, status: 'active', level: 'MAJOR' },
    _count: { id: true },
  });
  const surplus = grouped
    .filter((g) => g.position !== missingPosition && g._count.id > 1)
    .sort((a, b) => b._count.id - a._count.id);
  if (surplus.length === 0) return false;

  const weakest = await findWeakestRosterPlayer(prisma, teamId, surplus[0].position);
  if (!weakest) return false;

  const released = await releasePlayerWithPenalty(prisma, teamId, weakest);
  if (!released) return false;

  const age = randomInt(22, 26);
  const currentSkill = randomInt(30, 70);
  const potential = randomInt(currentSkill, Math.min(99, currentSkill + 30));
  const replacement = generatePlayer({
    position: missingPosition,
    age,
    current_skill: currentSkill,
    potential_coefficient: potential,
    contract_years_remaining: randomInt(1, 3),
    rookie_contract: false,
    team_id: teamId,
    status: 'active',
  });

  await prisma.player.create({ data: { ...replacement, level: 'MAJOR' } });
  return true;
}

// Revision de integridad de roster para equipos CPU (nunca el equipo del usuario): por cada
// posicion sin ningun jugador activo de nivel MAJOR, se libera al jugador mas debil de una
// posicion con excedente y se genera un reemplazo. Pensada para correr en ROSTER_CHECK_DAY.
async function fillMissingPositions() {
  const cpuTeams = await prisma.team.findMany({ where: { is_user_team: false }, select: { id: true } });

  for (const team of cpuTeams) {
    const missing = await getMissingPositions(team.id);
    for (const pos of missing) {
      await tryFillPosition(team.id, pos);
    }
  }
}

module.exports = { giveCpuTeamsRevenue, fillMissingPositions };
