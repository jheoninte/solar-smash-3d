import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '@capacitor/cli/dist/config.js';
import { getPlugins } from '@capacitor/cli/dist/plugin.js';
import { getIOSPlugins } from '@capacitor/cli/dist/ios/common.js';
import { createStoreKit2Payments } from '../src/platform/storekit2.js';
import { createAdMobAds } from '../src/platform/admob.js';
import { createPlatform } from '../src/platform/index.js';
import { MonetizationController } from '../src/game/monetization/MonetizationController.js';
import { StorageAdapter } from '../src/platform/storage.js';
import { GameStateStore } from '../src/game/state.js';
import { TEST_ONLY_MONETIZATION_CONFIG as config } from '../src/game/monetization/config.js';

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function emitter() {
  const handlers = new Map();
  return {
    async addListener(name, listener) {
      const set = handlers.get(name) || new Set();
      set.add(listener); handlers.set(name, set);
      return { remove() { set.delete(listener); } };
    },
    emit(name, payload) { for (const handler of handlers.get(name) || []) handler(payload); },
    count() { return [...handlers.values()].reduce((sum, set) => sum + set.size, 0); }
  };
}
const terminal = (requestId, reward = null, shown = true) => ({
  protocolVersion: 1, requestId, shown, closed: true, status: 'closed', reward
});

function adHarness() {
  const events = emitter();
  const calls = { initialize: 0, rewarded: 0, interstitial: 0, consent: 0 };
  const plugin = {
    ...events,
    async getPresentationCapabilities() { return { protocolVersion: 1 }; },
    async initialize() { calls.initialize++; },
    async requestConsentInfo() { calls.consent++; return {
      status: 'OBTAINED', canRequestAds: true, privacyOptionsRequirementStatus: 'REQUIRED'
    }; },
    async showConsentForm() { throw Error('unexpected form'); },
    async showPrivacyOptionsForm() {},
    async prepareRewardVideoAd() { calls.rewarded++; },
    async prepareInterstitial() { calls.interstitial++; },
    async showRewardVideoAd({ requestId }) { return terminal(requestId); },
    async showInterstitial({ requestId }) { return terminal(requestId); }
  };
  const ads = createAdMobAds({
    plugin, isIOS: true, rewardedAdUnitId: 'test_rewarded', interstitialAdUnitId: 'test_interstitial', isTesting: true
  });
  const ready = async () => {
    await ads.syncConsentAndPreload();
    await Promise.all([ads.loadRewarded(), ads.loadInterstitial()]);
  };
  return { ads, plugin, events, calls, ready };
}
async function controller({ payments, ads }) {
  const values = new Map();
  const storage = new StorageAdapter({ getLocalStorage: () => ({
    getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value)
  }) });
  const store = new GameStateStore({ storage });
  const state = await store.loadGame();
  const mc = new MonetizationController({
    platform: { name: 'ios', payments, ads }, state, stateStore: store, ...config
  });
  return { mc, state, store };
}

test('defaults and missing native plugins never enable payments or ads', () => {
  for (const name of ['ios', 'web', 'android']) {
    const platform = createPlatform({ capacitor: {
      isNativePlatform: () => name !== 'web', getPlatform: () => name, isPluginAvailable: () => true
    } });
    assert.equal(platform.payments.supported, false);
    assert.equal(platform.ads.supported, false);
  }
  const missing = createPlatform({ ...config, capacitor: {
    isNativePlatform: () => true, getPlatform: () => 'ios', isPluginAvailable: () => false
  } });
  assert.equal(missing.payments.supported, false);
  assert.equal(missing.ads.supported, false);
});

test('StoreKit2 verified purchase/restore/refund, pending and partial snapshot protection', async () => {
  const events = emitter();
  let snapshot = { status: 'ok', verified: true, entitlements: [] };
  const productId = config.products[0].iosProductId;
  const plugin = {
    ...events, getEntitlements: async () => snapshot, restore: async () => snapshot,
    getProducts: async () => ({ status: 'ok', products: [{ productId, available: true, displayPrice: '₩3,300' }] }),
    purchase: async () => ({ status: 'success', entitlement: { productId, owned: true, verified: true } })
  };
  const payments = createStoreKit2Payments({ plugin });
  const { mc } = await controller({ payments, ads: { supported: true } });
  mc.openShop();
  await mc.refreshShopCatalog(mc.shopGeneration);
  assert.equal(mc.getShopSnapshot().sellable, true);
  for (const status of ['cancelled', 'pending', 'unverified']) {
    plugin.purchase = async () => ({ status });
    assert.equal((await mc.purchaseRemoveAds()).status, status);
    assert.equal(mc.entitlementState, 'not_owned');
  }
  plugin.purchase = async () => {
    const entitlement = { productId, owned: true, verified: true };
    events.emit('transactionUpdate', entitlement); // Real native plugin publishes before resolve.
    return { status: 'success', entitlement };
  };
  assert.equal((await mc.purchaseRemoveAds()).status, 'success');
  snapshot = { status: 'ok', verified: true, entitlements: [{ productId, owned: false, verified: false }] };
  await mc.refreshEntitlements();
  assert.equal(mc.entitlementState, 'owned');
  snapshot = { status: 'ok', verified: true, entitlements: [{ productId, owned: true, verified: true }] };
  assert.equal((await mc.restorePurchases()).status, 'ok');
  events.emit('transactionUpdate', { productId, owned: false, verified: true });
  assert.equal(mc.entitlementState, 'not_owned');
  await mc.refreshEntitlements();
  assert.equal(mc.entitlementState, 'owned');

  // Restore succeeds even when Transaction.updates delivers the restored transaction before restore() resolves.
  events.emit('transactionUpdate', { productId, owned: false, verified: true });
  assert.equal(mc.entitlementState, 'not_owned');
  plugin.restore = async () => {
    const entitlement = { productId, owned: true, verified: true };
    events.emit('transactionUpdate', entitlement);
    return { status: 'ok', verified: true, entitlements: [entitlement] };
  };
  const restoreRes = await mc.restorePurchases();
  assert.equal(restoreRes.status, 'ok');
  assert.equal(restoreRes.owned, true);
  assert.equal(mc.entitlementState, 'owned');

  mc.dispose(); payments.dispose();
  await Promise.resolve();
  assert.equal(events.count(), 0);
});

test('StoreKit2 late responses after dispose and unverified success cannot grant rights', async () => {
  const pending = deferred();
  const payments = createStoreKit2Payments({ plugin: {
    purchase: () => pending.promise,
    getEntitlements: async () => ({ status: 'ok', verified: false, entitlements: [] })
  } });
  assert.equal((await payments.getEntitlements()).status, 'error');
  const purchase = payments.purchase('remove_ads');
  payments.dispose();
  pending.resolve({ status: 'success', entitlement: { productId: 'remove_ads', owned: true, verified: true } });
  assert.equal((await purchase).status, 'unavailable');
});

test('unpatched AdMob cannot initialize, preload, show or supply a sale benefit', async () => {
  const h = adHarness();
  h.plugin.getPresentationCapabilities = async () => { throw Error('unimplemented'); };
  await h.ready();
  assert.equal(h.ads.supported, false);
  assert.equal(h.ads.canRequestAds(), false);
  assert.equal(h.calls.initialize, 0);
  assert.equal(h.calls.rewarded, 0);
  assert.equal((await h.ads.showRewarded({ requestId: 'x' })).status, 'not_ready');
  h.ads.dispose();
});

test('ensureBridge recovers after a transient startup failure', async () => {
  const h = adHarness();
  let failOnce = true;
  h.plugin.getPresentationCapabilities = async () => {
    if (failOnce) {
      failOnce = false;
      throw Error('bridge not ready yet');
    }
    return { protocolVersion: 1 };
  };
  await h.ads.syncConsentAndPreload();
  assert.equal(h.ads.supported, false);

  await h.ads.syncConsentAndPreload();
  assert.equal(h.ads.supported, true);
  assert.equal(h.ads.canRequestAds(), true);
  h.ads.dispose();
});

test('UMP false and refresh errors invalidate consent and prepared ads', async () => {
  const h = adHarness();
  await h.ready();
  assert.equal(h.ads.canRequestAds(), true);
  assert.equal(h.ads.isPrivacyOptionsRequired(), true);
  assert.equal(h.calls.initialize, 1, 'parallel formats share initialization');
  h.plugin.requestConsentInfo = async () => { throw Error('network'); };
  await h.ads.openPrivacyOptions();
  assert.equal(h.ads.canRequestAds(), false);
  assert.equal(h.ads.isRewardedReady(), false);
  h.plugin.requestConsentInfo = async () => ({ canRequestAds: false, privacyOptionsRequirementStatus: 'REQUIRED' });
  await h.ads.syncConsentAndPreload();
  assert.equal(h.ads.isInterstitialReady(), false);
  h.ads.dispose();
});

test('consent operations serialize and do not request ATT by default', async () => {
  const h = adHarness();
  const gate = deferred();
  h.plugin.requestConsentInfo = () => gate.promise;
  let att = 0;
  h.plugin.trackingAuthorizationStatus = async () => { att++; return { status: 'notDetermined' }; };
  const first = h.ads.syncConsentAndPreload();
  const second = h.ads.syncConsentAndPreload();
  assert.equal(first, second);
  gate.resolve({ canRequestAds: true });
  await first;
  assert.equal(att, 0);
  h.ads.dispose();
});

test('privacy/native consent holds the controller lock and releases it after errors', async () => {
  const h = adHarness();
  const { mc } = await controller({ payments: { supported: false }, ads: h.ads });
  const gate = deferred();
  h.plugin.requestConsentInfo = () => gate.promise;
  const refresh = mc.refreshAdConsent();
  assert.equal(mc.isBusy(), true);
  assert.equal(await mc.runResultExitTransition(() => assert.fail('must remain locked')), false);
  gate.reject(Error('offline'));
  await refresh;
  assert.equal(mc.isBusy(), false);
  mc.dispose(); h.ads.dispose();
});

test('no fill, native show rejection and unrewarded closure never grant bonus', async () => {
  const h = adHarness();
  h.plugin.prepareRewardVideoAd = async () => { throw Error('no fill'); };
  await h.ready();
  assert.equal(h.ads.isRewardedReady(), false);
  h.plugin.prepareRewardVideoAd = async () => {};
  await h.ads.loadRewarded();
  h.plugin.showRewardVideoAd = async () => { throw Error('no root VC'); };
  assert.equal((await h.ads.showRewarded({ requestId: 'failure' })).reward, null);
  await h.ads.loadRewarded();
  h.plugin.showRewardVideoAd = async ({ requestId }) => terminal(requestId);
  const result = await h.ads.showRewarded({ requestId: 'cancel' });
  assert.equal(result.closed, true);
  assert.equal(result.reward, null);
  h.ads.dispose();
});

test('raw close/reward events in either bridge order cannot settle or grant; native terminal does', async () => {
  const h = adHarness();
  await h.ready();
  for (const reverse of [false, true]) {
    await h.ads.loadRewarded();
    const gate = deferred();
    const requestId = reverse ? 'second' : 'first';
    h.plugin.showRewardVideoAd = () => gate.promise;
    let shown = 0, settled = false;
    const watching = h.ads.showRewarded({ requestId, onShown: () => { shown++; } })
      .then((value) => { settled = true; return value; });
    h.events.emit('onRewardedVideoAdShowed', { requestId: 'older' });
    assert.equal(shown, 0);
    h.events.emit('onRewardedVideoAdShowed', { requestId });
    h.events.emit('onRewardedVideoAdShowed', { requestId });
    assert.equal(shown, 1);
    const raw = ['onRewardedVideoAdReward', 'onRewardedVideoAdDismissed'];
    for (const event of reverse ? raw.reverse() : raw) h.events.emit(event, { requestId });
    await Promise.resolve();
    assert.equal(settled, false);
    assert.equal((await h.ads.showRewarded({ requestId: 'double' })).status, 'not_ready');
    gate.resolve(terminal(requestId, { verified: true }));
    assert.deepEqual((await watching).reward, { verified: true });
    h.events.emit('onRewardedVideoAdShowed', { requestId });
    assert.equal(shown, 1);
  }
  h.ads.dispose();
});

test('a stale/malformed terminal response cannot grant or enable another presentation', async () => {
  const h = adHarness();
  await h.ready();
  h.plugin.showRewardVideoAd = async () => terminal('old_request', { verified: true });
  const result = await h.ads.showRewarded({ requestId: 'current' });
  assert.equal(result.status, 'protocol_error');
  assert.equal(result.reward, null);
  assert.equal(h.ads.supported, false);
  h.ads.dispose();
});

test('a displayed ad stays pending during dispose until the real native terminal', async () => {
  const h = adHarness();
  await h.ready();
  const gate = deferred();
  h.plugin.showInterstitial = () => gate.promise;
  let settled = false;
  const watching = h.ads.showInterstitial({ requestId: 'interstitial' }).then((value) => { settled = true; return value; });
  h.events.emit('interstitialAdShowed', { requestId: 'interstitial' });
  h.ads.dispose();
  await Promise.resolve();
  assert.equal(settled, false);
  gate.resolve(terminal('interstitial'));
  const result = await watching;
  assert.equal(result.status, 'disposed');
  assert.equal(result.closed, true);
  assert.equal(h.events.count(), 0);
});

test('consent revocation while preload is pending cannot publish stale readiness', async () => {
  const h = adHarness();
  const gate = deferred();
  h.plugin.prepareRewardVideoAd = () => gate.promise;
  await h.ads.syncConsentAndPreload();
  const loading = h.ads.loadRewarded();
  h.plugin.requestConsentInfo = async () => ({ canRequestAds: false });
  await h.ads.openPrivacyOptions();
  gate.resolve();
  await loading;
  assert.equal(h.ads.canRequestAds(), false);
  assert.equal(h.ads.isRewardedReady(), false);
  h.ads.dispose();
});

test('restore preserves a newer verified revocation and rejects malformed snapshots', async () => {
  const events = emitter();
  const productId = config.products[0].iosProductId;
  const plugin = {
    ...events,
    restore: async () => {
      events.emit('transactionUpdate', { productId, owned: false, verified: true });
      return { status: 'ok', verified: true, entitlements: [{ productId, owned: true, verified: true }] };
    }
  };
  const payments = createStoreKit2Payments({ plugin });
  const { mc } = await controller({ payments, ads: { supported: false } });
  await Promise.resolve(); // Native listener registration.
  mc.handleTransactionUpdate({ productId, owned: true, verified: true });
  assert.deepEqual(await mc.restorePurchases(), { status: 'ok', owned: false });
  assert.equal(mc.entitlementState, 'not_owned');
  mc.handleTransactionUpdate({ productId, owned: true, verified: true });
  for (const entry of [
    { owned: true, verified: true },
    { productId: '', owned: false, verified: true },
    { productId, owned: false, verified: false }
  ]) {
    plugin.restore = async () => ({ status: 'ok', verified: true, entitlements: [entry] });
    assert.equal((await mc.restorePurchases()).status, 'error');
    assert.equal(mc.entitlementState, 'owned');
  }
  mc.dispose(); payments.dispose();
});

test('bridge retries synchronous failures and cleans partial listener registration', async () => {
  const h = adHarness();
  h.plugin.getPresentationCapabilities = () => { throw Error('sync startup failure'); };
  assert.equal((await h.ads.syncConsentAndPreload()).status, 'unavailable');
  h.plugin.getPresentationCapabilities = async () => ({ protocolVersion: 1 });
  const addListener = h.plugin.addListener;
  let registrations = 0;
  h.plugin.addListener = (...args) => {
    if (++registrations === 2) throw Error('second registration failed');
    return addListener(...args);
  };
  assert.equal((await h.ads.syncConsentAndPreload()).status, 'unavailable');
  assert.equal(h.events.count(), 0);
  h.plugin.addListener = addListener;
  await h.ready();
  await h.ready();
  assert.equal(h.ads.isRewardedReady(), true);
  assert.equal(h.events.count(), 2, 'successful refreshes must reuse their listeners');
  h.ads.dispose();
  assert.equal(h.events.count(), 0);
});

test('a presentation protocol violation stays disabled across consent refreshes', async () => {
  const h = adHarness();
  await h.ready();
  h.plugin.showRewardVideoAd = async () => terminal('wrong_request', { verified: true });
  assert.equal((await h.ads.showRewarded({ requestId: 'current' })).status, 'protocol_error');
  assert.equal((await h.ads.syncConsentAndPreload()).status, 'unavailable');
  assert.equal(h.ads.supported, false);
  assert.equal(h.ads.isRewardedReady(), false);
  assert.equal(h.events.count(), 2, 'a malformed presentation must not register extra listeners');
  h.ads.dispose();
});

test('consent refresh waits for an older preload before replacing its native ad', async () => {
  const h = adHarness();
  const firstLoad = deferred();
  const secondLoad = deferred();
  const enteredFirst = deferred();
  const enteredSecond = deferred();
  let calls = 0, pending = 0, maxPending = 0;
  h.plugin.prepareRewardVideoAd = async () => {
    calls++;
    pending++;
    maxPending = Math.max(maxPending, pending);
    const first = calls === 1;
    (first ? enteredFirst : enteredSecond).resolve();
    await (first ? firstLoad : secondLoad).promise;
    pending--;
  };
  await h.ads.syncConsentAndPreload();
  await enteredFirst.promise;
  await h.ads.openPrivacyOptions();
  assert.equal(calls, 1);
  assert.equal(h.ads.isRewardedReady(), false);
  firstLoad.resolve();
  await enteredSecond.promise;
  assert.equal(h.ads.isRewardedReady(), false, 'older consent generation cannot become ready');
  const latest = h.ads.loadRewarded();
  secondLoad.resolve();
  await latest;
  assert.equal(maxPending, 1);
  assert.equal(calls, 2);
  assert.equal(h.ads.isRewardedReady(), true);
  h.ads.dispose();
});

test('native override application is repeatable and Capacitor can discover the local StoreKit package', async () => {
  const script = new URL('../scripts/patch-admob-ios.mjs', import.meta.url);
  execFileSync(process.execPath, [fileURLToPath(script), '--check']);
  const pkg = JSON.parse(await readFile(new URL('../native/ios/SolarSmashStoreKit/package.json', import.meta.url)));
  assert.equal(pkg.capacitor.ios.src, '.');
  const plugins = await getIOSPlugins(await getPlugins(await loadConfig(), 'ios'));
  const local = plugins.find((entry) => entry.id === 'solar-smash-store-kit');
  assert.equal(local?.ios.name, 'SolarSmashStoreKit');
  assert.equal(plugins.some((entry) => entry.id === '@capacitor-community/admob'), true);
  const native = await readFile(new URL('../native/ios/AdMobOverrides/Rewarded/AdRewardExecutor.swift', import.meta.url), 'utf8');
  assert.match(native, /self\.activeAd === ad/);
  assert.match(native, /"protocolVersion": 1/);
  assert.doesNotMatch(native, /asyncAfter|Timer|setTimeout/);
});
