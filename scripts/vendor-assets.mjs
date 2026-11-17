import { readFile } from 'node:fs/promises';

// Dev and release must expose exactly the same ESM files and license notices.
export const vendorAssets = {
  'three.module.js': 'three/build/three.module.js',
  'THREE-LICENSE.txt': 'three/LICENSE',
  'capacitor-core.js': '@capacitor/core/dist/index.js',
  'CAPACITOR-LICENSE.txt': '@capacitor/core/LICENSE',
  'capacitor-preferences/index.js': '@capacitor/preferences/dist/esm/index.js',
  'capacitor-preferences/web.js': '@capacitor/preferences/dist/esm/web.js',
  'capacitor-preferences/definitions.js': '@capacitor/preferences/dist/esm/definitions.js',
  'PREFERENCES-LICENSE.txt': '@capacitor/preferences/LICENSE',
  'capacitor-haptics/index.js': '@capacitor/haptics/dist/esm/index.js',
  'capacitor-haptics/web.js': '@capacitor/haptics/dist/esm/web.js',
  'capacitor-haptics/definitions.js': '@capacitor/haptics/dist/esm/definitions.js',
  'HAPTICS-LICENSE.txt': '@capacitor/haptics/LICENSE',
  'ADMOB-LICENSE.txt': '@capacitor-community/admob/LICENSE'
};

function rewriteExtensionlessRelativeImports(source) {
  return source.replace(
    /((?:from|import)\s*['"])(\.\.?\/[^'"]+?)(['"])/g,
    (_, prefix, specifier, suffix) => (specifier.endsWith('.js') ? `${prefix}${specifier}${suffix}` : `${prefix}${specifier}.js${suffix}`)
  );
}

export async function readVendorAsset(root, asset) {
  const content = await readFile(new URL('../node_modules/' + vendorAssets[asset], root));
  if (
    !asset.startsWith('capacitor-preferences/') &&
    !asset.startsWith('capacitor-haptics/') &&
    !asset.startsWith('capacitor-community-admob/')
  ) {
    return content;
  }
  // Package ESM uses extensionless imports; native browser ESM requires .js.
  return Buffer.from(rewriteExtensionlessRelativeImports(content.toString('utf8')));
}
