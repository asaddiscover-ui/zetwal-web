#!/usr/bin/env node
/* Zero-dependency static dev server for the Zetwal scroll-film site.
 *
 *   node server.js [port]
 *
 * Why not `npx serve`: this project loads 301 JPEG frames on every page load,
 * so the cache policy matters more than usual. HTML is always revalidated (your
 * edits show on reload) while the frame sequence is cached hard (reloads stay
 * fast instead of re-fetching 20MB). Also supports Range requests so the .mp4
 * masters can be scrubbed directly in the browser. */
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PORT = Number(process.argv[2]) || 3000;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.png': 'image/png', '.webp': 'image/webp',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.mp4': 'video/mp4', '.webm': 'video/webm',
  '.woff2': 'font/woff2', '.woff': 'font/woff',
  '.txt': 'text/plain; charset=utf-8',
};

const server = http.createServer((req, res) => {
  // WHATWG URL, not url.parse() — Node 24 deprecates the latter (DEP0169)
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch { res.writeHead(400).end('Bad request'); return; }

  if (pathname.endsWith('/')) pathname += 'index.html';

  // resolve inside ROOT only — never serve outside the project
  const full = path.resolve(ROOT, '.' + pathname);
  if (full !== ROOT && !full.startsWith(ROOT + path.sep)) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  fs.stat(full, (err, st) => {
    if (err || !st.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 ' + pathname);
      console.log(`  404  ${pathname}`);
      return;
    }

    const ext = path.extname(full).toLowerCase();
    const type = TYPES[ext] || 'application/octet-stream';

    // HTML always revalidates so edits appear on reload; static media caches hard
    const cache = (ext === '.html')
      ? 'no-cache, must-revalidate'
      : 'public, max-age=3600';

    const headers = {
      'Content-Type': type,
      'Cache-Control': cache,
      'Last-Modified': st.mtime.toUTCString(),
      'Accept-Ranges': 'bytes',
    };

    // Range support — lets the .mp4 masters be scrubbed in a browser tab
    const range = req.headers.range;
    if (range) {
      const m = /bytes=(\d*)-(\d*)/.exec(range);
      if (m) {
        const start = m[1] ? parseInt(m[1], 10) : 0;
        const end = m[2] ? parseInt(m[2], 10) : st.size - 1;
        if (start >= st.size || end >= st.size || start > end) {
          res.writeHead(416, { 'Content-Range': `bytes */${st.size}` }).end();
          return;
        }
        headers['Content-Range'] = `bytes ${start}-${end}/${st.size}`;
        headers['Content-Length'] = end - start + 1;
        res.writeHead(206, headers);
        if (req.method === 'HEAD') return res.end();
        fs.createReadStream(full, { start, end }).pipe(res);
        return;
      }
    }

    // conditional GET — a 304 on 301 frames is much cheaper than resending them
    if (req.headers['if-modified-since']) {
      const since = new Date(req.headers['if-modified-since']);
      if (!isNaN(since) && st.mtime.getTime() - since.getTime() < 1000) {
        res.writeHead(304, { 'Cache-Control': cache }).end();
        return;
      }
    }

    headers['Content-Length'] = st.size;
    res.writeHead(200, headers);
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(full).pipe(res);
  });
});

server.on('error', e => {
  if (e.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Try: node server.js ${PORT + 1}`);
    process.exit(1);
  }
  throw e;
});

server.listen(PORT, () => {
  const frames = path.join(ROOT, 'zetwal-film', 'frames');
  let n = 0;
  try { n = fs.readdirSync(frames).filter(f => f.endsWith('.jpg')).length; } catch {}
  console.log(`Zetwal dev server  →  http://localhost:${PORT}`);
  console.log(`serving ${ROOT}`);
  console.log(n ? `film: ${n} frames ready` : `WARNING: no frames found at zetwal-film/frames`);
});
