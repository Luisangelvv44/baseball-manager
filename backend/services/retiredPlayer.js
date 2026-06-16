const prisma = require("../db/prisma");

async function retireOldPlayers() {
  try {
    const retiring = await prisma.player.findMany({
      where: { status: { in: ["free_agent", "active"] }, age: { gte: 40 } },
      select: { id: true },
    });
    const ids = retiring.map((p) => p.id);
    if (ids.length > 0) {
      await prisma.teamLineup.deleteMany({ where: { player_id: { in: ids } } });
      await prisma.player.updateMany({
        where: { id: { in: ids } },
        data: { status: "retired", team_id: null },
      });
    }
    console.log("Jugadores retirados actualizados correctamente");
  } catch (err) {
    console.error("Error al actualizar jugadores retirados:", err);
  }
}

module.exports = { retireOldPlayers };
