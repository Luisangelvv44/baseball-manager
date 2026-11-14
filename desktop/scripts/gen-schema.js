// Genera desktop/prisma/schema.prisma (SQLite) a partir de backend/prisma/schema.prisma
// (Postgres). No se edita a mano: correr `npm run prepare-db` tras cambiar el schema
// del backend.
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', '..', 'backend', 'prisma', 'schema.prisma');
const OUT_DIR = path.join(__dirname, '..', 'prisma');
const OUT = path.join(OUT_DIR, 'schema.prisma');

const SCALARS = ['String', 'Int', 'BigInt', 'Float', 'Decimal', 'Boolean', 'DateTime', 'Json', 'Bytes'];

let schema = fs.readFileSync(SRC, 'utf8');
const problems = [];

if (/^\s*enum\s+\w+/m.test(schema)) problems.push('enum (SQLite no tiene enums)');

// generator: cliente propio fuera de node_modules
schema = schema.replace(
  /generator\s+client\s*\{[^}]*\}/,
  'generator client {\n  provider = "prisma-client-js"\n  output   = "../prisma-client"\n}',
);

// datasource → sqlite
schema = schema.replace(
  /datasource\s+db\s*\{[^}]*\}/,
  'datasource db {\n  provider = "sqlite"\n  url      = env("DATABASE_URL")\n}',
);

// Atributos nativos de Postgres: @db.VarChar(50), @db.Decimal(14, 2), @db.Text...
schema = schema.replace(/\s@db\.\w+(\([^)]*\))?/g, '');

// Listas de escalares (Int[], String[]...) → Json. Prisma devuelve el array igual.
schema = schema.replace(new RegExp(`\\b(${SCALARS.join('|')})\\[\\](\\?)?`, 'g'), (m, type) => {
  if (type !== 'Int' && type !== 'String') {
    problems.push(`lista ${type}[] (revisar a mano)`);
  }
  return 'Json';
});

if (/@default\(\[/.test(schema)) problems.push('@default([...]) en una lista (SQLite no lo soporta en Json)');
if (/@db\./.test(schema)) problems.push('quedó algún @db.*');

if (problems.length) {
  console.error('gen-schema: el schema del backend usa cosas no soportadas en SQLite:');
  for (const p of problems) console.error('  - ' + p);
  process.exit(1);
}

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(
  OUT,
  '// GENERADO por desktop/scripts/gen-schema.js a partir de backend/prisma/schema.prisma.\n' +
    '// No editar a mano.\n\n' +
    schema,
);
console.log('gen-schema: escrito', path.relative(process.cwd(), OUT));
