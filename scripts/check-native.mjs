import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { vendorAssets } from './vendor-assets.mjs';
import { execFileSync } from 'node:child_process';

execFileSync(process.execPath, [fileURLToPath(new URL('./patch-admob-ios.mjs', import.meta.url)), '--check'], { stdio: 'inherit' });

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(await readFile(path.join(root, 'capacitor.config.json'), 'utf8'));
const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
assert.equal(config.webDir, 'dist');
assert.match(config.appId, /^[a-zA-Z][\w]*(\.[a-zA-Z][\w]*){2,}$/);
assert.equal(config.server, undefined, 'Native builds must load bundled assets, not a development server.');
const version = pkg.dependencies['@capacitor/core'];
assert.match(version, /^\d+\.\d+\.\d+$/);
assert.equal(pkg.dependencies['@capacitor/ios'], version);
assert.equal(pkg.devDependencies['@capacitor/cli'], version);
assert.match(pkg.dependencies['@capacitor/preferences'], /^8\.\d+\.\d+$/);
assert.match(pkg.dependencies['@capacitor/haptics'], /^8\.\d+\.\d+$/);
assert.match(pkg.dependencies['@capacitor-community/admob'], /^8\.\d+\.\d+$/);
assert.equal(pkg.dependencies['@capacitor-community/admob'], '8.3.0');
assert.equal(pkg.dependencies['solar-smash-store-kit'], 'file:native/ios/SolarSmashStoreKit');

const dist = path.join(root, config.webDir);
const html = await readFile(path.join(dist, 'index.html'), 'utf8');
assert.match(html, /<head[\s>]/i, 'Capacitor needs a complete entry document.');
assert.match(html, /id="c"/);
assert.doesNotMatch(html, /http-equiv="refresh"/i);
assert.doesNotMatch(html, /(?:src|href)=["'](?:https?:)?\/\//i);
const refs = [...html.matchAll(/(?:src|href)=["']([^"']+)["']/g)].map((match) => match[1]);
const imports = JSON.parse(html.match(/<script type="importmap">\s*([\s\S]*?)\s*<\/script>/)[1]);
refs.push(...Object.values(imports.imports), 'docs/SAVE_SCHEMA.json', 'vendor/THREE-LICENSE.txt');
refs.push(...Object.keys(vendorAssets).map((asset) => 'vendor/' + asset));
for (const ref of refs) {
  const target = path.resolve(dist, ref);
  assert.ok(target.startsWith(dist + path.sep), 'Asset escapes dist: ' + ref);
  await access(target);
}

const nativeFiles = [
  'native/ios/PrivacyInfo.xcprivacy',
  'native/ios/SolarSmashStoreKit/package.json',
  'native/ios/SolarSmashStoreKit/Package.swift',
  'native/ios/SolarSmashStoreKit/SolarSmashStoreKit.podspec',
  'native/ios/SolarSmashStoreKit/Sources/SolarSmashStoreKitPlugin/StoreKit2Plugin.swift',
  'native/ios/SolarSmashStoreKit/Sources/SolarSmashStoreKitPlugin/StoreKit2Manager.swift'
];
for (const rel of nativeFiles) {
  await access(path.join(root, rel));
}

console.log('Native web bundle check passed: complete entry, local assets, matching Capacitor versions, iOS StoreKit 2 package files.');
if (config.appId === 'dev.solarsmash.prototype') {
  console.log('Development app ID in use. Choose the final bundle ID before creating the Xcode project.');
}
console.log('Xcode, iPhone, native storage, purchases and ads have not been validated by this check.');
