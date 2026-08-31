const prisma = require('../db/prisma');
const { generatePlayer, POSITIONS, randomInt, calculateSalary } = require('../seeders/generators/playerGenerator');
const { releasePlayerWithPenalty, findWeakestRosterPlayer, RELEASE_PENALTY_RATE } = require('./auctionService');
const { CPU_REVENUE_PER_FAN_MIN, CPU_REVENUE_PER_FAN_MAX, MAX_ROSTER_SIZE } = require('../config');

async function giveCpuTeamsRevenue() {
    const cpuTeamsRevenue = await prisma.team.findMany({
        where: { is_user_team: false },
        select: { id: true, fan_base: true },
    });

    for (const ct of cpuTeamsRevenue) {
        const span = CPU_REVENUE_PER_FAN_MAX - CPU_REVENUE_PER_FAN_MIN + 1;
        const revenuePerFan = Math.floor(Math.random() * span) + CPU_REVENUE_PER_FAN_MIN; // entero en [MIN, MAX] por fan
        const revenue = ct.fan_base * revenuePerFan;
        if (revenue > 0) {
            await prisma.team.update({
                where: { id: ct.id },
                data: { budget: { increment: revenue } },
            });
        }
    }
}

async function getMissingPositions(teamId) {
  const grouped = await prisma.player.groupBy({
    by: ['position'],
    where: { team_id: teamId, status: 'active', level: 'MAJOR' },
    _count: { id: true },
  });
  const present = new Set(grouped.map((g) => g.position));
  return POSITIONS.filter((p) => !present.has(p));
}

// Genera y guarda un jugador MAJOR asignado directo a `position`, como si viniera recien
// graduado de las menores: 22-26 anios, 30-70 de skill actual, contrato de 1-3 anios.
async function createReplacement(teamId, position) {
  const currentSkill = randomInt(30, 70);
  const replacement = generatePlayer({
    position,
    age: randomInt(22, 26),
    current_skill: currentSkill,
    potential_coefficient: randomInt(currentSkill, Math.min(99, currentSkill + 30)),
    contract_years_remaining: randomInt(1, 3),
    rookie_contract: false,
    team_id: teamId,
    status: 'active',
  });
  await prisma.player.create({ data: { ...replacement, level: 'MAJOR' } });
}

// De las posiciones con excedente MAJOR (>1), de mayor a menor excedente, elige a quien cortar:
// primero el mas debil cortable "normal"; si no hay ninguno en ninguna posicion, ultimo recurso
// = rookie de 1er anio mas debil. Devuelve { player, fromPosition, viaRookieFallback } o null si
// no hay excedente. `grouped` viene en forma [{ position, _count: { id } }] (real o simulado).
async function pickReleaseTargetForFullRoster(teamId, missingPosition, grouped) {
  const surplus = grouped
    .filter((g) => g.position !== missingPosition && g._count.id > 1)
    .sort((a, b) => b._count.id - a._count.id);
  if (surplus.length === 0) return null;

  for (const g of surplus) {
    const p = await findWeakestRosterPlayer(prisma, teamId, g.position, { level: 'MAJOR' });
    if (p) return { player: p, fromPosition: g.position, viaRookieFallback: false };
  }
  for (const g of surplus) {
    const p = await findWeakestRosterPlayer(prisma, teamId, g.position, { level: 'MAJOR', includeRookies: true });
    if (p) return { player: p, fromPosition: g.position, viaRookieFallback: true };
  }
  return null;
}

// Corrige una posicion vacia. Si el roster MAJOR tiene espacio (por debajo de MAX_ROSTER_SIZE)
// simplemente genera un jugador para esa posicion, sin cortar a nadie. Cuando el roster esta
// lleno se libera (corte forzado: cobra solo lo que el budget permita, nunca lo deja negativo)
// al jugador mas debil de una posicion con excedente para hacer espacio. Solo devuelve false
// (no-op) si no hay ninguna posicion con excedente.
async function tryFillPosition(teamId, missingPosition) {
  const activeCount = await prisma.player.count({
    where: { team_id: teamId, status: 'active', level: 'MAJOR' },
  });

  if (activeCount < MAX_ROSTER_SIZE) {
    await createReplacement(teamId, missingPosition);
    return true;
  }

  const grouped = await prisma.player.groupBy({
    by: ['position'],
    where: { team_id: teamId, status: 'active', level: 'MAJOR' },
    _count: { id: true },
  });
  const target = await pickReleaseTargetForFullRoster(teamId, missingPosition, grouped);
  if (!target) return false;

  await releasePlayerWithPenalty(prisma, teamId, target.player, { forced: true });
  await createReplacement(teamId, missingPosition);
  return true;
}

// Revision de integridad de roster para equipos CPU (nunca el equipo del usuario): por cada
// posicion sin ningun jugador activo de nivel MAJOR se genera un reemplazo (cortando a un
// jugador de una posicion con excedente solo si el roster ya esta lleno). Pensada para
// correr en ROSTER_CHECK_DAY.
async function fillMissingPositions() {
  const cpuTeams = await prisma.team.findMany({ where: { is_user_team: false }, select: { id: true } });

  for (const team of cpuTeams) {
    const missing = await getMissingPositions(team.id);
    for (const pos of missing) {
      await tryFillPosition(team.id, pos);
    }
  }
}

// Version read-only de fillMissingPositions: no escribe nada, devuelve el plan de acciones
// que ejecutaria (por equipo CPU). Refleja la misma logica de tryFillPosition simulando el
// roster de forma incremental (cada ADD sube el conteo; en roster lleno cada corte reduce el
// excedente y descuenta del budget simulado solo lo que alcanza). El caso de roster lleno es
// practicamente inalcanzable en juego; la simulacion de ese ramo es una aproximacion (no
// encadena cortes del mismo jugador).
async function previewFillMissingPositions() {
  const cpuTeams = await prisma.team.findMany({
    where: { is_user_team: false },
    select: { id: true, name: true, budget: true },
    orderBy: { id: 'asc' },
  });

  const plan = [];

  for (const team of cpuTeams) {
    const missing = await getMissingPositions(team.id);
    if (missing.length === 0) continue;

    const grouped = await prisma.player.groupBy({
      by: ['position'],
      where: { team_id: team.id, status: 'active', level: 'MAJOR' },
      _count: { id: true },
    });
    const countMap = new Map(grouped.map((g) => [g.position, g._count.id]));
    let simCount = grouped.reduce((sum, g) => sum + g._count.id, 0);
    let simBudget = Number(team.budget);

    const actions = [];

    for (const pos of missing) {
      if (simCount < MAX_ROSTER_SIZE) {
        actions.push({
          position: pos,
          type: 'ADD',
          detail: `roster ${simCount}/${MAX_ROSTER_SIZE}: hay cupo, se genera jugador nuevo`,
        });
        countMap.set(pos, (countMap.get(pos) || 0) + 1);
        simCount += 1;
        continue;
      }

      const simGrouped = [...countMap.entries()].map(([position, c]) => ({ position, _count: { id: c } }));
      const target = await pickReleaseTargetForFullRoster(team.id, pos, simGrouped);
      if (!target) {
        actions.push({ position: pos, type: 'SKIP', detail: 'roster lleno y sin excedente cortable' });
        continue;
      }

      const { player: weakest, fromPosition: fromPos, viaRookieFallback } = target;
      const penalty = Math.round(
        Number(weakest.salary) * RELEASE_PENALTY_RATE * Math.max(0, weakest.contract_years_remaining)
      );
      const charged = Math.min(penalty, Math.max(0, simBudget));

      let detail = `roster lleno; corta al mas debil de ${fromPos} (jugador #${weakest.id}, skill ${weakest.current_skill}) y genera reemplazo; multa $${charged.toLocaleString()}`;
      if (charged < penalty) detail += ` (reducida de $${penalty.toLocaleString()} por budget insuficiente)`;
      if (viaRookieFallback) detail += ' (corte de rookie de 1er anio, ultimo recurso)';

      actions.push({
        position: pos,
        type: 'CUT_AND_ADD',
        detail,
        cut: { id: weakest.id, position: fromPos, current_skill: weakest.current_skill, penalty, charged, isRookie: viaRookieFallback },
      });
      countMap.set(fromPos, countMap.get(fromPos) - 1);
      countMap.set(pos, (countMap.get(pos) || 0) + 1);
      simBudget = Math.max(0, simBudget - charged);
    }

    plan.push({
      teamId: team.id,
      teamName: team.name,
      activeCount: grouped.reduce((sum, g) => sum + g._count.id, 0),
      missing,
      actions,
    });
  }

  return plan;
}

// Genera y guarda un ROOKIE MAJOR para `position` (contrato de novato, barato, sin pulir). A
// diferencia de createReplacement, este queda marcado como rookie_contract y se gradua a las 3
// temporadas via endOfSeasonCleanup. Es la red de seguridad cuando una lesion deja una posicion
// sin ningun jugador sano: no toca budget, no corta a nadie, no respeta MAX_ROSTER_SIZE.
async function createInjuryRookie(teamId, position) {
  const currentSkill = randomInt(20, 38);
  const potential = randomInt(Math.min(99, currentSkill + 20), 99);
  const marketSalary = calculateSalary(potential, currentSkill, 20);
  const rookieSalary = Math.max(5000, Math.round(marketSalary / 10 / 100) * 100);
  const rookie = generatePlayer({
    position,
    age: randomInt(18, 21),
    current_skill: currentSkill,
    potential_coefficient: potential,
    salary: rookieSalary,
    contract_years_remaining: randomInt(1, 3),
    rookie_contract: true,
    team_id: teamId,
    status: 'active',
  });
  return prisma.player.create({ data: { ...rookie, level: 'MAJOR' } });
}

// Red de seguridad post-lesion (solo equipos CPU, nunca el del usuario). Recibe el array
// [{ id, days }] que devuelve checkAndApplyGameInjuries. Por cada jugador CPU recien lesionado
// cuya posicion quede sin NINGUN jugador sano (activo, MAJOR, injury_days_remaining 0) genera un
// rookie para esa posicion. No corta a nadie ni respeta MAX_ROSTER_SIZE. Devuelve la lista de
// altas para que la capa superior cree noticias.
async function backfillInjuredCpuPositions(injuredIds) {
  if (!injuredIds || injuredIds.length === 0) return [];

  const injuredPlayers = await prisma.player.findMany({
    where: { id: { in: injuredIds.map((i) => i.id) } },
    select: {
      id: true,
      first_name: true,
      last_name: true,
      position: true,
      team_id: true,
      team: { select: { name: true, is_user_team: true } },
    },
  });

  const seen = new Set();
  const created = [];

  for (const p of injuredPlayers) {
    if (!p.team_id || !p.team || p.team.is_user_team) continue;
    const key = `${p.team_id}:${p.position}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const healthy = await prisma.player.count({
      where: {
        team_id: p.team_id,
        position: p.position,
        status: 'active',
        level: 'MAJOR',
        injury_days_remaining: 0,
      },
    });
    if (healthy > 0) continue;

    const rookie = await createInjuryRookie(p.team_id, p.position);
    created.push({
      teamId: p.team_id,
      teamName: p.team.name,
      position: p.position,
      injuredPlayerId: p.id,
      injuredPlayerName: `${p.first_name} ${p.last_name}`,
      createdPlayerId: rookie.id,
      createdPlayerName: `${rookie.first_name} ${rookie.last_name}`,
    });
  }

  return created;
}

// Version read-only para scripts/runInjuryBackfill.js. No escribe nada. Por cada equipo CPU
// reporta: wouldGenerate (posiciones sin jugador sano pero con >=1 lesionado -> lo que el sistema
// generaria si esas lesiones acabaran de ocurrir) y vulnerable (posiciones con exactamente 1
// jugador sano). extraInjuredPlayerIds simula "y si este jugador sano se lesiona ahora".
async function previewInjuryBackfill({ extraInjuredPlayerIds = [] } = {}) {
  const extra = new Set(extraInjuredPlayerIds.map(Number));
  const cpuTeams = await prisma.team.findMany({
    where: { is_user_team: false },
    select: { id: true, name: true },
    orderBy: { id: 'asc' },
  });

  const plan = [];

  for (const team of cpuTeams) {
    const players = await prisma.player.findMany({
      where: { team_id: team.id, status: 'active', level: 'MAJOR' },
      select: { id: true, first_name: true, last_name: true, position: true, injury_days_remaining: true },
    });

    const byPos = new Map();
    for (const p of players) {
      if (!byPos.has(p.position)) byPos.set(p.position, { healthyIds: [], injured: [] });
      const slot = byPos.get(p.position);
      if (p.injury_days_remaining > 0 || extra.has(p.id)) slot.injured.push(p);
      else slot.healthyIds.push(p.id);
    }

    const wouldGenerate = [];
    const vulnerable = [];
    for (const [position, slot] of byPos) {
      if (slot.healthyIds.length === 0 && slot.injured.length > 0) {
        wouldGenerate.push({
          position,
          injured: slot.injured.map((p) => ({
            id: p.id,
            name: `${p.first_name} ${p.last_name}`,
            days: p.injury_days_remaining,
            hypothetical: p.injury_days_remaining === 0,
          })),
        });
      } else if (slot.healthyIds.length === 1) {
        vulnerable.push({ position, healthyId: slot.healthyIds[0] });
      }
    }

    if (wouldGenerate.length > 0 || vulnerable.length > 0) {
      plan.push({ teamId: team.id, teamName: team.name, wouldGenerate, vulnerable });
    }
  }

  return plan;
}

module.exports = {
  giveCpuTeamsRevenue,
  fillMissingPositions,
  getMissingPositions,
  pickReleaseTargetForFullRoster,
  previewFillMissingPositions,
  createInjuryRookie,
  backfillInjuredCpuPositions,
  previewInjuryBackfill,
};
