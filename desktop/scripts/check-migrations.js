// Falla el build si el schema del backend cambió y falta la migración desktop.
// Compara desktop/prisma/schema.prisma (recién generado) con migrations/_snapshot.prisma.
const fs = require('fs');
const path = require('path');
const { prisma, ROOT } = require('./prisma-cli');

const SNAPSHOT = path.join(ROOT, 'migrations', '_snapshot.prisma');
const SCHEMA = path.join(ROOT, 'prisma', 'schema.prisma');

if (!fs.existsSync(SNAPSHOT)) {
  console.error('check-migrations: no hay migraciones. Crea la inicial con: npm run migration:new -- init');
  process.exit(1);
}

const res = prisma([
  'migrate', 'diff',
  '--from-schema-datamodel', SNAPSHOT,
  '--to-schema-datamodel', SCHEMA,
  '--exit-code',
]);

if (res.status === 0) {
  console.log('check-migrations: las migraciones desktop están al día.');
} else if (res.status === 2) {
  console.error(
    'check-migrations: el schema del backend cambió y no hay migración desktop para ello.\n' +
      'Crea una con: npm run migration:new -- <nombre>   (desde desktop/)',
  );
  process.exit(1);
} else {
  console.error(res.stderr || res.stdout);
  process.exit(1);
}
