import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readVendorAsset, vendorAssets } from './vendor-assets.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distDir = path.join(rootDir, 'dist');
const copyTargets = ['web-prototype', 'src', 'docs', 'godot-project', 'README.md', 'AGENTS.md', 'CLAUDE.md'];

await rm(distDir, { recursive: true, force: true });
await mkdir(distDir, { recursive: true });

for (const target of copyTargets) {
  await cp(path.join(rootDir, target), path.join(distDir, target), { recursive: true });
}

await mkdir(path.join(distDir, 'vendor'), { recursive: true });
for (const asset of Object.keys(vendorAssets)) {
  const target = path.join(distDir, 'vendor', asset);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, await readVendorAsset(import.meta.url, asset));
}

// Capacitor injects its native bridge into this entry document. Avoid a redirect.
const entry = await readFile(path.join(rootDir, 'web-prototype/index.html'), 'utf8');
await writeFile(path.join(distDir, 'index.html'), entry
  .replaceAll('../vendor/', './vendor/')
  .replaceAll('../web-prototype/', './web-prototype/')
  .replaceAll('../src/', './src/'), 'utf8');

console.log(`Built static bundle in ${distDir}`);
