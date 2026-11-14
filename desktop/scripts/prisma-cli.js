// Ejecuta el CLI de Prisma de desktop/node_modules y devuelve { status, stdout, stderr }.
const { spawnSync } = require('child_process');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const BIN = path.join(ROOT, 'node_modules', '.bin', process.platform === 'win32' ? 'prisma.cmd' : 'prisma');

function prisma(args) {
  const res = spawnSync(BIN, args, {
    cwd: ROOT,
    encoding: 'utf8',
    shell: process.platform === 'win32',
    env: { ...process.env, PRISMA_HIDE_UPDATE_MESSAGE: '1' },
  });
  if (res.error) throw res.error;
  return res;
}

module.exports = { prisma, ROOT };
