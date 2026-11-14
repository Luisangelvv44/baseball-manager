// Proceso principal de Electron: levanta el backend Express (con SQLite) dentro de la
// app, sirve el frontend compilado desde el mismo servidor y abre la ventana.
const { app, BrowserWindow, dialog, shell } = require('electron');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const BACKEND_DIR = path.join(ROOT, 'app', 'backend');
const WEB_DIR = path.join(ROOT, 'app', 'web');
const MIGRATIONS_DIR = path.join(ROOT, 'migrations');
const { migrate } = require('./migrator');

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

async function runMigrations() {
  // Cliente aparte con una sola conexión: el migrador necesita que BEGIN/COMMIT y los
  // PRAGMA vayan por la misma conexión. El juego usa después su pool normal (con una
  // sola conexión una temporada tarda más del doble).
  const { PrismaClient } = require(path.join(ROOT, 'prisma-client'));
  const client = new PrismaClient({
    datasources: { db: { url: `${process.env.DATABASE_URL}?connection_limit=1` } },
  });
  try {
    // WAL queda guardado en el archivo; mejora las escrituras seguidas del juego.
    await client.$queryRawUnsafe('PRAGMA journal_mode = WAL;');
    return await migrate(client, {
      migrationsDir: MIGRATIONS_DIR,
      dbFile: DB_FILE,
      log: (msg) => console.log(msg),
    });
  } finally {
    await client.$disconnect();
  }
}

async function ensureDatabase(prisma) {
  // Crea las tablas en una partida nueva o aplica las migraciones pendientes.
  const result = await runMigrations();
  await prisma.$queryRawUnsafe('PRAGMA busy_timeout = 10000;');

  if (result.fresh) {
    // Partida nueva: sembrar la liga (lo mismo que POST /api/newgame).
    const { seed } = require(path.join(BACKEND_DIR, 'seeders', 'run.js'));
    await seed();
    return;
  }

  if (result.unknown.length > 0 && !SMOKE_DIR) {
    dialog.showMessageBoxSync({
      type: 'warning',
      title: 'Baseball Manager',
      message: 'Esta partida se abrió antes con una versión más nueva del juego.',
      detail:
        'Algunas pantallas podrían fallar con esta versión. Instala la versión más reciente.\n\n' +
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
    // En el .exe empaquetado Windows ya usa el icono del ejecutable; esto cubre `npm run dev`.
    icon: path.join(ROOT, 'build', 'icon.ico'),
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
