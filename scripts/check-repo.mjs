import { access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const required = [
  'README.md',
  'AGENTS.md',
  'CLAUDE.md',
  'docs/GAME_DESIGN_SPEC.md',
  'docs/PROGRESSION_PLAN.md',
  'docs/SAVE_SCHEMA.json',
  'docs/NATIVE_HANDOFF.md',
  'docs/GEMINI_PLATFORM_PROMPT.md',
  'docs/GEMINI_MOBILE_PROMPT.md',
  'docs/GEMINI_MONETIZATION_PROMPT.md',
  'docs/MONETIZATION_PLAN.md',
  'docs/MISSION_REPLAY_PLAN.md',
  'docs/BALANCE_PLAN.md',
  'docs/BALANCE_CANDIDATE.json',
  'docs/BALANCE_AUDIT.md',
  'docs/GEMINI_BALANCE_PROMPT.md',
  'docs/GEMINI_MOBILE_EXPERIENCE_PROMPT.md',
  'scripts/audit-balance.mjs',
  'docs/GEMINI_MISSION_REPLAY_PROMPT.md',
  'tests/mission-replay.test.mjs',
  'src/game/monetization/config.js',
  'src/game/monetization/AdPolicy.js',
  'src/game/monetization/MonetizationController.js',
  'src/platform/monetization.js',
  'src/platform/storekit2.js',
  'src/platform/admob.js',
  'scripts/patch-admob-ios.mjs',
  'tests/native-monetization.test.mjs',
  'tests/monetization.test.mjs',
  'docs/GEMINI_NATIVE_MONETIZATION_PROMPT.md',
  'capacitor.config.json',
  'scripts/check-native.mjs',
  'scripts/create-gemini-handoff.mjs',
  'godot-project/README.md',
  'src/main.js',
  'src/game/weapons/AutoFireController.js',
  'src/game/shop/collection.js',
  'tests/mobile-experience.test.mjs',
  'src/game/missions/definitions.js',
  'src/game/missions/MissionSystem.js',
  'src/game/shop/definitions.js',
  'src/game/shop/ShopSystem.js',
  'src/platform/index.js',
  'src/platform/storage.js',
  'src/platform/haptics.js',
  'src/input/GestureController.js',
  'src/settings/SettingsStore.js',
  'src/audio/AudioManager.js',
  'docs/MOBILE_CONTROLS.md',
  'docs/PLATFORM_SERVICES.md',
  'native/ios/PrivacyInfo.xcprivacy',
  'scripts/vendor-assets.mjs',
  'web-prototype/style.css',
  'web-prototype/index.html'
];

const missing = [];
for (const file of required) {
  try {
    await access(path.join(rootDir, file));
  } catch {
    missing.push(file);
  }
}

if (missing.length) {
  console.error('Missing required files:');
  for (const file of missing) console.error(`- ${file}`);
  process.exit(1);
}

console.log('Repository check passed.');
