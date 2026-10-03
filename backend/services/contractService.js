const prisma = require('../db/prisma');
const {
  USER_TEAM_ID,
  ACHIEVEMENT_BONUS_MAX_PCT,
  CPU_ACHIEVEMENT_BONUS_MAX_PCT,
  ACHIEVEMENT_BONUS_SEASON_CAP_PCT,
} = require('../config');

// Registro formal de contratos (modelo Contract). Player.salary / contract_years_remaining /
// rookie_contract siguen siendo la fuente que lee el resto del juego; estas funciones se
// llaman junto a cada escritura de esos campos para mantener la tabla sincronizada.
// Todas reciben `client` (prisma o una transaccion) como primer argumento.

const DEMAND_FACTOR_MAX = 3;
const IN_PROGRESS_STATUSES = ['active', 'playoffs'];

const ACHIEVEMENT_LABELS = {
  no_hitter: 'no-hitter',
  perfect_game: 'juego perfecto',
  cycle: 'ciclo',
  multi_hr: 'partido de multiples jonrones',
  award: 'premio de temporada',
};

// Bono por logro que exige el jugador: 0-3% del anual segun demand_factor (0.00-3.00),
// con tope bajo para equipos CPU.
function achievementBonusFor(player, annualSalary, teamId) {
  const demand = Math.min(DEMAND_FACTOR_MAX, Math.max(0, Number(player?.demand_factor ?? 0)));
  let pct = (demand / DEMAND_FACTOR_MAX) * ACHIEVEMENT_BONUS_MAX_PCT;
  if (teamId !== USER_TEAM_ID) pct = Math.min(pct, CPU_ACHIEVEMENT_BONUS_MAX_PCT);
  return Math.round(Number(annualSalary) * pct);
}

// Temporada a la que pertenece una firma hecha "ahora": la temporada en curso, o null en
// offseason (draft/completed) — en ese caso assignPendingStartSeason la fija al iniciar la proxima.
async function getContractSeasonId(client = prisma) {
  const season = await client.season.findFirst({
    where: { status: { in: IN_PROGRESS_STATUSES } },
    orderBy: { id: 'desc' },
    select: { id: true },
  });
  return season?.id ?? null;
}

function contractData(player, { teamId, annualSalary, years, yearsRemaining, isRookie, seasonId, achievementBonus }) {
  const salary = Math.round(Number(annualSalary));
  const totalYears = Math.max(1, Number(years) || 1);
  return {
    player_id: player.id,
    team_id: teamId ?? null,
    start_season_id: seasonId ?? null,
    is_rookie: Boolean(isRookie),
    annual_salary: salary,
    total_years: totalYears,
    years_remaining: yearsRemaining ?? totalYears,
    total_value: salary * totalYears,
    achievement_bonus: achievementBonus ?? achievementBonusFor(player, salary, teamId),
  };
}

// `player` necesita al menos { id, demand_factor }. Si seasonId no viene (undefined) se
// resuelve con getContractSeasonId; pasar null explicito = empieza la proxima temporada.
async function signContract(client, player, terms) {
  const seasonId = terms.seasonId !== undefined ? terms.seasonId : await getContractSeasonId(client);
  return client.contract.create({ data: contractData(player, { ...terms, seasonId }) });
}

// Firma un contrato que refleja tal cual lo que ya tiene el Player (team_id, salary,
// contract_years_remaining, rookie_contract): para jugadores recien creados/asignados.
function signContractFromPlayer(client, player, seasonId) {
  return signContract(client, player, {
    teamId: player.team_id,
    annualSalary: player.salary,
    years: player.contract_years_remaining,
    isRookie: player.rookie_contract,
    seasonId,
  });
}

// Ultima temporada creada (cualquier status): un contrato que se cierra "ahora" cubre hasta ella.
async function getLatestSeasonId(client = prisma) {
  const season = await client.season.findFirst({ orderBy: { id: 'desc' }, select: { id: true } });
  return season?.id ?? null;
}

async function closeActiveContract(client, playerId, status, seasonId) {
  const endSeasonId = seasonId !== undefined ? seasonId : await getLatestSeasonId(client);
  return client.contract.updateMany({
    where: { player_id: playerId, status: 'active' },
    data: { status, end_season_id: endSeasonId, ended_at: new Date() },
  });
}

async function closeActiveContracts(client, playerIds, status, seasonId) {
  if (!playerIds.length) return { count: 0 };
  const endSeasonId = seasonId !== undefined ? seasonId : await getLatestSeasonId(client);
  return client.contract.updateMany({
    where: { player_id: { in: playerIds }, status: 'active' },
    data: { status, end_season_id: endSeasonId, ended_at: new Date() },
  });
}

// Renovacion / promocion / graduacion: cierra el vigente como 'replaced' y firma el nuevo.
// Si el nuevo empieza la proxima temporada (seasonId null), el anterior cubre hasta la actual.
async function replaceActiveContract(client, player, terms) {
  const seasonId = terms.seasonId !== undefined ? terms.seasonId : await getContractSeasonId(client);
  await closeActiveContract(client, player.id, 'replaced', seasonId ?? await getLatestSeasonId(client));
  return signContract(client, player, { ...terms, seasonId });
}

// Traspaso: el equipo nuevo hereda los terminos restantes, en un contrato propio para que
// el historial muestre ambos equipos esa temporada.
async function transferContract(client, playerId, newTeamId, seasonId) {
  const resolvedSeasonId = seasonId !== undefined ? seasonId : await getContractSeasonId(client);
  const active = await client.contract.findFirst({ where: { player_id: playerId, status: 'active' } });
  const player = await client.player.findUnique({
    where: { id: playerId },
    select: { id: true, salary: true, contract_years_remaining: true, rookie_contract: true, demand_factor: true },
  });
  if (!player) return null;
  await closeActiveContract(client, playerId, 'traded', resolvedSeasonId);
  const remaining = Math.max(1, player.contract_years_remaining);
  return signContract(client, player, {
    teamId: newTeamId,
    annualSalary: player.salary,
    years: remaining,
    yearsRemaining: player.contract_years_remaining,
    isRookie: player.rookie_contract,
    seasonId: resolvedSeasonId,
    achievementBonus: active ? Number(active.achievement_bonus) : undefined,
  });
}

// Fin de temporada, junto a updatePlayersContracts(): resta un anio y resetea el acumulado de
// bonos de la temporada. El cierre de los que expiran lo hace el llamador (closeActiveContracts).
async function advanceContractsAtSeasonEnd(client = prisma) {
  return client.contract.updateMany({
    where: { status: 'active' },
    data: { years_remaining: { decrement: 1 }, bonus_paid_season: 0 },
  });
}

async function assignPendingStartSeason(client, seasonId) {
  return client.contract.updateMany({
    where: { status: 'active', start_season_id: null },
    data: { start_season_id: seasonId },
  });
}

// Paga el bono por logro del contrato vigente, respetando el tope por temporada.
// Devuelve el monto pagado (0 si no hay contrato, no tiene bono o ya alcanzo el tope).
async function payAchievementBonus(client, { playerId, type, seasonDay = null }) {
  const contract = await client.contract.findFirst({
    where: { player_id: playerId, status: 'active', achievement_bonus: { gt: 0 } },
    include: { player: { select: { first_name: true, last_name: true } } },
  });
  if (!contract || contract.team_id == null) return 0;

  const cap = Math.round(Number(contract.annual_salary) * ACHIEVEMENT_BONUS_SEASON_CAP_PCT);
  const room = cap - Number(contract.bonus_paid_season);
  const amount = Math.round(Math.min(Number(contract.achievement_bonus), room));
  if (amount <= 0) return 0;

  await client.contract.update({
    where: { id: contract.id },
    data: { bonus_paid_season: { increment: amount }, bonus_paid_total: { increment: amount } },
  });
  await client.team.update({
    where: { id: contract.team_id },
    data: { budget: { decrement: amount } },
  });
  const name = contract.player ? `${contract.player.first_name} ${contract.player.last_name}` : `Jugador #${playerId}`;
  await client.finance.create({
    data: {
      team_id: contract.team_id,
      season_day: seasonDay,
      type: 'achievement_bonus',
      amount: -amount,
      description: `Bono por logro (${ACHIEVEMENT_LABELS[type] ?? type}): ${name}`,
    },
  });
  return amount;
}

// --- Backfill ---------------------------------------------------------------------------

// Agrupa los registros archivados de un jugador en "tramos" por equipo: registros
// consecutivos (por temporada) con el mismo team_id forman un solo contrato, aunque haya
// temporadas sin jugar en medio — asi esas temporadas quedan cubiertas en el historial.
function buildStints(records) {
  const sorted = records
    .filter((r) => r.team_id != null)
    .sort((a, b) => a.season_id - b.season_id || a.first_day - b.first_day);
  const stints = [];
  for (const r of sorted) {
    const last = stints[stints.length - 1];
    if (last && last.team_id === r.team_id) last.end_season_id = r.season_id;
    else stints.push({ team_id: r.team_id, start_season_id: r.season_id, end_season_id: r.season_id });
  }
  return stints;
}

// Contratos a crear para un jugador sin ninguno: los tramos pasados (expired, aproximados)
// y, si esta activo en un equipo, su contrato vigente (que absorbe el ultimo tramo si es del
// mismo equipo). `seasons` ordenadas por id asc; `latest` = ultima temporada (o null).
function planPlayerContracts(player, records, seasons, latest) {
  const seasonIndex = new Map(seasons.map((s, i) => [s.id, i]));
  const span = (startId, endId) => {
    const a = seasonIndex.get(startId);
    const b = seasonIndex.get(endId);
    return a != null && b != null ? b - a + 1 : 1;
  };
  const salary = Math.round(Number(player.salary));
  const stints = buildStints(records);
  const isActive = player.status === 'active' && player.team_id != null;
  const remaining = Math.max(0, player.contract_years_remaining);

  let current = null;
  if (isActive && stints.length && stints[stints.length - 1].team_id === player.team_id) {
    current = stints.pop();
  }

  const rows = stints.map((s) => {
    const years = span(s.start_season_id, s.end_season_id);
    return {
      player_id: player.id,
      team_id: s.team_id,
      start_season_id: s.start_season_id,
      end_season_id: s.end_season_id,
      is_rookie: false,
      annual_salary: salary,
      total_years: years,
      years_remaining: 0,
      total_value: salary * years,
      achievement_bonus: 0,
      status: 'expired',
      is_reconstructed: true,
    };
  });

  if (isActive) {
    const inProgress = latest && IN_PROGRESS_STATUSES.includes(latest.status);
    let startSeasonId;
    let totalYears;
    if (current) {
      // Temporadas transcurridas desde el inicio del tramo hasta la ultima; si la ultima esta
      // en curso, contract_years_remaining ya la incluye.
      const elapsed = span(current.start_season_id, latest?.id ?? current.end_season_id);
      startSeasonId = current.start_season_id;
      totalYears = elapsed + remaining - (inProgress ? 1 : 0);
    } else {
      startSeasonId = inProgress ? latest.id : null;
      totalYears = remaining;
    }
    totalYears = Math.max(1, totalYears, remaining);
    rows.push({
      player_id: player.id,
      team_id: player.team_id,
      start_season_id: startSeasonId,
      end_season_id: null,
      is_rookie: player.rookie_contract,
      annual_salary: salary,
      total_years: totalYears,
      years_remaining: remaining,
      total_value: salary * totalYears,
      achievement_bonus: 0,
      status: 'active',
      is_reconstructed: Boolean(current),
    });
  }

  return rows;
}

const BACKFILL_BATCH = 500;

// Idempotente: solo procesa jugadores que todavia no tienen ningun contrato.
async function backfillContracts(client = prisma) {
  const seasons = await client.season.findMany({ orderBy: { id: 'asc' }, select: { id: true, status: true } });
  const latest = seasons[seasons.length - 1] ?? null;

  const players = await client.player.findMany({
    where: { contracts: { none: {} } },
    select: {
      id: true, team_id: true, status: true, salary: true,
      contract_years_remaining: true, rookie_contract: true,
    },
    orderBy: { id: 'asc' },
  });

  let activeCreated = 0;
  let historicalCreated = 0;
  for (let i = 0; i < players.length; i += BACKFILL_BATCH) {
    const batch = players.slice(i, i + BACKFILL_BATCH);
    const records = await client.playerSeasonRecord.findMany({
      where: { player_id: { in: batch.map((p) => p.id) } },
      select: { player_id: true, season_id: true, team_id: true, first_day: true },
    });
    const byPlayer = new Map();
    for (const r of records) {
      if (!byPlayer.has(r.player_id)) byPlayer.set(r.player_id, []);
      byPlayer.get(r.player_id).push(r);
    }

    const rows = batch.flatMap((p) => planPlayerContracts(p, byPlayer.get(p.id) ?? [], seasons, latest));
    if (!rows.length) continue;
    await client.contract.createMany({ data: rows });
    for (const r of rows) {
      if (r.status === 'active') activeCreated++;
      else historicalCreated++;
    }
  }

  return { activeCreated, historicalCreated };
}

module.exports = {
  achievementBonusFor,
  getContractSeasonId,
  signContract,
  signContractFromPlayer,
  closeActiveContract,
  closeActiveContracts,
  replaceActiveContract,
  transferContract,
  advanceContractsAtSeasonEnd,
  assignPendingStartSeason,
  payAchievementBonus,
  buildStints,
  planPlayerContracts,
  backfillContracts,
};
