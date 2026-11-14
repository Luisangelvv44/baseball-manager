require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// La versión desktop (desktop/) sustituye este archivo por uno que usa SQLite y
// pone isPostgres = false. Usarlo para opciones de Prisma que solo existen en
// Postgres (p. ej. `mode: 'insensitive'`).
prisma.isPostgres = true;

module.exports = prisma;
