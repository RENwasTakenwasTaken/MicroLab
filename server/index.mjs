// Virtual MCU Lab build server.
//   GET  /api/toolchains        -> detected compilers
//   POST /api/compile           -> { target: 'pic18f4550' | '8051', source, options }
// With --serve-dist it also serves the production frontend from ./dist.

import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compile8051, compilePic18, toolchainInfo } from './compilers/toolchains.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT ?? (process.argv.includes('--serve-dist') || process.env.SERVE_DIST === '1' ? 8080 : 5174));
const serveDist = process.argv.includes('--serve-dist') || process.env.SERVE_DIST === '1';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.ttf': 'font/ttf', '.woff2': 'font/woff2' };

let info = null;
const getInfo = async () => (info ??= await toolchainInfo());

// Builds are CPU-heavy (XC8 takes several seconds); serialise them.
let queue = Promise.resolve();
const enqueue = (fn) => { const p = queue.then(fn, fn); queue = p.catch(() => {}); return p; };

function send(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(data);
}

async function readBody(req, limit = 512 * 1024) {
  let size = 0;
  const chunks = [];
  for await (const c of req) {
    size += c.length;
    if (size > limit) throw new Error('request too large');
    chunks.push(c);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname === '/api/toolchains') return send(res, 200, await getInfo());
    if (url.pathname === '/api/compile' && req.method === 'POST') {
      const body = await readBody(req);
      if (typeof body.source !== 'string') return send(res, 400, { error: 'source missing' });
      const tc = await getInfo();
      const result = await enqueue(() =>
        body.target === '8051'
          ? compile8051(body.source, { ...body.options, sdccVersion: tc.sdcc?.version })
          : compilePic18(body.source, body.options ?? {}),
      );
      return send(res, 200, result);
    }
    if (serveDist && req.method === 'GET') {
      const dist = path.join(root, 'dist');
      let file = path.normalize(path.join(dist, decodeURIComponent(url.pathname)));
      if (!file.startsWith(dist)) return send(res, 403, { error: 'forbidden' });
      if (!existsSync(file) || statSync(file).isDirectory()) file = path.join(dist, 'index.html');
      res.writeHead(200, { 'content-type': MIME[path.extname(file)] ?? 'application/octet-stream' });
      return res.end(readFileSync(file));
    }
    send(res, 404, { error: 'not found' });
  } catch (e) {
    send(res, 500, { error: String(e?.message ?? e) });
  }
});

server.listen(PORT, async () => {
  const tc = await getInfo();
  console.log(`[vlab] build server on http://localhost:${PORT}`);
  console.log(`[vlab] XC8 : ${tc.xc8 ? `${tc.xc8.version}  (${tc.xc8.path})` : 'NOT FOUND'}`);
  console.log(`[vlab] SDCC: ${tc.sdcc ? `${tc.sdcc.version}  (${tc.sdcc.path})` : 'NOT FOUND'}`);
});
