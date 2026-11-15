// DUSTFALL II — a tiny static file server for local playtests (Node 22,
// standard library only). Serves game/ at / and screenshots/ at
// /screenshots/, with the right content types for ES modules. No
// directory listing, no caching headers that would hide a fresh edit.
//
//   node serve.ts            → http://localhost:8080
//   PORT=3000 node serve.ts  → http://localhost:3000

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const PORT = Number(process.env.PORT ?? 8080);

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
    let path = decodeURIComponent(url.pathname);
    if (path === '/') path = '/index.html';
    // Resolve inside game/ (or screenshots/ for /screenshots/*) and
    // refuse anything that climbs out of the entry directory.
    const root = path.startsWith('/screenshots/') ? join(here, 'screenshots') : join(here, 'game');
    const rel = path.startsWith('/screenshots/') ? path.slice('/screenshots/'.length) : path.slice(1);
    const file = normalize(join(root, rel));
    if (!file.startsWith(root)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }
    const bytes = await readFile(file);
    res.writeHead(200, {
      'content-type': TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream',
      'cache-control': 'no-store',
    });
    res.end(bytes);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
});

server.listen(PORT, () => {
  console.log(`DUSTFALL II serving game/ at http://localhost:${PORT}`);
});
