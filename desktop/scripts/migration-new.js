// Crea una migración SQLite para las partidas desktop:
//   npm run migration:new -- <nombre>
// Regenera desktop/prisma/schema.prisma desde el backend, lo compara con
// migrations/_snapshot.prisma (el schema tras la última migración) y escribe
// migrations/NNNN_<nombre>/migration.sql. Luego actualiza el snapshot.
// Revisar el SQL antes de commitear: si añade una columna NOT NULL sin @default a una
// tabla con datos, hay que editarlo para dar un valor a las filas existentes.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { prisma, ROOT } = require('./prisma-cli');

const MIGRATIONS = path.join(ROOT, 'migrations');
const SNAPSHOT = path.join(MIGRATIONS, '_snapshot.prisma');
const SCHEMA = path.join(ROOT, 'prisma', 'schema.prisma');

// pnpm pasa el "--" tal cual; npm no.
const name = process.argv
  .slice(2)
  .filter((a) => a !== '--')
  .join(' ')
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '_')
  .replace(/^_|_$/g, '');
if (!name) {
  console.error('Uso: npm run migration:new -- <nombre>');
  process.exit(1);
}

execFileSync(process.execPath, [path.join(__dirname, 'gen-schema.js')], { stdio: 'inherit' });

fs.mkdirSync(MIGRATIONS, { recursive: true });
const from = fs.existsSync(SNAPSHOT) ? ['--from-schema-datamodel', SNAPSHOT] : ['--from-empty'];
const res = prisma(['migrate', 'diff', ...from, '--to-schema-datamodel', SCHEMA, '--script']);
if (res.status !== 0) {
  console.error(res.stderr || res.stdout);
  process.exit(1);
}
const sql = res.stdout;
if (/This is an empty migration/.test(sql) || !sql.trim()) {
  console.log('migration:new: el schema no cambió, no hay nada que migrar.');
  process.exit(0);
}

const existing = fs
  .readdirSync(MIGRATIONS)
  .filter((n) => /^\d{4}_/.test(n))
  .sort();
const next = existing.length ? Number(existing[existing.length - 1].slice(0, 4)) + 1 : 1;
const dir = path.join(MIGRATIONS, `${String(next).padStart(4, '0')}_${name}`);
fs.mkdirSync(dir);
fs.writeFileSync(path.join(dir, 'migration.sql'), sql);
fs.copyFileSync(SCHEMA, SNAPSHOT);

console.log(`migration:new: escrita ${path.relative(ROOT, dir)}${path.sep}migration.sql`);
if (/warning|NOT NULL/i.test(sql) && /ALTER TABLE|INSERT INTO "new_/.test(sql)) {
  console.log('Revisa el SQL: puede añadir columnas obligatorias a tablas con datos.');
}
