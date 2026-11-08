// Migracion unica de una partida de 16 equipos a la liga de 24: 4 divisiones de 6, y 8 equipos nuevos
// con 100K fans y $100M. No cambia nada mas de los 16 equipos existentes salvo su division.
// Uso: node scripts/expandLeagueTo24.js   (solo entre temporadas; todo va en una transaccion)
require('dotenv').config();
const prisma = require('../db/prisma');
const { TEAM_DIVISIONS } = require('../seeders/data/names');
const { generateRoster } = require('../seeders/generators/playerGenerator');
const { randomAppearanceData } = require('../services/playerAppearanceService');
const { signContractFromPlayer } = require('../services/contractService');

const NEW_TEAM_FAN_BASE = 100_000;
const NEW_TEAM_BUDGET = 100_000_000;
const NEW_TEAM_REPUTATION = 50;
const NEW_TEAM_ROSTER_SIZE = 16;

const randomFloat = (min, max) => parseFloat((Math.random() * (max - min) + min).toFixed(3));

// Todo lo de un equipo salvo su division y el timestamp (para comprobar que no cambio)
const snapshot = (teams) => JSON.stringify(teams.map(({ division_id, ...rest }) => rest));

async function migrate(tx) {
  const season = await tx.season.findFirst({ orderBy: { id: 'desc' } });
  if (season && ['active', 'playoffs'].includes(season.status)) {
    throw new Error(`Hay una temporada en curso (status ${season.status}); migra entre temporadas`);
  }

  const before = await tx.team.findMany({ orderBy: { id: 'asc' } });
  const divisions = await tx.division.findMany({ orderBy: { id: 'asc' } });
  if (before.length !== 16 || divisions.length !== 2) {
    throw new Error(`Se esperaban 16 equipos y 2 divisiones; hay ${before.length} y ${divisions.length}`);
  }

  // Las divisiones existentes pasan a ser las dos primeras: los ids deben quedar en orden NO, SO, NE, SE
  const divisionIdByName = {};
  for (let i = 0; i < TEAM_DIVISIONS.length; i++) {
    const { name } = TEAM_DIVISIONS[i];
    const row = divisions[i]
      ? await tx.division.update({ where: { id: divisions[i].id }, data: { name } })
      : await tx.division.create({ data: { name } });
    divisionIdByName[name] = row.id;
  }

  const existingNames = new Set(before.map((t) => t.name));
  const created = [];
  for (const { name: divisionName, teams } of TEAM_DIVISIONS) {
    const divisionId = divisionIdByName[divisionName];
    for (const teamName of teams) {
      if (existingNames.has(teamName)) continue;
      created.push(await tx.team.create({
        data: {
          name: teamName,
          division_id: divisionId,
          is_user_team: false,
          budget: NEW_TEAM_BUDGET,
          reputation: NEW_TEAM_REPUTATION,
          fan_base: NEW_TEAM_FAN_BASE,
          min_fan_base_season: NEW_TEAM_FAN_BASE,
          max_fan_base_season: NEW_TEAM_FAN_BASE,
          bid_aggressiveness: randomFloat(0.05, 0.25),
          min_growth_threshold: randomFloat(0.5, 5.0),
        },
      }));
    }
    await tx.team.updateMany({ where: { name: { in: teams } }, data: { division_id: divisionId } });
  }
  if (created.length !== 8) throw new Error(`Se esperaban 8 equipos nuevos; se crearon ${created.length}`);

  const newTeamIds = created.map((t) => t.id);
  for (const team of created) {
    await tx.player.createMany({ data: generateRoster(team.id, NEW_TEAM_ROSTER_SIZE) });
  }
  const players = await tx.player.findMany({ where: { team_id: { in: newTeamIds } } });
  await tx.playerAppearance.createMany({ data: players.map((p) => randomAppearanceData(p.id)) });
  for (const player of players) {
    await signContractFromPlayer(tx, player, null); // empieza en la proxima temporada
  }

  const after = await tx.team.findMany({ where: { id: { in: before.map((t) => t.id) } }, orderBy: { id: 'asc' } });
  if (snapshot(after) !== snapshot(before)) throw new Error('Los equipos existentes cambiaron algo mas que la division');

  return { created, players: players.length };
}

prisma.$transaction(migrate, { timeout: 120000 })
  .then(({ created, players }) => {
    console.log(`Liga ampliada: ${created.length} equipos nuevos, ${players} jugadores.`);
    created.forEach((t) => console.log(`  #${t.id} ${t.name}`));
  })
  .catch((err) => {
    console.error('Migracion cancelada, no se guardo nada:', err.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
