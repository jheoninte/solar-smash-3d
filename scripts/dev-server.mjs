import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readVendorAsset, vendorAssets } from './vendor-assets.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const entryFile = path.join(rootDir, 'web-prototype', 'index.html');
const args = process.argv.slice(2);
const portIndex = args.indexOf('--port');
const port = Number(process.env.PORT || (portIndex >= 0 ? args[portIndex + 1] : 4173));
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.md': 'text/markdown; charset=utf-8'
};

function resolveTarget(urlPath) {
  urlPath = decodeURIComponent(new URL(urlPath, 'http://localhost').pathname);
  if (urlPath === '/' || urlPath === '/index.html') return entryFile;
  if (urlPath === '/vendor/three.module.js') return path.join(rootDir, 'node_modules/three/build/three.module.js');
  const safePath = path.normalize(urlPath.replace(/^\/+/, ''));
  const target = path.resolve(rootDir, safePath);
  if (!target.startsWith(rootDir + path.sep)) throw new Error('Invalid path');
  return target;
}

createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url || '/', 'http://localhost').pathname;
    const asset = pathname.startsWith('/vendor/') ? pathname.slice('/vendor/'.length) : null;
    if (asset && Object.hasOwn(vendorAssets, asset)) {
      res.writeHead(200, { 'Content-Type': mime[path.extname(asset)] || 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(await readVendorAsset(import.meta.url, asset));
      return;
    }
    const target = resolveTarget(req.url || '/');
    const info = await stat(target);
    const filePath = info.isDirectory() ? path.join(target, 'index.html') : target;
    const body = await readFile(filePath);
    res.writeHead(200, {
      'Content-Type': mime[path.extname(filePath)] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  }
}).listen(port, '127.0.0.1', () => {
  console.log(`Solar Smash 3D dev server: http://127.0.0.1:${port}`);
  console.log('Serving web-prototype/index.html at the root path.');
});
