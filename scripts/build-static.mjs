import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distDir = path.join(rootDir, 'dist');
const copyTargets = ['web-prototype', 'docs', 'godot-project', 'README.md', 'AGENTS.md', 'CLAUDE.md'];

await rm(distDir, { recursive: true, force: true });
await mkdir(distDir, { recursive: true });

for (const target of copyTargets) {
  await cp(path.join(rootDir, target), path.join(distDir, target), { recursive: true });
}

await writeFile(
  path.join(distDir, 'index.html'),
  '<!doctype html><meta http-equiv="refresh" content="0; url=./web-prototype/index.html">',
  'utf8'
);

console.log(`Built static bundle in ${distDir}`);
