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
  // Bueno (80-89)
  { skill: 85, position: 'P' },
  { skill: 82, position: 'C' },
  { skill: 88, position: '1B' },
  { skill: 81, position: 'SS' },
  { skill: 84, position: 'LF' },
  { skill: 87, position: 'RF' },
  // Estrella (90-99)
  { skill: 95, position: 'P' },
  { skill: 93, position: 'P' },
  { skill: 92, position: '2B' },
  { skill: 98, position: '3B' },
  { skill: 94, position: 'CF' },
  { skill: 91, position: 'DH' },
  { skill: 96, position: 'C' },
  // Super Estrella (100-109)
  { skill: 105, position: 'P' },
  { skill: 108, position: 'P' },
  { skill: 102, position: 'SS' },
  { skill: 107, position: 'CF' },
  { skill: 101, position: '1B' },
  { skill: 104, position: 'C' },
  { skill: 103, position: 'RF' },
  // Leyenda (110-120)
  { skill: 115, position: 'P' },
  { skill: 118, position: 'SS' },
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
