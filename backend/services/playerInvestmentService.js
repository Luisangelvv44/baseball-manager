const prisma = require('../db/prisma');

const MAX_SKILL = 150;

// Costo de subir 1 punto de skill, segun el nivel actual del jugador antes de la mejora.
// Escala siguiendo la misma curva de crecimiento x^(3/2) usada en skillCurve.js: mejorar
// jugadores de elite es mucho mas caro por punto.
function costForNextPoint(currentSkill) {
  if (currentSkill <= 59) return 1_000_000;
  if (currentSkill <= 79) return 2_000_000;
  if (currentSkill <= 94) return 4_000_000;
  if (currentSkill <= 99) return 8_000_000;
  if (currentSkill <= 119) return 16_000_000;
  return 32_000_000;
}

// Invierte el presupuesto destinado (team.budget * player_investment_rate) de cada equipo
// CPU en subir de a 1 punto el current_skill de sus jugadores MAJOR activos, empezando
// siempre por el mas debil, hasta agotar el presupuesto destinado o llegar al tope de skill.
// El equipo del usuario mejora jugadores via coaches (coachService.js), no aqui.
async function investInPlayers(season) {
  const cpuTeams = await prisma.team.findMany({
    where: { is_user_team: false },
    select: { id: true, budget: true, player_investment_rate: true, desperation_index: true },
  });

  for (const team of cpuTeams) {
    const roster = await prisma.player.findMany({
      where: { team_id: team.id, status: 'active', level: 'MAJOR' },
      select: { id: true, current_skill: true },
    });

    const candidates = roster.filter((p) => p.current_skill < MAX_SKILL);
    let remaining = Number(team.budget) * team.player_investment_rate * (1 + team.desperation_index);
    let spent = 0;
    let pointsBought = 0;
    const changed = new Map();

    while (candidates.length > 0) {
      let weakestIdx = 0;
      for (let i = 1; i < candidates.length; i++) {
        if (candidates[i].current_skill < candidates[weakestIdx].current_skill) weakestIdx = i;
      }
      const player = candidates[weakestIdx];
      const cost = costForNextPoint(player.current_skill);
      if (remaining < cost) break;

      player.current_skill += 1;
      remaining -= cost;
      spent += cost;
      pointsBought += 1;
      changed.set(player.id, player.current_skill);

      if (player.current_skill >= MAX_SKILL) {
        candidates.splice(weakestIdx, 1);
      }
    }

    if (spent === 0) continue;

    await Promise.all(
      [...changed.entries()].map(([id, current_skill]) =>
        prisma.player.update({ where: { id }, data: { current_skill } })
      )
    );

    await prisma.team.update({
      where: { id: team.id },
      data: { budget: { decrement: spent } },
    });

    await prisma.finance.create({
      data: {
        team_id: team.id,
        season_day: season.current_day,
        type: 'player_upgrade',
        amount: -spent,
        description: `Inversion en mejora de jugadores (${changed.size} jugadores, ${pointsBought} puntos)`,
      },
    });
  }
}

module.exports = { investInPlayers };
