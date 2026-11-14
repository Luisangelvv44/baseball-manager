// Migraciones SQLite de las partidas desktop.
//
// desktop/migrations/NNNN_nombre/migration.sql se generan con `npm run migration:new -- <nombre>`
// (diff entre migrations/_snapshot.prisma y el schema actual derivado del backend) y se
// versionan en git. Al abrir el juego, migrate() aplica en orden las que la partida no
// tenga, registrándolas en la tabla _desktop_migrations:
//   - Partida nueva (sin tablas): se aplican todas, empezando por 0001_init.
//   - Partida anterior a las migraciones (tiene _desktop_meta de la v1): ya tiene el schema
//     de 0001_init, que se marca como aplicada sin ejecutarla.
//   - Antes de migrar una partida existente se copia save.db a save.db.bak-<fecha>.
//   - Cada migración corre en una transacción con foreign_keys desactivadas (lo que exige
//     SQLite para redefinir tablas) y se valida con PRAGMA foreign_key_check antes del
//     COMMIT; si algo falla se hace ROLLBACK y la partida queda como estaba.
// Requiere que el cliente Prisma use una sola conexión (connection_limit=1 en DATABASE_URL)
// para que BEGIN/COMMIT y los PRAGMA vayan por la misma conexión.
const fs = require('fs');
const path = require('path');

const MIGRATIONS_TABLE = '_desktop_migrations';
const LEGACY_META_TABLE = '_desktop_meta';

function listMigrations(migrationsDir) {
  return fs
    .readdirSync(migrationsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && /^\d{4}_/.test(d.name))
    .map((d) => d.name)
    .sort();
}

function splitSql(sql) {
  return sql
    .split(/;\s*(?:\r?\n|$)/)
    .map((s) => s.replace(/^\s*--.*$/gm, '').trim())
    .filter(Boolean);
}

async function run(prisma, stmt) {
  // Los PRAGMA pueden devolver filas, y $executeRaw no lo permite en SQLite.
  if (/^PRAGMA\b/i.test(stmt)) return prisma.$queryRawUnsafe(stmt);
  return prisma.$executeRawUnsafe(stmt);
}

async function hasTable(prisma, name) {
  const rows = await prisma.$queryRawUnsafe(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
    name,
  );
  return rows.length > 0;
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

async function backupDatabase(prisma, dbFile) {
  // Volcar el WAL al archivo principal para que la copia esté completa.
  await prisma.$queryRawUnsafe('PRAGMA wal_checkpoint(TRUNCATE);');
  const backup = `${dbFile}.bak-${timestamp()}`;
  fs.copyFileSync(dbFile, backup);
  return backup;
}

async function applyMigration(prisma, migrationsDir, name) {
  const sql = fs.readFileSync(path.join(migrationsDir, name, 'migration.sql'), 'utf8');
  const statements = splitSql(sql);

  await prisma.$queryRawUnsafe('PRAGMA foreign_keys = OFF;');
  await prisma.$executeRawUnsafe('BEGIN');
  try {
    for (const stmt of statements) {
      await run(prisma, stmt);
    }
    const violations = await prisma.$queryRawUnsafe('PRAGMA foreign_key_check;');
    if (violations.length > 0) {
      throw new Error(
        `La migración ${name} deja ${violations.length} claves foráneas rotas ` +
          `(p. ej. tabla ${violations[0].table}, fila ${violations[0].rowid}).`,
      );
    }
    await prisma.$executeRawUnsafe(
      `INSERT INTO "${MIGRATIONS_TABLE}" ("name", "applied_at") VALUES (?, ?)`,
      name,
      new Date().toISOString(),
    );
    await prisma.$executeRawUnsafe('COMMIT');
  } catch (err) {
    await prisma.$executeRawUnsafe('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    await prisma.$queryRawUnsafe('PRAGMA foreign_keys = ON;');
  }
}

/**
 * Pone la partida al día. Devuelve { fresh, applied, backup, unknown }:
 *   fresh   → la base estaba vacía (hay que sembrar la liga)
 *   applied → migraciones aplicadas ahora
 *   backup  → ruta de la copia previa (null si no hizo falta)
 *   unknown → migraciones registradas en la partida que esta versión no conoce
 *             (partida abierta antes con una versión más nueva del juego)
 */
async function migrate(prisma, { migrationsDir, dbFile, log = () => {} }) {
  const all = listMigrations(migrationsDir);
  if (all.length === 0) throw new Error(`No hay migraciones en ${migrationsDir}`);

  const fresh = !(await hasTable(prisma, 'Team'));
  const legacy = !fresh && !(await hasTable(prisma, MIGRATIONS_TABLE)) && (await hasTable(prisma, LEGACY_META_TABLE));

  await prisma.$executeRawUnsafe(
    `CREATE TABLE IF NOT EXISTS "${MIGRATIONS_TABLE}" ("name" TEXT NOT NULL PRIMARY KEY, "applied_at" TEXT NOT NULL)`,
  );

  if (legacy) {
    // Partida creada antes de existir las migraciones: su schema es el de 0001_init.
    await prisma.$executeRawUnsafe(
      `INSERT INTO "${MIGRATIONS_TABLE}" ("name", "applied_at") VALUES (?, ?)`,
      all[0],
      new Date().toISOString(),
    );
    await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "${LEGACY_META_TABLE}"`);
    log(`migraciones: partida anterior marcada con ${all[0]}`);
  }

  const appliedRows = await prisma.$queryRawUnsafe(`SELECT "name" FROM "${MIGRATIONS_TABLE}"`);
  const appliedSet = new Set(appliedRows.map((r) => r.name));
  const unknown = [...appliedSet].filter((n) => !all.includes(n));
  const pending = all.filter((n) => !appliedSet.has(n));

  let backup = null;
  if (pending.length > 0 && !fresh) {
    backup = await backupDatabase(prisma, dbFile);
    log(`migraciones: copia de seguridad en ${backup}`);
  }

  for (const name of pending) {
    log(`migraciones: aplicando ${name}`);
    try {
      await applyMigration(prisma, migrationsDir, name);
    } catch (err) {
      err.message =
        `Falló la migración ${name}: ${err.message}` +
        (backup ? `\nLa partida no se modificó; hay una copia en ${backup}` : '');
      throw err;
    }
  }

  return { fresh, applied: pending, backup, unknown };
}

module.exports = { migrate, listMigrations, splitSql };
