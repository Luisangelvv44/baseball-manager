// Genera desktop/prisma/init.sql (CREATE TABLE... para una base SQLite vacía) y
// desktop/prisma/schema.hash (para detectar partidas creadas con otro schema).
const { execFileSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SCHEMA = path.join(ROOT, 'prisma', 'schema.prisma');

const prismaBin = path.join(ROOT, 'node_modules', '.bin', process.platform === 'win32' ? 'prisma.cmd' : 'prisma');

const sql = execFileSync(
  prismaBin,
  ['migrate', 'diff', '--from-empty', '--to-schema-datamodel', SCHEMA, '--script'],
  { cwd: ROOT, encoding: 'utf8', shell: process.platform === 'win32' },
);

fs.writeFileSync(path.join(ROOT, 'prisma', 'init.sql'), sql);

const hash = crypto.createHash('sha256').update(fs.readFileSync(SCHEMA)).digest('hex').slice(0, 16);
fs.writeFileSync(path.join(ROOT, 'prisma', 'schema.hash'), hash);

console.log(`build-init-sql: init.sql (${sql.split(';').length - 1} sentencias), schema ${hash}`);
