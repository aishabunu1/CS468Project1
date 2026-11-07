// Speed-test server
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 8080;
const MAX_BYTES = 512 * 1024 * 1024;           
const BLOCK = crypto.randomBytes(1024 * 1024); 
const SAMPLE_MS = 50;                          
const uploads = new Map();                     
const nowMs = () => Number(process.hrtime.bigint()) / 1e6; 
const NO_CACHE = { 'Cache-Control': 'no-store, no-cache, must-revalidate' };

// One bad request must never take the whole server down.
process.on('uncaughtException', err => console.error('uncaught:', err.message));

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  req.on('error', () => {}); res.on('error', () => {}); 

  if (url.pathname === '/ping') {
    res.writeHead(200, { ...NO_CACHE, 'Content-Type': 'text/plain', 'Content-Length': 2 });
    return res.end('ok');
  }

  if (url.pathname === '/download') {
    const total = Math.min(parseInt(url.searchParams.get('bytes'), 10) || 0, MAX_BYTES);
    res.writeHead(200, { ...NO_CACHE, 'Content-Type': 'application/octet-stream', 'Content-Length': total });
    let sent = 0, closed = false;
    res.on('close', () => { closed = true; }); 
    (function pump() {
      while (!closed && sent < total) {
        const len = Math.min(BLOCK.length, total - sent);
        const ok = res.write(len === BLOCK.length ? BLOCK : BLOCK.subarray(0, len));
        sent += len;
        if (!ok) return res.once('drain', pump); 
      }
      if (!closed) res.end();
    })();
    return;
  }

  if (url.pathname === '/upload' && req.method === 'POST') {
    const id = url.searchParams.get('id') || 'anonymous';
    let rec = uploads.get(id);
    if (!rec) {                                  // first request of this test
      rec = { total: 0, samples: [], lastAt: 0, lastTotal: 0 };
      uploads.set(id, rec);
      setTimeout(() => uploads.delete(id), 60000); // forget the test after a minute
    }
    let received = 0;
    req.on('data', chunk => {
      received += chunk.length; rec.total += chunk.length;
      const now = nowMs();
      rec.lastAt = now; rec.lastTotal = rec.total;        // time of the most recent bytes
      if (rec.samples.length === 0 || now - rec.samples[rec.samples.length - 1][0] >= SAMPLE_MS) {
        rec.samples.push([now, rec.total]);
      }
    });
    req.on('end', () => {
      res.writeHead(200, { ...NO_CACHE, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ received }));
    });
    return;
  }

  if (url.pathname === '/upload-stats') {
    const rec = uploads.get(url.searchParams.get('id'));
    res.writeHead(200, { ...NO_CACHE, 'Content-Type': 'application/json' });
    if (!rec || rec.samples.length === 0) return res.end(JSON.stringify({ total: 0, samples: [] }));
    const t0 = rec.samples[0][0];
    const samples = rec.samples.map(([t, b]) => [t - t0, b]);  // time since the first byte arrived
    samples.push([rec.lastAt - t0, rec.lastTotal]);            // to make sure the very last bytes are included
    return res.end(JSON.stringify({ total: rec.total, samples }));
  }

  if (url.pathname === '/' || url.pathname === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return fs.createReadStream(path.join(__dirname, 'public', 'index.html')).pipe(res);
  }

  res.writeHead(404); res.end('Not found');
}).listen(PORT, '0.0.0.0', () => console.log(`Speed test running on http://localhost:${PORT}`));