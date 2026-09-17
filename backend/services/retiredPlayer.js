const prisma = require("../db/prisma");

async function retireOldPlayers() {
  try {
    const retiring = await prisma.player.findMany({
      where: { status: { in: ["free_agent", "active"] }, age: { gte: 40 } },
      select: { id: true, team_id: true },
    });
    const ids = retiring.map((p) => p.id);
    if (ids.length > 0) {
      await prisma.teamLineup.deleteMany({ where: { player_id: { in: ids } } });
      // Los que se retiran directo desde "active" todavia tienen team_id: se guarda como
      // last_team_id antes de limpiarlo. Los que ya eran free_agent ya trajeron su
      // last_team_id (guardado al momento en que dejaron su ultimo equipo), no se toca.
      for (const p of retiring) {
        await prisma.player.update({
          where: { id: p.id },
          data: {
            status: "retired",
            team_id: null,
            ...(p.team_id != null ? { last_team_id: p.team_id } : {}),
          },
        });
      }
    }
    console.log("Jugadores retirados actualizados correctamente");
  } catch (err) {
    console.error("Error al actualizar jugadores retirados:", err);
  }
}

module.exports = { retireOldPlayers };
