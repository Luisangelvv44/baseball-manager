// Proxy de desarrollo sin dependencias: escucha en el puerto 80 y reparte por nombre de host.
//   http://baseball.localhost      -> frontend (Vite, 5173), incluido el WebSocket de HMR
//   http://api.baseball.localhost  -> backend (Express, 4000)
// Los navegadores resuelven *.localhost a este PC sin tocar el archivo hosts.
// Uso: node tools/dev-proxy.js   (PROXY_PORT para cambiar el puerto de escucha)
const http = require('http');
const net = require('net');

const LISTEN_PORT = Number(process.env.PROXY_PORT) || 80;
const TARGET_HOST = 'localhost';
const ROUTES = {
  'api.baseball.localhost': 4000,
  'baseball.localhost': 5173,
};

function targetPort(hostHeader) {
  const name = (hostHeader || '').split(':')[0].toLowerCase();
  return ROUTES[name] ?? null;
}

const server = http.createServer((req, res) => {
  const port = targetPort(req.headers.host);
  if (!port) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(`Host desconocido. Usa ${Object.keys(ROUTES).map((h) => `http://${h}`).join(' o ')}`);
    return;
  }
  const upstream = http.request(
    { host: TARGET_HOST, port, method: req.method, path: req.url, headers: req.headers },
    (upRes) => {
      res.writeHead(upRes.statusCode, upRes.headers);
      upRes.pipe(res);
    }
  );
  upstream.on('error', (err) => {
    if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(`No se pudo conectar con localhost:${port} (${err.code}). ¿Está arrancado ese servidor?`);
  });
  req.pipe(upstream);
});

// WebSocket (HMR de Vite): se reenvia la peticion de upgrade tal cual y se conectan los sockets.
server.on('upgrade', (req, socket, head) => {
  const port = targetPort(req.headers.host);
  if (!port) return socket.destroy();
  const upstream = net.connect(port, TARGET_HOST, () => {
    const headers = Object.entries(req.headers).map(([k, v]) => `${k}: ${v}`).join('\r\n');
    upstream.write(`${req.method} ${req.url} HTTP/${req.httpVersion}\r\n${headers}\r\n\r\n`);
    if (head?.length) upstream.write(head);
    upstream.pipe(socket);
    socket.pipe(upstream);
  });
  upstream.on('error', () => socket.destroy());
  socket.on('error', () => upstream.destroy());
});

server.listen(LISTEN_PORT, () => {
  console.log(`Proxy en el puerto ${LISTEN_PORT}:`);
  for (const [host, port] of Object.entries(ROUTES)) console.log(`  http://${host} -> localhost:${port}`);
});
