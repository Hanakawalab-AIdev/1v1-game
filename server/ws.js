// ws.js — minimal WebSocket (RFC 6455) server side, built on Node's http module only.
// Supports text messages, ping/pong, close, fragmented messages. No extensions (no compression).
'use strict';
const crypto = require('crypto');

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const MAX_MESSAGE = 16 * 1024; // the game protocol only uses tiny JSON messages

function acceptKey(key) {
  return crypto.createHash('sha1').update(key + GUID).digest('base64');
}

// Encode one unmasked server→client frame.
function encodeFrame(opcode, payload) {
  const len = payload.length;
  let header;
  if (len < 126) {
    header = Buffer.alloc(2);
    header[1] = len;
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  header[0] = 0x80 | opcode;
  return Buffer.concat([header, payload]);
}

// Try to decode one frame from the start of buf. Returns null if incomplete,
// or { fin, opcode, payload, size, masked }. Throws on protocol errors.
function decodeFrame(buf) {
  if (buf.length < 2) return null;
  const fin = (buf[0] & 0x80) !== 0;
  if (buf[0] & 0x70) throw new Error('RSV bits set');
  const opcode = buf[0] & 0x0f;
  const masked = (buf[1] & 0x80) !== 0;
  let len = buf[1] & 0x7f;
  let off = 2;
  if (len === 126) {
    if (buf.length < 4) return null;
    len = buf.readUInt16BE(2);
    off = 4;
  } else if (len === 127) {
    if (buf.length < 10) return null;
    const big = buf.readBigUInt64BE(2);
    if (big > BigInt(MAX_MESSAGE)) throw new Error('frame too large');
    len = Number(big);
    off = 10;
  }
  if (len > MAX_MESSAGE) throw new Error('frame too large');
  const maskOff = off;
  if (masked) off += 4;
  if (buf.length < off + len) return null;
  const payload = Buffer.from(buf.subarray(off, off + len));
  if (masked) for (let i = 0; i < len; i++) payload[i] ^= buf[maskOff + (i & 3)];
  return { fin, opcode, payload, size: off + len, masked };
}

// Wrap an upgraded socket. Calls handlers.message(text), handlers.close().
function accept(req, socket, handlers) {
  const key = req.headers['sec-websocket-key'];
  if (!key || String(req.headers.upgrade).toLowerCase() !== 'websocket') {
    socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
    return null;
  }
  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
      'Upgrade: websocket\r\n' +
      'Connection: Upgrade\r\n' +
      'Sec-WebSocket-Accept: ' + acceptKey(key) + '\r\n\r\n'
  );
  socket.setNoDelay(true); // inputs are tiny and latency matters more than throughput
  let buf = Buffer.alloc(0);
  let parts = [];
  let partsLen = 0;
  let closed = false;

  const conn = {
    send(text) {
      if (closed) return;
      socket.write(encodeFrame(0x1, Buffer.from(text, 'utf8')));
    },
    close(code) {
      if (closed) return;
      closed = true;
      const b = Buffer.alloc(2);
      b.writeUInt16BE(code || 1000, 0);
      try { socket.write(encodeFrame(0x8, b)); } catch (e) { /* already gone */ }
      socket.end();
      handlers.close();
    },
    get closed() { return closed; },
  };

  const fail = () => {
    if (closed) return;
    closed = true;
    socket.destroy();
    handlers.close();
  };

  socket.on('data', (chunk) => {
    if (closed) return;
    buf = buf.length ? Buffer.concat([buf, chunk]) : chunk;
    if (buf.length > MAX_MESSAGE * 4) return fail();
    try {
      for (;;) {
        const f = decodeFrame(buf);
        if (!f) break;
        buf = buf.subarray(f.size);
        if (!f.masked) return fail(); // clients must mask
        if (f.opcode === 0x8) return conn.close(1000);
        if (f.opcode === 0x9) { socket.write(encodeFrame(0xa, f.payload)); continue; }
        if (f.opcode === 0xa) continue;
        if (f.opcode === 0x1 || f.opcode === 0x0) {
          parts.push(f.payload);
          partsLen += f.payload.length;
          if (partsLen > MAX_MESSAGE) return fail();
          if (f.fin) {
            const text = Buffer.concat(parts).toString('utf8');
            parts = [];
            partsLen = 0;
            handlers.message(text);
          }
          continue;
        }
        return fail(); // binary or unknown opcodes are not part of the game protocol
      }
    } catch (e) {
      fail();
    }
  });
  socket.on('error', fail);
  socket.on('close', () => { if (!closed) { closed = true; handlers.close(); } });
  return conn;
}

module.exports = { accept, encodeFrame, decodeFrame, acceptKey, MAX_MESSAGE };
