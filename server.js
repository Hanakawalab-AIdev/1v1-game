// server.js — Stomp Duel game server: serves the game and runs online rooms.
// No packages needed: Node.js 18+ only.
//
//   node server.js              → http://localhost:8123 (also reachable from other devices on your network)
//   PORT=3000 node server.js    → custom port (hosting services set PORT for you)
'use strict';
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const ws = require('./server/ws.js');
const { Rooms } = require('./server/rooms.js');

const PORT = Number(process.env.PORT) || 8123;
const HOST = process.env.HOST || '0.0.0.0';
const ROOT = __dirname;
const MAX_CONNECTIONS = 1000;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

// Only the game itself is served (never server code, tests or .git).
function resolveStatic(urlPath) {
  let p;
  try {
    p = decodeURIComponent(urlPath.split('?')[0]);
  } catch (e) {
    return null;
  }
  if (p === '/' || p === '/index.html') return path.join(ROOT, 'index.html');
  if (/^\/js\/[a-z0-9_-]+\.js$/i.test(p)) return path.join(ROOT, 'js', path.basename(p));
  return null;
}

function lanAddresses() {
  const out = [];
  const ifs = os.networkInterfaces();
  for (const name of Object.keys(ifs)) {
    for (const a of ifs[name] || []) {
      if ((a.family === 'IPv4' || a.family === 4) && !a.internal) out.push(a.address);
    }
  }
  return out;
}

const ips = lanAddresses();
const rooms = new Rooms({ ips, port: PORT });
let connections = 0;

const server = http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405);
    return res.end();
  }
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    return res.end('ok');
  }
  const file = resolveStatic(req.url);
  if (!file) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    return res.end('Not found');
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('Not found');
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(req.method === 'HEAD' ? undefined : data);
  });
});

server.on('upgrade', (req, socket) => {
  if (req.url.split('?')[0] !== '/ws' || connections >= MAX_CONNECTIONS) {
    socket.end('HTTP/1.1 404 Not Found\r\n\r\n');
    return;
  }
  let client = null;
  const conn = ws.accept(req, socket, {
    message(text) {
      let msg;
      try {
        msg = JSON.parse(text);
      } catch (e) {
        return;
      }
      rooms.message(client, msg, now());
    },
    close() {
      connections--;
      if (client) rooms.disconnect(client);
    },
  });
  if (!conn) return;
  connections++;
  client = rooms.connect({ send: (obj) => conn.send(JSON.stringify(obj)), close: () => conn.close(1008) });
});

// The match clock. setInterval alone is too coarse on some systems (Windows ~15.6 ms), so the
// rooms catch up to wall-clock time on every wake-up; each room steps exactly 60 ticks per second.
const t0 = process.hrtime.bigint();
function now() {
  return Number(process.hrtime.bigint() - t0) / 1e6;
}
setInterval(() => rooms.update(now()), 4);

server.listen(PORT, HOST, () => {
  console.log('Stomp Duel server running.');
  console.log(`  This computer:   http://localhost:${PORT}`);
  for (const ip of ips) console.log(`  Other devices:   http://${ip}:${PORT}`);
  console.log('Press Ctrl+C to stop.');
});
