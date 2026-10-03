const prisma = require('../db/prisma');

// Rango de fan_base de la temporada en curso (min/max), usado para que el pago CPU de fin de
// temporada refleje como fluctuo la fanaticada y no solo el valor al cierre.
// Un min/max en null (equipos nuevos) se interpreta como "igual al fan_base actual".

const FAN_RANGE_SELECT = { id: true, fan_base: true, min_fan_base_season: true, max_fan_base_season: true };

// Recibe el registro devuelto por un prisma.team.update (con FAN_RANGE_SELECT) y amplia el
// rango si el nuevo fan_base queda fuera.
async function trackFanBase(team) {
  if (!team || team.id == null || team.fan_base == null) return;
  const min = Math.min(team.min_fan_base_season ?? team.fan_base, team.fan_base);
  const max = Math.max(team.max_fan_base_season ?? team.fan_base, team.fan_base);
  if (min === team.min_fan_base_season && max === team.max_fan_base_season) return;
  await prisma.team.update({
    where: { id: team.id },
    data: { min_fan_base_season: min, max_fan_base_season: max },
  });
}

function seasonAverageFanBase(team) {
  const min = team.min_fan_base_season ?? team.fan_base;
  const max = team.max_fan_base_season ?? team.fan_base;
  return Math.round((min + max) / 2);
}

// Al cerrar la temporada, el rango de la siguiente arranca en el fan_base actual.
async function resetFanBaseRange() {
  const teams = await prisma.team.findMany({ select: { id: true, fan_base: true } });
  for (const t of teams) {
    await prisma.team.update({
      where: { id: t.id },
      data: { min_fan_base_season: t.fan_base, max_fan_base_season: t.fan_base },
    });
  }
}

module.exports = { FAN_RANGE_SELECT, trackFanBase, seasonAverageFanBase, resetFanBaseRange };
