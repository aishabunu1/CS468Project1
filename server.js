// Speed-test server. Zero dependencies: only Node.js built-ins.
//   GET  /ping      -> tiny response, used by the browser to measure round-trip time
//   GET  /download  -> streams N random (incompressible) bytes; client aborts when it has a stable reading
//   POST /upload    -> reads and discards the body, replies with the byte count
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 8080;
const MAX_BYTES = 512 * 1024 * 1024;           // safety cap per download request
const BLOCK = crypto.randomBytes(1024 * 1024); // random data generated once and reused (cannot be compressed)
const NO_CACHE = { 'Cache-Control': 'no-store, no-cache, must-revalidate', 'Access-Control-Allow-Origin': '*' };

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');

  if (url.pathname === '/ping') {
    res.writeHead(200, { ...NO_CACHE, 'Content-Type': 'text/plain', 'Content-Length': 2 });
    return res.end('ok');
  }

  if (url.pathname === '/download') {
    const total = Math.min(parseInt(url.searchParams.get('bytes'), 10) || 0, MAX_BYTES);
    res.writeHead(200, { ...NO_CACHE, 'Content-Type': 'application/octet-stream', 'Content-Length': total });
    let sent = 0, closed = false;
    res.on('close', () => { closed = true; }); // client aborted: stop producing data
    (function pump() {
      while (!closed && sent < total) {
        const len = Math.min(BLOCK.length, total - sent);
        const ok = res.write(len === BLOCK.length ? BLOCK : BLOCK.subarray(0, len));
        sent += len;
        if (!ok) return res.once('drain', pump); // respect backpressure (do not buffer in memory)
      }
      if (!closed) res.end();
    })();
    return;
  }

  if (url.pathname === '/upload' && req.method === 'POST') {
    let received = 0;
    req.on('data', chunk => { received += chunk.length; });
    req.on('end', () => {
      res.writeHead(200, { ...NO_CACHE, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ received }));
    });
    return;
  }

  if (url.pathname === '/' || url.pathname === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return fs.createReadStream(path.join(__dirname, 'public', 'index.html')).pipe(res);
  }

  res.writeHead(404); res.end('Not found');
}).listen(PORT, '0.0.0.0', () => console.log(`Speed test running on http://localhost:${PORT}`));
