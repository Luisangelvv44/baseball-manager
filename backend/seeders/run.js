const prisma = require('../db/prisma');
const { generateRoster, generatePlayer } = require('./generators/playerGenerator');
const { generateTeamNames } = require('./generators/teamGenerator');
const { generateStadiumSections } = require('./generators/stadiumGenerator');

const TEAMS_PER_DIVISION = 8;
const USER_TEAM_NAME = 'Tu Equipo';
const USER_STARTING_BUDGET = 10000000;

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomFloat(min, max) {
  return parseFloat((Math.random() * (max - min) + min).toFixed(3));
}

async function seed() {
  await prisma.$transaction(
    async (tx) => {
      // console.log('Limpiando tablas...');
      // await tx.$executeRaw`
      //   TRUNCATE game_events, game_lineups, schedule, scouts, finances,
      //   stadium_sections, players, seasons, teams, divisions
      //   RESTART IDENTITY CASCADE
      // `;

      // ---------- Divisiones ----------
      console.log('Creando divisiones...');
      const divNorth = await tx.division.create({ data: { name: 'Division Norte' } });
      const divSouth = await tx.division.create({ data: { name: 'Division Sur' } });

      // ---------- Equipos ----------
      console.log('Creando equipos...');
      const totalTeams = TEAMS_PER_DIVISION * 2;
      const cpuTeamNames = generateTeamNames(totalTeams - 1);

      const teamIds = [];
      let cpuIndex = 0;

      for (let i = 0; i < totalTeams; i++) {
        const isUser = i === 0;
        const divisionId = i < TEAMS_PER_DIVISION ? divNorth.id : divSouth.id;
        const name = isUser ? USER_TEAM_NAME : cpuTeamNames[cpuIndex++];
        const budget = isUser ? USER_STARTING_BUDGET : randomInt(2000000, 8000000);
        const reputation = isUser ? 50 : randomInt(40, 60);

        const bid_aggressiveness   = isUser ? 0.12 : randomFloat(0.05, 0.25);
        const min_growth_threshold = isUser ? 1.5  : randomFloat(0.5, 5.0);

        const team = await tx.team.create({
          data: { name, division_id: divisionId, is_user_team: isUser, budget, reputation, bid_aggressiveness, min_growth_threshold },
        });

        teamIds.push({ id: team.id, isUser });
      }

      const userTeamId = teamIds.find((t) => t.isUser).id;

      // ---------- Rosters CPU (tu equipo arranca vacio) ----------
      console.log('Generando rosters CPU...');
      for (const team of teamIds) {
        if (team.isUser) continue;
        const roster = generateRoster(team.id, 16);
        await tx.player.createMany({ data: roster });
      }

      // ---------- Estadio inicial de tu equipo ----------
      console.log('Generando estadio inicial...');
      const sections = generateStadiumSections(userTeamId);
      await tx.stadiumSection.createMany({ data: sections });

      // ---------- Agentes libres ----------
      console.log('Generando agentes libres...');
      const freeAgents = Array.from({ length: 100 }, () =>
        generatePlayer({ status: 'free_agent' })
      );
      await tx.player.createMany({ data: freeAgents });

      console.log('Seed completado.');
      console.log(`Tu equipo ID: ${userTeamId} | Presupuesto: $${USER_STARTING_BUDGET.toLocaleString()}`);
      console.log('Aun no hay temporada/calendario. Usa "Iniciar Temporada" desde la app.');
    },
    { timeout: 30000 }
  );
}

if (require.main === module) {
  seed()
    .then(() => prisma.$disconnect())
    .catch((err) => {
      console.error('Error en seed:', err);
      prisma.$disconnect();
      process.exit(1);
    });
}

module.exports = { seed };
