// Integration test for server.js: starts the real server on a free port, checks static serving,
// then plays a short online session with two real WebSocket clients. Exit code 0 = pass.
// Run directly (node tests/server-test.js) or through run-tests.js. Needs Node 22+ (global WebSocket).
'use strict';
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

if (typeof WebSocket === 'undefined') {
  console.log('skipped: this Node version has no built-in WebSocket client');
  process.exit(0);
}

const PORT = 20000 + Math.floor(Math.random() * 20000);
const server = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
  env: Object.assign({}, process.env, { PORT: String(PORT), HOST: '127.0.0.1' }),
  stdio: ['ignore', 'pipe', 'pipe'],
});
let out = '';
server.stdout.on('data', (d) => { out += d; });
server.stderr.on('data', (d) => { out += d; });

function fail(msg) {
  console.error('FAIL: ' + msg + '\n--- server output ---\n' + out);
  server.kill();
  process.exit(1);
}
const timer = setTimeout(() => fail('timeout'), 20000);

function get(p) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port: PORT, path: p }, (res) => {
      let body = '';
      res.on('data', (d) => { body += d; });
      res.on('end', () => resolve({ status: res.statusCode, type: res.headers['content-type'] || '', body }));
    }).on('error', reject);
  });
}

function client() {
  const sock = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
  const c = { sock, msgs: [], waiters: [] };
  sock.onmessage = (e) => {
    const m = JSON.parse(e.data);
    c.msgs.push(m);
    c.waiters = c.waiters.filter((w) => (w.pred(m) ? (w.resolve(m), false) : true));
  };
  c.send = (o) => sock.send(JSON.stringify(o));
  c.wait = (pred, what) => new Promise((resolve, reject) => {
    const found = c.msgs.find(pred);
    if (found) return resolve(found);
    c.waiters.push({ pred, resolve });
    setTimeout(() => reject(new Error('waiting for ' + what)), 5000);
  });
  c.open = new Promise((resolve, reject) => { sock.onopen = resolve; sock.onerror = () => reject(new Error('ws error')); });
  return c;
}

async function waitForServer() {
  for (let i = 0; i < 100; i++) {
    try {
      const r = await get('/health');
      if (r.status === 200) return;
    } catch (e) { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error('server did not start');
}

(async () => {
  await waitForServer();
  const index = await get('/');
  if (index.status !== 200 || !index.type.includes('text/html') || !index.body.includes('js/net.js')) fail('index.html not served');
  const js = await get('/js/sim.js');
  if (js.status !== 200 || !js.type.includes('javascript')) fail('js not served as javascript: ' + js.type);
  for (const p of ['/server.js', '/server/rooms.js', '/js/../server.js', '/%2e%2e/server.js', '/package.json', '/.git/config']) {
    const r = await get(p);
    if (r.status !== 404) fail('should not serve ' + p + ' (got ' + r.status + ')');
  }

  const A = client();
  const B = client();
  await Promise.all([A.open, B.open]);
  A.send({ t: 'create', v: 1, opts: { stageId: 'docks', winScore: 2 } });
  const created = await A.wait((m) => m.t === 'created', 'created');
  if (!/^\d{4}$/.test(created.code)) fail('bad code ' + created.code);
  B.send({ t: 'join', v: 1, code: created.code });
  const sa = await A.wait((m) => m.t === 'start', 'start A');
  const sb = await B.wait((m) => m.t === 'start', 'start B');
  if (sa.you !== 0 || sb.you !== 1 || sb.opts.stageId !== 'docks' || sb.opts.winScore !== 2) fail('start messages wrong');
  A.send({ t: 'in', b: 2, p: 0 }); // P1 holds right
  const t0 = Date.now();
  await new Promise((r) => setTimeout(r, 1000));
  const frames = B.msgs.filter((m) => m.t === 'f').reduce((n, m) => n + m.a.length, 0);
  const elapsed = (Date.now() - t0) / 1000;
  if (frames < 40 || frames > 80 * elapsed + 10) fail(`expected ~60 frames/s, got ${frames} in ${elapsed}s`);
  const sawRight = B.msgs.some((m) => m.t === 'f' && m.a.some((x) => (x[0] & 2) !== 0));
  if (!sawRight) fail('P1 input not relayed');
  A.send({ t: 'ping', c: 5 });
  await A.wait((m) => m.t === 'pong' && m.c === 5, 'pong');
  A.send({ t: 'leave' });
  await B.wait((m) => m.t === 'left', 'left');
  A.sock.close();
  B.sock.close();
  clearTimeout(timer);
  server.kill();
  console.log(`ok (${frames} frames in ${elapsed.toFixed(2)} s)`);
  process.exit(0);
})().catch((e) => fail(e.message));
