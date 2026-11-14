// Prepara desktop/app/ para Electron:
//   app/backend  ← copia de backend/ (sin node_modules, tests, .env, prisma) con
//                  db/prisma.js sustituido por db-override/prisma.js (SQLite)
//   app/web      ← build de frontend/ con VITE_API_URL=/api (mismo origen que la API)
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const REPO = path.join(ROOT, '..');
const APP = path.join(ROOT, 'app');
const BACKEND_SRC = path.join(REPO, 'backend');
const BACKEND_OUT = path.join(APP, 'backend');
const WEB_OUT = path.join(APP, 'web');

const SKIP = new Set(['node_modules', '__tests__', '.env', 'prisma', 'coverage']);

fs.rmSync(APP, { recursive: true, force: true });
fs.mkdirSync(APP, { recursive: true });

fs.cpSync(BACKEND_SRC, BACKEND_OUT, {
  recursive: true,
  filter: (src) => {
    const rel = path.relative(BACKEND_SRC, src);
    if (!rel) return true;
    const top = rel.split(path.sep)[0];
    if (SKIP.has(top)) return false;
    if (rel.split(path.sep).includes('__mocks__')) return false;
    return true;
  },
});
fs.copyFileSync(path.join(ROOT, 'db-override', 'prisma.js'), path.join(BACKEND_OUT, 'db', 'prisma.js'));
console.log('stage: backend copiado a app/backend (db/prisma.js → SQLite)');

execSync(`pnpm exec vite build --outDir "${WEB_OUT}" --emptyOutDir`, {
  cwd: path.join(REPO, 'frontend'),
  stdio: 'inherit',
  env: { ...process.env, VITE_API_URL: '/api' },
});
console.log('stage: frontend compilado en app/web');
