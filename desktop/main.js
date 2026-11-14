// Proceso principal de Electron: levanta el backend Express (con SQLite) dentro de la
// app, sirve el frontend compilado desde el mismo servidor y abre la ventana.
const { app, BrowserWindow, dialog, shell } = require('electron');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const BACKEND_DIR = path.join(ROOT, 'app', 'backend');
const WEB_DIR = path.join(ROOT, 'app', 'web');
const INIT_SQL = path.join(ROOT, 'prisma', 'init.sql');
const SCHEMA_HASH_FILE = path.join(ROOT, 'prisma', 'schema.hash');

app.setName('Baseball Manager');

// Prueba de arranque sin ventana: BM_SMOKE_DIR=<carpeta> usa esa carpeta como datos,
// levanta el servidor, consulta la API y sale (código 0 si todo respondió).
const SMOKE_DIR = process.env.BM_SMOKE_DIR;
if (SMOKE_DIR) app.setPath('userData', SMOKE_DIR);

// Debe ir antes de 'ready' para que userData quede en %APPDATA%\Baseball Manager.
const USER_DATA = app.getPath('userData');
const DB_FILE = path.join(USER_DATA, 'save.db');

function configureEnv() {
  fs.mkdirSync(USER_DATA, { recursive: true });

  // Clave opcional de OpenRouter u otras variables: %APPDATA%\Baseball Manager\.env
  const userEnv = path.join(USER_DATA, '.env');
  if (fs.existsSync(userEnv)) {
    require('dotenv').config({ path: userEnv });
  }

  process.env.DATABASE_URL = `file:${DB_FILE.replace(/\\/g, '/')}`;
  process.env.DB_PROVIDER = 'sqlite';
  process.env.NODE_ENV = process.env.NODE_ENV || 'production';
}

function readSchemaHash() {
  try {
    return fs.readFileSync(SCHEMA_HASH_FILE, 'utf8').trim();
  } catch {
    return 'unknown';
  }
}

async function ensureDatabase(prisma) {
  // Ajustes para que SQLite aguante bien varias escrituras seguidas.
  await prisma.$queryRawUnsafe('PRAGMA journal_mode = WAL;');
  await prisma.$queryRawUnsafe('PRAGMA busy_timeout = 10000;');

  const tables = await prisma.$queryRawUnsafe(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = '_desktop_meta'",
  );
  const currentHash = readSchemaHash();

  if (tables.length === 0) {
    // Partida nueva: crear tablas y sembrar la liga (lo mismo que POST /api/newgame).
    const sql = fs.readFileSync(INIT_SQL, 'utf8');
    const statements = sql
      .split(/;\s*(?:\r?\n|$)/)
      .map((s) => s.replace(/^\s*--.*$/gm, '').trim())
      .filter(Boolean);
    for (const stmt of statements) {
      await prisma.$executeRawUnsafe(stmt);
    }
    await prisma.$executeRawUnsafe('CREATE TABLE "_desktop_meta" ("key" TEXT PRIMARY KEY, "value" TEXT)');
    await prisma.$executeRawUnsafe(
      'INSERT INTO "_desktop_meta" ("key", "value") VALUES (?, ?)',
      'schema_hash',
      currentHash,
    );

    const { seed } = require(path.join(BACKEND_DIR, 'seeders', 'run.js'));
    await seed();
    return;
  }

  const rows = await prisma.$queryRawUnsafe(
    'SELECT "value" FROM "_desktop_meta" WHERE "key" = ?',
    'schema_hash',
  );
  const savedHash = rows[0]?.value;
  if (savedHash !== currentHash) {
    dialog.showMessageBoxSync({
      type: 'warning',
      title: 'Baseball Manager',
      message: 'Esta partida se creó con otra versión del juego.',
      detail:
        'La base de datos puede no coincidir con esta versión y algunas pantallas podrían fallar.\n\n' +
        `Partida: ${DB_FILE}`,
    });
  }
}

function startServer() {
  const express = require('express');
  const backendApp = require(path.join(BACKEND_DIR, 'index.js'));

  backendApp.use(express.static(WEB_DIR));
  // BrowserRouter: cualquier ruta que no sea /api devuelve index.html.
  backendApp.get(/^(?!\/api\/).*/, (req, res) => {
    res.sendFile(path.join(WEB_DIR, 'index.html'));
  });

  return new Promise((resolve, reject) => {
    const server = backendApp.listen(0, '127.0.0.1', () => resolve(server.address().port));
    server.on('error', reject);
  });
}

function createWindow(port) {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'Baseball Manager',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Enlaces externos en el navegador del sistema, no dentro de la app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(`http://127.0.0.1:${port}`)) shell.openExternal(url);
    return { action: 'deny' };
  });

  win.loadURL(`http://127.0.0.1:${port}/`);
}

async function runSmoke(port) {
  let failed = false;
  for (const p of ['/api/health', '/api/teams/user', '/api/finances', '/', '/roster']) {
    const res = await fetch(`http://127.0.0.1:${port}${p}`);
    console.log(`smoke ${res.status} ${p}`);
    if (!res.ok) failed = true;
  }
  app.exit(failed ? 1 : 0);
}

app.whenReady().then(async () => {
  try {
    configureEnv();
    const prisma = require(path.join(BACKEND_DIR, 'db', 'prisma.js'));
    await ensureDatabase(prisma);
    const port = await startServer();
    if (SMOKE_DIR) {
      await runSmoke(port);
      return;
    }
    createWindow(port);
  } catch (err) {
    console.error(err);
    dialog.showErrorBox('Baseball Manager', `No se pudo iniciar el juego:\n\n${err.stack || err}`);
    app.quit();
  }
});

app.on('window-all-closed', async () => {
  try {
    const prisma = require(path.join(BACKEND_DIR, 'db', 'prisma.js'));
    await prisma.$disconnect();
  } catch {
    // nada
  }
  app.quit();
});
