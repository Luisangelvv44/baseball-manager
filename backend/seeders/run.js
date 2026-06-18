const prisma = require('../db/prisma');
const { generateRoster, generatePlayer, POSITIONS } = require('./generators/playerGenerator');
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

        const fan_base = isUser ? 100000 : reputation * 1000;

        const team = await tx.team.create({
          data: { name, division_id: divisionId, is_user_team: isUser, budget, reputation, bid_aggressiveness, min_growth_threshold, fan_base },
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
      const freeAgents = [];
      for (const pos of POSITIONS) {
        for (let i = 0; i < 10; i++) {
          freeAgents.push(generatePlayer({ status: 'free_agent', position: pos }));
        }
      }
      await tx.player.createMany({ data: freeAgents });

      // ---------- Empresas de transmisión ----------
      console.log('Creando empresas de transmisión...');
      const TV_COMPANIES = [
        { name: 'ESPN Baseball',     price_per_fan: 0.5000 },
        { name: 'Fox Sports',        price_per_fan: 0.4200 },
        { name: 'TNT Sports',        price_per_fan: 0.3600 },
        { name: 'MLB Network',       price_per_fan: 0.3000 },
        { name: 'NBC Sports',        price_per_fan: 0.2500 },
        { name: 'CBS Sports',        price_per_fan: 0.2000 },
        { name: 'TBS',               price_per_fan: 0.1700 },
        { name: 'Bally Sports',      price_per_fan: 0.1400 },
        { name: 'NESN',              price_per_fan: 0.1200 },
        { name: 'Regional Sports TV',price_per_fan: 0.1000 },
      ];
      const RADIO_COMPANIES = [
        { name: 'SiriusXM Baseball', price_per_fan: 0.0800 },
        { name: 'ESPN Radio',        price_per_fan: 0.0670 },
        { name: 'CBS Sports Radio',  price_per_fan: 0.0560 },
        { name: 'iHeart Baseball',   price_per_fan: 0.0470 },
        { name: 'Fox Sports Radio',  price_per_fan: 0.0400 },
        { name: 'The Sports Hub',    price_per_fan: 0.0340 },
        { name: 'AM 680 KNBR',       price_per_fan: 0.0280 },
        { name: 'Sports Radio 1050', price_per_fan: 0.0240 },
        { name: 'The Fan Network',   price_per_fan: 0.0200 },
        { name: 'Local Diamond Radio',price_per_fan: 0.0200 },
      ];
      for (const c of TV_COMPANIES) {
        await tx.broadcastCompany.create({ data: { ...c, type: 'TV' } });
      }
      for (const c of RADIO_COMPANIES) {
        await tx.broadcastCompany.create({ data: { ...c, type: 'RADIO' } });
      }

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
