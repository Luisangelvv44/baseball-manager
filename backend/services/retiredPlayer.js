const prisma = require("../db/prisma");

async function retireOldPlayers() {
  try {
    await prisma.player.updateMany({
        where: { status: { in: ["free_agent", "active"] }, age: { gte: 40 } },
        data: { status: "retired", team_id: null },
    });

    console.log("Jugadores retirados actualizados correctamente");

  } catch (err) {
    console.error("Error al actualizar jugadores retirados:", err);
  }
}

module.exports = { retireOldPlayers };
