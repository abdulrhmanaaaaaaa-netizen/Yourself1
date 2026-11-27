import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, posix } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const port = Number(process.env.PORT || 3000);
const allowedFiles = new Set([
  'index.html',
  'style.css',
  'script.js',
  'config.js',
  'yourself-logo.jpg',
  'yourself-logo-mark.png',
  'manus-routes.json'
]);
const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.png': 'image/png'
};

function safeName(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0] || '/');
  if (decoded === '/' || decoded === '/index.html') return 'index.html';
  const relative = posix.normalize(decoded).replace(/^\/+/, '');
  if (!relative || relative.includes('..') || relative.includes('\\') || relative.includes('/')) return null;
  return relative;
}

const server = createServer(async (request, response) => {
  const name = safeName(request.url || '/');
  if (!name || !allowedFiles.has(name)) {
    response.writeHead(404, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'same-origin'
    });
    response.end('Not found');
    return;
  }
  try {
    const file = name === 'manus-routes.json' ? join(root, 'public', name) : join(root, name);
    const info = await stat(file);
    if (!info.isFile()) throw new Error('not_file');
    const body = await readFile(file);
    response.writeHead(200, {
      'Content-Type': contentTypes[extname(name)] || 'application/octet-stream',
      'Content-Length': body.byteLength,
      'Cache-Control': name === 'index.html' || name === 'config.js' ? 'no-store' : 'public, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'same-origin',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'
    });
    response.end(body);
  } catch {
    response.writeHead(500, {'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store'});
    response.end('Internal server error');
  }
});

server.listen(port, '0.0.0.0', () => {
  console.log(`Yourself preview listening on http://0.0.0.0:${port}`);
});
