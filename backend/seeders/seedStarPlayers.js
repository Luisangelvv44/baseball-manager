const prisma = require('../db/prisma');
const {
  generatePlayer,
  calculateSalary,
  calculateGrowthAge,
  randomInt,
  randomChoice,
} = require('./generators/playerGenerator');
const { createAuctionsForFreeAgents } = require('../services/auctionService');

const STAR_PLAYERS = [
  // Bueno (70-79)
  { skill: 75, position: 'P' },
  { skill: 72, position: 'C' },
  { skill: 78, position: '1B' },
  { skill: 71, position: 'SS' },
  { skill: 74, position: 'LF' },
  { skill: 77, position: 'RF' },
  // Estrella (80-89)
  { skill: 85, position: 'P' },
  { skill: 83, position: 'P' },
  { skill: 82, position: '2B' },
  { skill: 88, position: '3B' },
  { skill: 84, position: 'CF' },
  { skill: 81, position: 'DH' },
  { skill: 86, position: 'C' },
  // Super estrella (90-99)
  { skill: 95, position: 'P' },
  { skill: 98, position: 'P' },
  { skill: 92, position: 'SS' },
  { skill: 97, position: 'CF' },
  { skill: 91, position: '1B' },
  { skill: 94, position: 'C' },
  { skill: 93, position: 'RF' },
  // Leyenda (100)
  { skill: 100, position: 'P' },
  { skill: 100, position: 'SS' },
];

async function seedStarPlayers() {
  console.log(`Creando ${STAR_PLAYERS.length} jugadores sobresalientes...`);

  const players = STAR_PLAYERS.map(({ skill, position }) => {
    const potential = Math.min(99, skill + randomInt(0, 4));
    const age = randomInt(26, 32);
    const growthAge = calculateGrowthAge(potential);
    const salary = calculateSalary(potential, skill, age);

    return generatePlayer({
      current_skill: skill,
      potential_coefficient: potential,
      growth_age: growthAge,
      age,
      salary,
      position,
      status: 'free_agent',
      team_id: null,
      contract_years_remaining: 1,
    });
  });

  await prisma.player.createMany({ data: players });
  console.log(`${players.length} jugadores creados.`);

  const season = await prisma.season.findFirst({ where: { status: 'active' } });
  if (season) {
    const count = await createAuctionsForFreeAgents(null, season);
    console.log(`${count} subastas nuevas creadas para la temporada activa (día ${season.current_day}).`);
  } else {
    console.log('No hay temporada activa. Los jugadores entrarán a subastas al iniciar la siguiente temporada.');
  }
}

if (require.main === module) {
  seedStarPlayers()
    .then(() => prisma.$disconnect())
    .catch((err) => {
      console.error('Error:', err);
      prisma.$disconnect();
      process.exit(1);
    });
}

module.exports = { seedStarPlayers };
