// Inserta la pausa del Juego de Estrellas en la temporada activa creada antes de esa funcion:
// mueve ALL_STAR_BREAK_DAYS dias hacia adelante los partidos de la segunda vuelta y alarga la
// temporada, dejando libres el dia del Home Run Derby y el del Juego de Estrellas.
//   node scripts/addAllStarBreak.js          -> solo muestra lo que haria (no escribe)
//   node scripts/addAllStarBreak.js --apply  -> aplica el cambio
const prisma = require('../db/prisma');
const { PRE_SEASON_DAYS, GAMES_PER_SEASON, ALL_STAR_BREAK_AFTER_GAME_DAY, ALL_STAR_BREAK_DAYS } = require('../config');
const { getAllStarBreak } = require('../services/allStarService');

const PLAYOFF_DAY_MIN = 1000; // los dias de playoffs se numeran desde 1000

async function main() {
  const apply = process.argv.includes('--apply');
  const season = await prisma.season.findFirst({ where: { status: 'active' }, orderBy: { id: 'desc' } });
  if (!season) throw new Error('No hay una temporada activa');
  if (getAllStarBreak(season)) {
    console.log(`La temporada ${season.id} ya tiene la pausa del Juego de Estrellas. Nada que hacer.`);
    return;
  }
  if (season.total_days !== PRE_SEASON_DAYS + GAMES_PER_SEASON) {
    throw new Error(`total_days inesperado (${season.total_days}); se esperaba ${PRE_SEASON_DAYS + GAMES_PER_SEASON}`);
  }

  const lastFirstLegDay = PRE_SEASON_DAYS + ALL_STAR_BREAK_AFTER_GAME_DAY;
  if (season.current_day > lastFirstLegDay) {
    throw new Error(`La temporada ya va en el dia ${season.current_day}: la pausa (despues del dia ${lastFirstLegDay}) ya paso`);
  }

  const secondLeg = { season_id: season.id, day_number: { gt: lastFirstLegDay, lt: PLAYOFF_DAY_MIN } };
  const played = await prisma.gameSchedule.count({ where: { ...secondLeg, status: { not: 'scheduled' } } });
  if (played > 0) throw new Error(`Hay ${played} partidos de la segunda vuelta ya jugados`);
  const toMove = await prisma.gameSchedule.count({ where: secondLeg });

  const newTotal = season.total_days + ALL_STAR_BREAK_DAYS;
  const brk = getAllStarBreak({ ...season, total_days: newTotal });
  console.log(`Temporada ${season.id} (dia actual ${season.current_day}):`);
  console.log(`  - ${toMove} partidos de los dias ${lastFirstLegDay + 1}-${season.total_days} se mueven +${ALL_STAR_BREAK_DAYS} dias`);
  console.log(`  - total_days ${season.total_days} -> ${newTotal}`);
  console.log(`  - Home Run Derby: dia ${brk.derbyDay} · Juego de Estrellas: dia ${brk.allStarDay}`);

  if (!apply) {
    console.log('\nModo simulacion: no se escribio nada. Ejecuta con --apply para aplicarlo.');
    return;
  }

  await prisma.$transaction([
    prisma.gameSchedule.updateMany({ where: secondLeg, data: { day_number: { increment: ALL_STAR_BREAK_DAYS } } }),
    prisma.season.update({ where: { id: season.id }, data: { total_days: newTotal } }),
  ]);
  console.log('\nListo: pausa del Juego de Estrellas agregada.');
}

main()
  .catch((err) => {
    console.error(`Error: ${err.message}`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
