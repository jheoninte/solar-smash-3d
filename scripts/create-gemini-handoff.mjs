import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tasks = {
  'mobile-experience': {
    prompt: 'docs/GEMINI_MOBILE_EXPERIENCE_PROMPT.md', output: 'GEMINI_MOBILE_EXPERIENCE_TASK.txt',
    files: [
      'AGENTS.md', 'package.json', 'docs/MOBILE_CONTROLS.md', 'docs/SAVE_SCHEMA.json',
      'src/main.js', 'src/game/Loop.js', 'src/game/state.js',
      'src/game/weapons/AutoFireController.js', 'src/game/weapons/definitions.js',
      'src/game/weapons/WeaponSystem.js', 'src/game/destruction/DestructionEventBus.js',
      'src/game/destruction/TerrainSurface.js', 'src/game/destruction/ImpactEffects.js',
      'src/game/modes/BodyMode.js', 'src/game/modes/PlanetMode.js', 'src/game/modes/SolarMode.js',
      'src/render/WebGLApp.js', 'src/render/CameraController.js', 'src/input/GestureController.js',
      'src/game/missions/definitions.js', 'src/game/missions/MissionSystem.js',
      'src/game/shop/definitions.js', 'src/game/shop/collection.js',
      'src/ui/UIManager.js', 'web-prototype/index.html', 'web-prototype/style.css',
      'tests/mobile-experience.test.mjs', 'tests/mission-replay.test.mjs'
    ]
  },
  balance: {
    prompt: 'docs/GEMINI_BALANCE_PROMPT.md', output: 'GEMINI_BALANCE_TASK.txt',
    files: [
      'AGENTS.md', 'package.json', 'docs/BALANCE_PLAN.md', 'docs/BALANCE_CANDIDATE.json',
      'docs/BALANCE_AUDIT.md', 'scripts/audit-balance.mjs', 'docs/SAVE_SCHEMA.json',
      'src/main.js', 'src/game/state.js', 'src/platform/storage.js', 'src/game/Loop.js',
      'src/game/missions/definitions.js', 'src/game/missions/MissionSystem.js',
      'src/game/weapons/definitions.js', 'src/game/weapons/WeaponSystem.js',
      'src/game/shop/definitions.js', 'src/game/shop/ShopSystem.js',
      'src/game/modes/BodyMode.js', 'src/game/modes/SolarMode.js',
      'src/settings/SettingsStore.js', 'src/game/monetization/config.js',
      'src/game/monetization/AdPolicy.js', 'src/game/monetization/MonetizationController.js',
      'src/ui/UIManager.js', 'web-prototype/index.html', 'web-prototype/style.css',
      'tests/monetization.test.mjs', 'tests/mission-replay.test.mjs'
    ]
  },
  'mission-replay': {
    prompt: 'docs/GEMINI_MISSION_REPLAY_PROMPT.md', output: 'GEMINI_MISSION_REPLAY_TASK.txt',
    files: [
      'AGENTS.md', 'package.json', 'docs/MISSION_REPLAY_PLAN.md', 'docs/SAVE_SCHEMA.json',
      'src/main.js', 'src/game/state.js', 'src/platform/storage.js', 'src/game/Loop.js',
      'src/game/missions/definitions.js', 'src/game/missions/MissionSystem.js',
      'src/game/weapons/definitions.js', 'src/game/weapons/WeaponSystem.js',
      'src/game/shop/definitions.js', 'src/settings/SettingsStore.js',
      'src/game/monetization/config.js', 'src/game/monetization/AdPolicy.js',
      'src/game/monetization/MonetizationController.js',
      'src/ui/UIManager.js', 'web-prototype/index.html', 'web-prototype/style.css',
      'tests/monetization.test.mjs', 'tests/mission-replay.test.mjs'
    ]
  },
  'native-review': { prompt: 'docs/GEMINI_NATIVE_REVIEW_PROMPT.md', output: 'GEMINI_NATIVE_REVIEW_TASK.txt' },
  'native-monetization': { prompt: 'docs/GEMINI_NATIVE_MONETIZATION_PROMPT.md', output: 'GEMINI_NATIVE_MONETIZATION_TASK.txt' },
  monetization: { prompt: 'docs/GEMINI_MONETIZATION_PROMPT.md', output: 'GEMINI_MONETIZATION_TASK.txt' },
  mobile: { prompt: 'docs/GEMINI_MOBILE_PROMPT.md', output: 'GEMINI_MOBILE_TASK.txt' },
  platform: { prompt: 'docs/GEMINI_PLATFORM_PROMPT.md', output: 'GEMINI_PLATFORM_TASK.txt' }
};
const args = process.argv.slice(2);
const taskIndex = args.indexOf('--task');
const taskName = taskIndex === -1 ? 'mobile-experience' : args[taskIndex + 1];
const task = Object.hasOwn(tasks, taskName) ? tasks[taskName] : null;
if (!task) throw new Error('Unknown task. Use --task mobile-experience, balance, mission-replay, native-review, native-monetization, monetization, mobile or platform.');
// Explicit source allowlist: never include local saves, credentials or dependencies.
const files = task.files ? [...task.files] : [
  'AGENTS.md', 'package.json', 'capacitor.config.json', 'docs/SAVE_SCHEMA.json',
  'scripts/dev-server.mjs', 'scripts/build-static.mjs', 'scripts/check-native.mjs',
  'scripts/vendor-assets.mjs', 'src/platform/index.js', 'src/platform/storage.js',
  'docs/PLATFORM_SERVICES.md',
  'src/main.js', 'src/game/state.js', 'src/game/Loop.js',
  'src/game/shop/ShopSystem.js', 'src/game/shop/definitions.js',
  'src/game/missions/MissionSystem.js', 'src/game/missions/definitions.js',
  'src/game/destruction/DestructionEventBus.js', 'src/game/weapons/WeaponSystem.js',
  'src/game/weapons/definitions.js', 'src/game/modes/BodyMode.js',
  'src/game/modes/PlanetMode.js', 'src/game/modes/SolarMode.js',
  'src/ui/UIManager.js', 'web-prototype/index.html', 'web-prototype/style.css'
];
if (['mobile', 'monetization', 'native-monetization', 'native-review'].includes(taskName)) files.push(
  'src/render/WebGLApp.js', 'src/render/CameraController.js',
  'src/game/destruction/TerrainSurface.js', 'src/game/destruction/ImpactEffects.js',
  'src/input/GestureController.js', 'src/settings/SettingsStore.js',
  'src/audio/AudioManager.js', 'src/platform/haptics.js', 'docs/MOBILE_CONTROLS.md'
);
if (['monetization', 'native-monetization', 'native-review'].includes(taskName)) files.push(
  'docs/MONETIZATION_PLAN.md', 'src/game/monetization/config.js',
  'src/game/monetization/AdPolicy.js', 'src/game/monetization/MonetizationController.js',
  'src/platform/monetization.js', 'tests/monetization.test.mjs'
);
if (['native-monetization', 'native-review'].includes(taskName)) files.push('docs/NATIVE_HANDOFF.md', 'native/ios/PrivacyInfo.xcprivacy');
if (taskName === 'native-review') files.push(
  'src/platform/storekit2.js', 'src/platform/admob.js', 'tests/native-monetization.test.mjs',
  'scripts/patch-admob-ios.mjs', 'native/ios/SolarSmashStoreKit/package.json',
  'native/ios/SolarSmashStoreKit/Package.swift', 'native/ios/SolarSmashStoreKit/SolarSmashStoreKit.podspec',
  'native/ios/SolarSmashStoreKit/Sources/SolarSmashStoreKitPlugin/StoreKit2Plugin.swift',
  'native/ios/SolarSmashStoreKit/Sources/SolarSmashStoreKitPlugin/StoreKit2Manager.swift',
  'native/ios/AdMobOverrides/upstream.json', 'native/ios/AdMobOverrides/README.md',
  'native/ios/AdMobOverrides/AdMobPlugin.swift',
  'native/ios/AdMobOverrides/Rewarded/AdRewardExecutor.swift',
  'native/ios/AdMobOverrides/Interstitial/AdInterstitialExecutor.swift'
);
let content = await readFile(path.join(root, task.prompt), 'utf8');
for (const file of files) {
  content += '\n\n===== FILE: ' + file + ' =====\n' + await readFile(path.join(root, file), 'utf8');
}
const output = path.join(root, 'handoff', task.output);
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, content, 'utf8');
console.log('Gemini plain-text task created: ' + output);
console.log(files.length + ' source files; ' + content.length.toLocaleString() + ' characters.');
