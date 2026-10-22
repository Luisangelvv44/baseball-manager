const prisma = require('../db/prisma');
const {
  USER_TEAM_ID,
  JERSEY_PITCHER_RANGE,
  JERSEY_FIELDER_RANGE,
  RETIRED_NUMBER_MIN_SEASONS,
  RETIRED_NUMBER_HOF_FAN_BONUS_PCT,
} = require('../config');
const { createNews } = require('./newsService');

// Dorsales: cada jugador con equipo tiene un numero 0-99 unico dentro de su equipo, guardado
// en Player.jersey_number junto con el equipo para el que se asigno (jersey_team_id). No hay
// ganchos en cada fichaje/traspaso: syncJerseyNumbers() detecta a quien le falta numero o lo
// trae de otro equipo (jersey_team_id != team_id) y lo resuelve en lote. El numero tambien se
// copia al Contract activo, para saber que dorsal uso cada jugador en cada equipo.
// Un numero retirado (RetiredNumber) no lo puede usar nadie del equipo, salvo un hijo del
// homenajeado, que lo prefiere por sobre cualquier otro.

const ALL_NUMBERS = Array.from({ length: 100 }, (_, i) => i);
const fullName = (p) => `${p.first_name} ${p.last_name}`;

function rangeOf(position) {
  const [lo, hi] = position === 'P' ? JERSEY_PITCHER_RANGE : JERSEY_FIELDER_RANGE;
  return ALL_NUMBERS.filter((n) => n >= lo && n <= hi);
}

// Elige dorsal: primero las preferencias en orden (numero del padre, el que ya traia), luego
// uno al azar del rango de su posicion, y si esta lleno cualquiera libre. null si no queda ninguno.
function pickNumber({ preferences = [], position, isAllowed, rng = Math.random }) {
  for (const n of preferences) {
    if (n != null && isAllowed(n)) return n;
  }
  for (const pool of [rangeOf(position), ALL_NUMBERS]) {
    const free = pool.filter(isAllowed);
    if (free.length > 0) return free[Math.floor(rng() * free.length)];
  }
  return null;
}

async function loadRetiredByTeam() {
  const rows = await prisma.retiredNumber.findMany({ select: { team_id: true, number: true, player_id: true } });
  const byTeam = new Map();
  for (const r of rows) {
    if (!byTeam.has(r.team_id)) byTeam.set(r.team_id, new Map());
    byTeam.get(r.team_id).set(r.number, r.player_id);
  }
  return byTeam;
}

async function setJersey(player, teamId, number) {
  await prisma.player.update({ where: { id: player.id }, data: { jersey_number: number, jersey_team_id: teamId } });
  await prisma.contract.updateMany({
    where: { player_id: player.id, team_id: teamId, status: 'active' },
    data: { jersey_number: number },
  });
}

// Asigna/corrige dorsales de todos los jugadores con equipo. Idempotente: si nadie cambio de
// equipo ni se retiro un numero, no escribe nada (salvo contratos nuevos sin dorsal).
// `season` (opcional) solo fecha las noticias.
async function syncJerseyNumbers({ season = null, rng = Math.random } = {}) {
  const [players, retiredByTeam] = await Promise.all([
    prisma.player.findMany({
      where: { team_id: { not: null }, status: 'active' },
      orderBy: { id: 'asc' },
      select: {
        id: true, first_name: true, last_name: true, team_id: true, position: true,
        jersey_number: true, jersey_team_id: true, parent_id: true,
        parent: { select: { first_name: true, last_name: true, jersey_number: true } },
      },
    }),
    loadRetiredByTeam(),
  ]);

  const byTeam = new Map();
  for (const p of players) {
    if (!byTeam.has(p.team_id)) byTeam.set(p.team_id, []);
    byTeam.get(p.team_id).push(p);
  }

  let assigned = 0;
  for (const [teamId, roster] of byTeam) {
    const retired = retiredByTeam.get(teamId) || new Map();
    const usableBy = (p, n) => !retired.has(n) || (p.parent_id != null && retired.get(n) === p.parent_id);
    const taken = new Set();
    const needs = [];

    // Se quedan con su numero los que ya lo tienen para este equipo (sin choques ni retiros)
    for (const p of roster) {
      const n = p.jersey_number;
      if (p.jersey_team_id === teamId && n != null && !taken.has(n) && usableBy(p, n)) taken.add(n);
      else needs.push(p);
    }

    for (const p of needs) {
      const number = pickNumber({
        preferences: [p.parent?.jersey_number, p.jersey_number],
        position: p.position,
        isAllowed: (n) => !taken.has(n) && usableBy(p, n),
        rng,
      });
      if (number == null) continue;
      taken.add(number);
      await setJersey(p, teamId, number);
      assigned++;

      if (p.parent && number === p.parent.jersey_number) {
        const honored = retired.get(number) === p.parent_id ? ', el que su equipo había retirado en su honor' : '';
        await createNews(
          'hall_of_fame',
          `🎽 ${fullName(p)} lucirá el #${number} de su padre ${fullName(p.parent)}${honored}`,
          season?.current_day ?? null,
          season?.id ?? null,
          { teamId, alert: teamId === USER_TEAM_ID },
        );
      }
    }
  }

  // Contratos activos sin dorsal (renovaciones, firmas recientes) de jugadores que ya lo tienen
  const blankContracts = await prisma.contract.findMany({
    where: { status: 'active', jersey_number: null, team_id: { not: null } },
    select: { id: true, player_id: true, team_id: true },
  });
  if (blankContracts.length > 0) {
    const playerById = new Map(players.map((p) => [p.id, p]));
    const idsByNumber = new Map();
    for (const c of blankContracts) {
      const p = playerById.get(c.player_id);
      if (!p || p.team_id !== c.team_id) continue;
      // el que se acaba de asignar arriba ya actualizo su contrato; aca cubrimos al resto
      if (p.jersey_team_id !== c.team_id || p.jersey_number == null) continue;
      if (!idsByNumber.has(p.jersey_number)) idsByNumber.set(p.jersey_number, []);
      idsByNumber.get(p.jersey_number).push(c.id);
    }
    for (const [number, ids] of idsByNumber) {
      await prisma.contract.updateMany({ where: { id: { in: ids } }, data: { jersey_number: number } });
    }
  }

  return { assigned };
}

// Dorsal que uso `playerId` con `teamId`: el del contrato mas reciente con ese equipo que lo
// tenga, o el actual del jugador si se asigno para ese equipo.
async function numberWornFor(player, teamId) {
  const contract = await prisma.contract.findFirst({
    where: { player_id: player.id, team_id: teamId, jersey_number: { not: null } },
    orderBy: { id: 'desc' },
    select: { jersey_number: true },
  });
  if (contract) return contract.jersey_number;
  return player.jersey_team_id === teamId ? player.jersey_number : null;
}

async function seasonsWithTeam(playerId, teamId) {
  const rows = await prisma.playerSeasonRecord.findMany({
    where: { player_id: playerId, team_id: teamId },
    select: { season_id: true },
  });
  return new Set(rows.map((r) => r.season_id)).size;
}

// Retira el numero de un jugador retirado en `teamId`. El usuario necesita
// RETIRED_NUMBER_MIN_SEASONS temporadas del jugador en su equipo; el retiro automatico de la
// CPU (al exaltar a su leyenda) no. Si es miembro del Salon de la Fama, el equipo gana afición.
async function retireNumber(teamId, playerId, { seasonId = null, seasonDay = null, auto = false } = {}) {
  const player = await prisma.player.findUnique({
    where: { id: playerId },
    select: {
      id: true, first_name: true, last_name: true, status: true, jersey_number: true, jersey_team_id: true,
      hall_of_fame: { select: { status: true } },
    },
  });
  if (!player) throw new Error('Jugador no encontrado');
  if (player.status !== 'retired') throw new Error('Solo se puede retirar el número de un jugador retirado');

  const existing = await prisma.retiredNumber.findFirst({ where: { team_id: teamId, player_id: playerId } });
  if (existing) throw new Error('El número de este jugador ya está retirado');

  const number = await numberWornFor(player, teamId);
  if (number == null) throw new Error('El jugador no tiene un dorsal registrado con este equipo');

  if (!auto) {
    const seasons = await seasonsWithTeam(playerId, teamId);
    if (seasons < RETIRED_NUMBER_MIN_SEASONS) {
      throw new Error(`Necesita al menos ${RETIRED_NUMBER_MIN_SEASONS} temporadas con el equipo (tiene ${seasons})`);
    }
  }

  const taken = await prisma.retiredNumber.findFirst({ where: { team_id: teamId, number } });
  if (taken) throw new Error(`El #${number} ya está retirado por otro jugador`);

  const row = await prisma.retiredNumber.create({
    data: { team_id: teamId, player_id: playerId, number, season_id: seasonId },
  });

  const team = await prisma.team.findUnique({ where: { id: teamId }, select: { name: true, fan_base: true } });
  const isHallOfFamer = player.hall_of_fame?.status === 'inducted';
  if (team && isHallOfFamer && RETIRED_NUMBER_HOF_FAN_BONUS_PCT > 0) {
    await prisma.team.update({
      where: { id: teamId },
      data: { fan_base: Math.round(team.fan_base * (1 + RETIRED_NUMBER_HOF_FAN_BONUS_PCT)) },
    });
  }
  await createNews(
    'hall_of_fame',
    `🎽 ${team?.name ?? 'El equipo'} retira el #${number} de ${fullName(player)}: nadie más lo volverá a usar`,
    seasonDay,
    seasonId,
    { teamId, alert: teamId === USER_TEAM_ID },
  );

  return { ...row, fan_bonus: isHallOfFamer };
}

// Vista para History: numeros retirados de toda la liga y candidatos del usuario.
async function getRetiredNumbersOverview() {
  const rows = await prisma.retiredNumber.findMany({
    include: {
      team: { select: { id: true, name: true } },
      player: { select: { first_name: true, last_name: true, position: true, hall_of_fame: { select: { status: true } } } },
    },
    orderBy: [{ team_id: 'asc' }, { number: 'asc' }],
  });
  const retired = rows.map((r) => ({
    team_id: r.team_id,
    team_name: r.team.name,
    is_user_team: r.team_id === USER_TEAM_ID,
    number: r.number,
    player_id: r.player_id,
    player_name: fullName(r.player),
    position: r.player.position,
    hall_of_famer: r.player.hall_of_fame?.status === 'inducted',
    season_id: r.season_id,
  }));

  // Candidatos: retirados que tuvieron dorsal con el equipo del usuario y aun no lo tienen retirado
  const contracts = await prisma.contract.findMany({
    where: { team_id: USER_TEAM_ID, jersey_number: { not: null }, player: { status: 'retired' } },
    orderBy: { id: 'desc' },
    select: {
      player_id: true,
      jersey_number: true,
      player: {
        select: {
          first_name: true, last_name: true, position: true,
          hall_of_fame: { select: { status: true, legacy_score: true } },
        },
      },
    },
  });
  const userRetired = new Set(retired.filter((r) => r.is_user_team).map((r) => r.player_id));
  const userNumbers = new Set(retired.filter((r) => r.is_user_team).map((r) => r.number));
  const latestByPlayer = new Map();
  for (const c of contracts) {
    if (!userRetired.has(c.player_id) && !latestByPlayer.has(c.player_id)) latestByPlayer.set(c.player_id, c);
  }

  const ids = [...latestByPlayer.keys()];
  const seasonRows = ids.length > 0
    ? await prisma.playerSeasonRecord.findMany({
        where: { team_id: USER_TEAM_ID, player_id: { in: ids } },
        select: { player_id: true, season_id: true },
      })
    : [];
  const seasonsBy = new Map();
  for (const r of seasonRows) {
    if (!seasonsBy.has(r.player_id)) seasonsBy.set(r.player_id, new Set());
    seasonsBy.get(r.player_id).add(r.season_id);
  }

  const candidates = ids
    .map((id) => {
      const c = latestByPlayer.get(id);
      const seasons = seasonsBy.get(id)?.size ?? 0;
      return {
        player_id: id,
        player_name: fullName(c.player),
        position: c.player.position,
        number: c.jersey_number,
        seasons_with_team: seasons,
        hall_of_fame_status: c.player.hall_of_fame?.status ?? null,
        legacy_score: c.player.hall_of_fame?.legacy_score ?? 0,
        number_taken: userNumbers.has(c.jersey_number),
        eligible: seasons >= RETIRED_NUMBER_MIN_SEASONS && !userNumbers.has(c.jersey_number),
      };
    })
    .filter((c) => c.seasons_with_team >= RETIRED_NUMBER_MIN_SEASONS)
    .sort((a, b) => (b.hall_of_fame_status === 'inducted') - (a.hall_of_fame_status === 'inducted') || b.legacy_score - a.legacy_score);

  return { retired, candidates, min_seasons: RETIRED_NUMBER_MIN_SEASONS };
}

module.exports = {
  syncJerseyNumbers,
  retireNumber,
  getRetiredNumbersOverview,
  pickNumber,
  numberWornFor,
};
