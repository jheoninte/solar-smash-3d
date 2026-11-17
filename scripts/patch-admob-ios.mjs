import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const root = new URL('../', import.meta.url);
const overrides = new URL('native/ios/AdMobOverrides/', root);
const upstream = JSON.parse(await readFile(new URL('upstream.json', overrides), 'utf8'));
const installed = new URL('node_modules/@capacitor-community/admob/', root);
const pkg = JSON.parse(await readFile(new URL('package.json', installed), 'utf8'));
if (pkg.version !== upstream.version) throw Error('Review AdMob native overrides before upgrading the SDK.');
const normalize = (source) => source.replaceAll('\r\n', '\n');
// Validate every input before modifying anything. Re-running is safe.
const files = await Promise.all(Object.entries(upstream.sha256).map(async ([name, hash]) => {
  const target = new URL('ios/Sources/AdMobPlugin/' + name, installed);
  const before = normalize(await readFile(target, 'utf8'));
  const after = normalize(await readFile(new URL(name, overrides), 'utf8'));
  const digest = createHash('sha256').update(before).digest('hex');
  if (before !== after && digest !== hash) throw Error('Unexpected AdMob source: ' + name);
  return { target, after };
}));
if (!process.argv.includes('--check')) {
  for (const file of files) await writeFile(file.target, file.after);
} else {
  for (const file of files) {
    if (normalize(await readFile(file.target, 'utf8')) !== file.after) throw Error('AdMob override missing. Run npm run native:patch.');
  }
}
console.log('AdMob iOS presentation protocol v1 ' + (process.argv.includes('--check') ? 'verified.' : 'applied.'));
