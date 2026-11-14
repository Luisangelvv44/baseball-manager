// Sustituye a backend/db/prisma.js dentro de desktop/app/backend (lo copia scripts/stage.js).
// Usa el cliente Prisma generado para SQLite en desktop/prisma-client.
// DATABASE_URL lo fija main.js antes de cargar el backend.
const path = require('path');
const { PrismaClient } = require(path.join(__dirname, '..', '..', '..', 'prisma-client'));

const prisma = new PrismaClient();

prisma.isPostgres = false;

module.exports = prisma;
