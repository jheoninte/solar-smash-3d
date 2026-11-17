import test from 'node:test';
import assert from 'node:assert/strict';
import { StorageAdapter } from '../src/platform/storage.js';
import { GameStateStore } from '../src/game/state.js';
import { ShopSystem } from '../src/game/shop/ShopSystem.js';
import { MissionSystem } from '../src/game/missions/MissionSystem.js';
import { createUnavailableAds, createUnavailablePayments } from '../src/platform/monetization.js';
import { MonetizationController } from '../src/game/monetization/MonetizationController.js';

function createMemoryLocalStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => { map.set(key, String(value)); },
    removeItem: (key) => { map.delete(key); },
    dump: (key) => map.get(key)
  };
}

function createFakeTestPlatform({
  paymentsSupported = true,
  adsSupported = true,
  canRequestAds = true,
  rewardedReady = true,
  interstitialReady = true,
  productPrice = '₩3,300',
  productAvailable = true,
  initialOwned = false
} = {}) {
  let owned = initialOwned;
  let txListener = null;
  let rewardListener = null;
  let purchaseHandler = async (productId) => ({
    status: 'success',
    entitlement: { productId, owned: true, verified: true }
  });
  let restoreHandler = async () => ({
    status: 'ok',
    verified: true,
    entitlements: [{ productId: 'ios.remove_ads', owned, verified: true }]
  });
  let entitlementsHandler = async () => ({
    status: 'ok',
    verified: true,
    entitlements: [{ productId: 'ios.remove_ads', owned, verified: true }]
  });
  let rewardedHandler = async ({ requestId }) => ({
    requestId,
    status: 'completed',
    shown: true,
    closed: true,
    reward: { verified: true }
  });
  let interstitialHandler = async ({ requestId }) => ({
    requestId,
    status: 'closed',
    shown: true,
    closed: true
  });

  const platform = {
    isNative: true,
    name: 'ios',
    storage: new StorageAdapter({ getLocalStorage: () => createMemoryLocalStorage() }),
    payments: paymentsSupported ? {
      supported: true,
      async getProducts(ids) {
        return {
          status: 'ok',
          products: ids.map((productId) => ({
            productId,
            displayPrice: productPrice,
            available: productAvailable
          }))
        };
      },
      purchase: (id) => purchaseHandler(id),
      restore: () => restoreHandler(),
      getEntitlements: () => entitlementsHandler(),
      subscribeTransactions(cb) {
        txListener = cb;
        return () => { txListener = null; };
      }
    } : createUnavailablePayments(),
    ads: adsSupported ? {
      supported: true,
      canRequestAds: () => canRequestAds,
      isRewardedReady: () => rewardedReady,
      async loadRewarded() { return { status: 'ready' }; },
      showRewarded: (opts) => rewardedHandler(opts),
      subscribeRewardEvents(cb) {
        rewardListener = cb;
        return () => { rewardListener = null; };
      },
      isInterstitialReady: () => interstitialReady,
      async loadInterstitial() { return { status: 'ready' }; },
      showInterstitial: (opts) => interstitialHandler(opts)
    } : createUnavailableAds()
  };

  return {
    platform,
    setPurchaseHandler(fn) { purchaseHandler = fn; },
    setRestoreHandler(fn) { restoreHandler = fn; },
    setEntitlementsHandler(fn) { entitlementsHandler = fn; },
    setRewardedHandler(fn) { rewardedHandler = fn; },
    setInterstitialHandler(fn) { interstitialHandler = fn; },
    setRewardedReady(v) { rewardedReady = v; },
    setInterstitialReady(v) { interstitialReady = v; },
    setCanRequestAds(v) { canRequestAds = v; },
    emitTransaction(ev) { txListener?.(ev); },
    emitRewardEvent(ev) { rewardListener?.(ev); }
  };
}

const TEST_PRODUCTS = [{
  key: 'remove_ads',
  type: 'non-consumable',
  title: '전면 광고 제거',
  description: '자동 전면 광고를 제거합니다.',
  iosProductId: 'ios.remove_ads',
  androidProductId: null
}];

const TEST_REWARDED_POLICY = {
  enabled: true,
  placement: 'first_mission_completion',
  iosAdUnitId: 'ca-app-pub-test/rewarded',
  androidAdUnitId: null,
  bonusFraction: 0.5,
  maxClaimsPerMission: 1
};

const TEST_INTERSTITIAL_POLICY = {
  enabled: true,
  placement: 'mission_result_exit',
  iosAdUnitId: 'ca-app-pub-test/interstitial',
  androidAdUnitId: null,
  firstEligibleActiveSeconds: 120,
  minCompletedRuns: 2,
  minCompletionsBetweenAds: 3,
  minSecondsBetweenAnyAds: 180,
  maxPerSession: 3
};

test('1. 미지원 기본 어댑터는 권한·구매·광고 보상을 생성하지 않는다', async () => {
  const local = createMemoryLocalStorage();
  const storage = new StorageAdapter({ getLocalStorage: () => local });
  const store = new GameStateStore({ storage });
  const state = await store.loadGame();

  const platform = {
    isNative: false,
    name: 'web',
    storage,
    payments: createUnavailablePayments(),
    ads: createUnavailableAds()
  };
  const mc = new MonetizationController({ platform, state, stateStore: store });
  mc.openShop();
  await Promise.resolve();

  const shopSnap = mc.getShopSnapshot();
  assert.equal(shopSnap.sellable, false);
  assert.equal(shopSnap.owned, false);

  const buyRes = await mc.purchaseRemoveAds();
  assert.equal(buyRes.status, 'unavailable');
  assert.equal(mc.entitlementState, 'unknown');

  const completion = store.claimMissionReward(state, {
    status: 'completed',
    mission: { id: 'm1' },
    progress: { count: 5, damage: 90 }
  });
  const offer = await mc.prepareMissionResult(completion);
  assert.equal(offer, null);
  assert.equal(state.progression.coins, 100);
});

test('2. 구매 취소·보류·미검증은 권한을 부여하지 않고 복원 오류는 기존 검증 권한을 지우지 않는다', async () => {
  const harness = createFakeTestPlatform();
  const store = new GameStateStore({ storage: harness.platform.storage });
  const state = await store.loadGame();
  const mc = new MonetizationController({
    platform: harness.platform,
    state,
    stateStore: store,
    products: TEST_PRODUCTS,
    rewardedPolicy: TEST_REWARDED_POLICY,
    interstitialPolicy: TEST_INTERSTITIAL_POLICY
  });
  mc.openShop();
  await mc.refreshShopCatalog(mc.shopGeneration);
  assert.equal(mc.getShopSnapshot().sellable, true);

  // 취소
  harness.setPurchaseHandler(async () => ({ status: 'cancelled' }));
  assert.equal((await mc.purchaseRemoveAds()).status, 'cancelled');
  assert.equal(mc.entitlementState, 'not_owned');

  // 보류
  harness.setPurchaseHandler(async () => ({ status: 'pending' }));
  assert.equal((await mc.purchaseRemoveAds()).status, 'pending');
  assert.equal(mc.entitlementState, 'not_owned');

  // 미검증 성공
  harness.setPurchaseHandler(async (productId) => ({
    status: 'success',
    entitlement: { productId, owned: true, verified: false }
  }));
  assert.equal((await mc.purchaseRemoveAds()).status, 'unverified');
  assert.equal(mc.entitlementState, 'not_owned');

  // 검증된 구매 성공
  harness.setPurchaseHandler(async (productId) => ({
    status: 'success',
    entitlement: { productId, owned: true, verified: true }
  }));
  assert.equal((await mc.purchaseRemoveAds()).status, 'success');
  assert.equal(mc.entitlementState, 'owned');

  // 조회/복원 네트워크 오류가 발생해도 기존 verified 권한은 유지
  harness.setRestoreHandler(async () => ({ status: 'error', entitlements: [] }));
  await mc.restorePurchases();
  assert.equal(mc.entitlementState, 'owned');

  // 검증된 환불/비소유 업데이트는 반영
  harness.emitTransaction({ productId: 'ios.remove_ads', owned: false, verified: true });
  assert.equal(mc.entitlementState, 'not_owned');
});

test('3. 권한 미확인(unknown) 상태에서는 전면 광고를 금지한다', async () => {
  const harness = createFakeTestPlatform();
  harness.setEntitlementsHandler(async () => ({ status: 'offline', entitlements: [] }));
  const store = new GameStateStore({ storage: harness.platform.storage });
  const state = await store.loadGame();
  const mc = new MonetizationController({
    platform: harness.platform,
    state,
    stateStore: store,
    products: TEST_PRODUCTS,
    rewardedPolicy: TEST_REWARDED_POLICY,
    interstitialPolicy: TEST_INTERSTITIAL_POLICY
  });

  await mc.refreshEntitlements();
  assert.equal(mc.entitlementState, 'unknown');

  mc.recordActiveTime(200);
  mc.recordMissionCompleted();
  mc.recordMissionCompleted();
  mc.recordMissionCompleted();

  let shownCount = 0;
  harness.setInterstitialHandler(async ({ requestId }) => {
    shownCount += 1;
    return { requestId, status: 'closed', shown: true, closed: true };
  });

  let navigated = 0;
  await mc.runResultExitTransition(() => { navigated += 1; });
  assert.equal(shownCount, 0);
  assert.equal(navigated, 1);
});

test('4. 보상 광고 이벤트와 닫힘의 양쪽 순서 및 중복·과거 콜백을 안전하게 1회만 지급한다', async () => {
  const harness = createFakeTestPlatform();
  const local = createMemoryLocalStorage();
  const storage = new StorageAdapter({ getLocalStorage: () => local });
  const store = new GameStateStore({ storage });
  const state = await store.loadGame();
  const mc = new MonetizationController({
    platform: harness.platform,
    state,
    stateStore: store,
    products: TEST_PRODUCTS,
    rewardedPolicy: TEST_REWARDED_POLICY,
    interstitialPolicy: TEST_INTERSTITIAL_POLICY
  });

  // 순서 A: 보상 이벤트가 닫힘보다 먼저 도착 + 중복 이벤트 + 연속 클릭
  const c1 = store.claimMissionReward(state, {
    status: 'completed',
    mission: { id: 'm1' },
    progress: { count: 5, damage: 90 }
  });
  const offer1 = await mc.prepareMissionResult(c1);
  assert.equal(offer1.bonusCoins, 50);

  harness.setRewardedHandler(async ({ requestId }) => {
    harness.emitRewardEvent({ requestId, verified: true });
    harness.emitRewardEvent({ requestId, verified: true }); // 중복 이벤트
    return { requestId, status: 'closed', shown: true, closed: true, reward: { verified: true } };
  });

  const [r1, r2] = await Promise.all([mc.watchRewardedBonus(), mc.watchRewardedBonus()]);
  assert.equal(r1.status, 'rewarded');
  assert.equal(r2.status, 'ignored');
  assert.equal(state.progression.coins, 150); // 기본 100 + 보너스 50 1회
  assert.deepEqual(state.progression.rewardedMissionIds, ['m1']);

  // 순서 B: raw close 이후 보상 이벤트가 와도 normalized Promise는 계속 pending.
  const c2 = store.claimMissionReward(state, {
    status: 'completed',
    mission: { id: 'm2' },
    progress: { count: 10, damage: 100 }
  });
  const offer2 = await mc.prepareMissionResult(c2);
  assert.equal(offer2.bonusCoins, 75);

  let finish;
  let attemptId;
  harness.setRewardedHandler(({ requestId, onShown }) => {
    attemptId = requestId;
    onShown();
    return new Promise((resolve) => { finish = resolve; });
  });
  const watching = mc.watchRewardedBonus();
  assert.equal(state.progression.coins, 300); // 기본 +150만 반영, 아직 보너스 미지급
  assert.equal(mc.isBusy(), true);

  // 과거 requestId(offer1) 이벤트는 거부
  harness.emitRewardEvent({ requestId: offer1.requestId, verified: true });
  assert.equal(state.progression.coins, 300);

  // 제안 ID는 광고 요청 ID가 아니다. 실제 시청 시도만 수령할 수 있다.
  harness.emitRewardEvent({ requestId: offer2.requestId, verified: true });
  assert.equal(state.progression.coins, 300);
  harness.emitRewardEvent({ requestId: attemptId, verified: true });
  finish({ requestId: attemptId, shown: true, closed: true, reward: null });
  await watching;
  harness.emitRewardEvent({ requestId: attemptId, verified: true });
  assert.equal(state.progression.coins, 375);
  assert.deepEqual(state.progression.rewardedMissionIds, ['m1', 'm2']);

  // 같은 스냅샷에 코인과 rewardedMissionIds가 함께 저장되었는지 확인
  await storage.flush();
  const saved = JSON.parse(local.dump('solar-smash-3d.save'));
  assert.equal(saved.schemaVersion, 6);
  assert.equal(saved.progression.coins, 375);
  assert.deepEqual(saved.progression.rewardedMissionIds, ['m1', 'm2']);
});

test('5. 첫 완료 저장 실패 시 보상 광고를 열지 않고, 보너스 저장 실패 후 다음 저장에서 복구된다', async () => {
  const harness = createFakeTestPlatform();
  let failWrites = true;
  const local = createMemoryLocalStorage();
  const storage = new StorageAdapter({
    getLocalStorage: () => ({
      getItem: (k) => local.getItem(k),
      setItem: (k, v) => {
        if (failWrites) throw new Error('disk full');
        local.setItem(k, v);
      }
    })
  });
  const store = new GameStateStore({ storage });
  const state = await store.loadGame();
  const mc = new MonetizationController({
    platform: harness.platform,
    state,
    stateStore: store,
    products: TEST_PRODUCTS,
    rewardedPolicy: TEST_REWARDED_POLICY,
    interstitialPolicy: TEST_INTERSTITIAL_POLICY
  });

  // 첫 완료 저장 실패 -> 광고 제안 불가
  const c1 = store.claimMissionReward(state, {
    status: 'completed',
    mission: { id: 'm1' },
    progress: { count: 5, damage: 90 }
  });
  assert.equal(await mc.prepareMissionResult(c1), null);

  // 쓰기 복구 후 m2 완료 -> 광고 제안 가능, 이후 보너스 저장만 실패해도 메모리 중복 지급 없음
  failWrites = false;
  const c2 = store.claimMissionReward(state, {
    status: 'completed',
    mission: { id: 'm2' },
    progress: { count: 10, damage: 100 }
  });
  const offer2 = await mc.prepareMissionResult(c2);
  assert.equal(offer2.bonusCoins, 75);

  failWrites = true;
  await mc.watchRewardedBonus();
  await storage.flush();
  assert.equal(state.progression.coins, 325); // 100 + 150 + 75
  assert.equal(state.capabilities.storage, false);
  assert.deepEqual(state.progression.rewardedMissionIds, ['m2']);

  // 이후 정상 저장 시 보너스 코인 + rewardedMissionIds 함께 영속화
  failWrites = false;
  await store.persist(state);
  const persisted = JSON.parse(local.dump('solar-smash-3d.save'));
  assert.equal(persisted.progression.coins, 325);
  assert.deepEqual(persisted.progression.rewardedMissionIds, ['m2']);
});

test('6. 저장 데이터를 손실 없이 v6으로 이전하고 미완료 미션의 손상 rewardedMissionIds를 정규화한다', async () => {
  const v3Legacy = JSON.stringify({
    schemaVersion: 3,
    mode: 'solar',
    weapon: 'laser',
    stats: { damage: 420, impactCount: 15 },
    session: { recentImpacts: [] },
    progression: {
      coins: 500,
      completedMissions: ['m1'],
      rewardedMissionIds: ['m1', 'm2', 'invalid_id', 'm1'],
      ownedSkins: ['earth', 'obsidian'],
      equippedSkin: 'obsidian'
    }
  });
  const local = createMemoryLocalStorage({ 'solar-smash-3d.save': v3Legacy });
  const storage = new StorageAdapter({ getLocalStorage: () => local });
  const store = new GameStateStore({ storage });
  const state = await store.loadGame();

  assert.equal(state.mode, 'solar');
  assert.equal(state.weapon, 'laser');
  assert.equal(state.progression.coins, 500);
  assert.deepEqual(state.progression.completedMissions, ['m1']);
  assert.deepEqual(state.progression.rewardedMissionIds, ['m1']); // 미완료 m2 및 invalid_id 제거
  assert.deepEqual(state.progression.missionRecords, {});
  assert.equal(state.progression.equippedSkin, 'obsidian');

  await store.persist(state);
  const upgraded = JSON.parse(local.dump('solar-smash-3d.save'));
  assert.equal(upgraded.schemaVersion, 6);
  assert.deepEqual(upgraded.progression.rewardedMissionIds, ['m1']);
  assert.deepEqual(upgraded.progression.missionRecords, {});
});

async function setupSupported(options = {}) {
  const harness = createFakeTestPlatform(options);
  const store = new GameStateStore({ storage: harness.platform.storage });
  const state = await store.loadGame();
  const mc = new MonetizationController({
    platform: harness.platform, state, stateStore: store, products: TEST_PRODUCTS,
    rewardedPolicy: TEST_REWARDED_POLICY, interstitialPolicy: TEST_INTERSTITIAL_POLICY
  });
  const complete = (id = 'm1') => store.claimMissionReward(state, {
    status: 'completed', mission: { id }, progress: { count: 50, damage: 1000 }
  });
  return { harness, store, state, mc, complete };
}

test('광고 시청 전·종료 후·이전 시도 이벤트를 거부하고 재시도는 새 ID를 쓴다', async () => {
  const { harness, state, mc, complete } = await setupSupported();
  const offer = await mc.prepareMissionResult(complete());
  harness.emitRewardEvent({ requestId: offer.requestId, verified: true });
  assert.equal(state.progression.coins, 100);
  let previous;
  harness.setRewardedHandler(async ({ requestId }) => {
    previous = requestId;
    return { requestId, status: 'cancelled', shown: true, closed: true };
  });
  mc.recordActiveTime(250);
  await mc.watchRewardedBonus();
  assert.equal(mc.policy.lastAnyAdShownAtActiveSeconds, 250);
  harness.emitRewardEvent({ requestId: previous, verified: true });
  assert.equal(state.progression.coins, 100);
  harness.setRewardedHandler(async ({ requestId }) => {
    assert.notEqual(requestId, previous);
    harness.emitRewardEvent({ requestId: previous, verified: true });
    assert.equal(state.progression.coins, 100);
    return { requestId, shown: true, closed: true, reward: { verified: true } };
  });
  await mc.watchRewardedBonus();
  assert.equal(state.progression.coins, 150);
  mc.dispose();
});

test('표시 시점의 동의·준비·저장 상태를 다시 확인한다', async () => {
  for (const revoke of [
    ({ harness }) => harness.setCanRequestAds(false),
    ({ harness }) => harness.setRewardedReady(false),
    ({ state }) => { state.capabilities.storageBlocked = true; },
    ({ harness }) => { harness.platform.ads.isRewardedReady = () => { throw Error('SDK'); }; }
  ]) {
    const context = await setupSupported();
    await context.mc.prepareMissionResult(context.complete());
    let calls = 0;
    context.harness.setRewardedHandler(() => { calls++; throw Error('must not show'); });
    revoke(context);
    assert.equal((await context.mc.watchRewardedBonus()).status, 'unavailable');
    assert.equal(calls, 0);
    assert.equal(context.state.progression.coins, 100);
    context.mc.dispose();
  }
});

test('권한 쿼리의 오래된 응답·미검증 목록은 새 구매 권한을 지우지 않는다', async () => {
  const { harness, mc } = await setupSupported();
  let finishQuery;
  harness.setEntitlementsHandler(() => new Promise((resolve) => { finishQuery = resolve; }));
  const query = mc.refreshEntitlements();
  await Promise.resolve();
  harness.emitTransaction({ productId: 'ios.remove_ads', owned: true, verified: true });
  finishQuery({ status: 'ok', verified: true, entitlements: [] });
  await query;
  assert.equal(mc.entitlementState, 'owned');
  for (const response of [
    { status: 'ok', entitlements: [] },
    { status: 'ok', verified: true, entitlements: [{ productId: 'ios.remove_ads', verified: false, owned: false }] },
    { status: 'error', verified: true, entitlements: [] }
  ]) {
    harness.setEntitlementsHandler(async () => response);
    await mc.refreshEntitlements();
    assert.equal(mc.entitlementState, 'owned');
  }
  harness.setEntitlementsHandler(async () => ({ status: 'ok', verified: true, entitlements: [] }));
  await mc.refreshEntitlements();
  assert.equal(mc.entitlementState, 'not_owned');
  mc.dispose();
});

test('이전 상점의 늦은 상품 조회가 다시 연 상점의 가격을 덮어쓰지 않는다', async () => {
  const { harness, mc } = await setupSupported();
  const pending = [];
  harness.platform.payments.getProducts = () => new Promise((resolve) => pending.push(resolve));
  mc.shopOpen = true;
  const old = mc.refreshShopCatalog(++mc.shopGeneration);
  await Promise.resolve();
  mc.closeShop();
  mc.shopOpen = true;
  const current = mc.refreshShopCatalog(++mc.shopGeneration);
  await Promise.resolve();
  const product = (price) => ({ status: 'ok', products: [{ productId: 'ios.remove_ads', available: true, displayPrice: price }] });
  pending[1](product('₩4,400'));
  await current;
  pending[0](product('₩1,100'));
  await old;
  assert.equal(mc.getShopSnapshot().product.displayPrice, '₩4,400');
  mc.dispose();
});

test('광고 판정 예외·비동기 동의·미준비는 지연 없이 1회 이동하며 이동 완료까지 잠근다', async () => {
  for (const mutate of [
    (ads) => { ads.canRequestAds = () => { throw Error('consent'); }; },
    (ads) => { ads.canRequestAds = () => new Promise(() => {}); },
    (ads) => { ads.isInterstitialReady = () => { throw Error('ready'); }; },
    (ads) => { ads.isInterstitialReady = () => false; },
    (ads) => { ads.showInterstitial = () => { throw Error('show'); }; }
  ]) {
    const { harness, mc } = await setupSupported();
    await mc.refreshEntitlements();
    mc.recordActiveTime(300);
    for (let i = 0; i < 3; i++) mc.recordMissionCompleted();
    mutate(harness.platform.ads);
    let moves = 0;
    let finishNavigation;
    const moving = mc.runResultExitTransition(() => {
      moves++;
      return new Promise((resolve) => { finishNavigation = resolve; });
    });
    await Promise.resolve();
    assert.equal(moves, 1);
    assert.equal(mc.isBusy(), true);
    assert.equal(await mc.runResultExitTransition(() => { moves++; }), false);
    finishNavigation();
    await moving;
    assert.equal(moves, 1);
    assert.equal(mc.isBusy(), false);
    mc.dispose();
  }
});

test('전면 광고 한도·간격과 광고 제거 권한을 적용하고 늦은 표시 이벤트를 무시한다', async () => {
  const { harness, mc } = await setupSupported();
  await mc.refreshEntitlements();
  let calls = 0;
  let oldShown;
  harness.setInterstitialHandler(async ({ requestId, onShown }) => {
    calls++;
    oldShown = onShown;
    onShown(); onShown();
    return { requestId, status: 'closed', shown: true, closed: true };
  });
  for (let round = 0; round < 4; round++) {
    mc.recordActiveTime(181);
    for (let i = 0; i < 3; i++) mc.recordMissionCompleted();
    await mc.runResultExitTransition(() => {});
    oldShown?.();
  }
  assert.equal(calls, 3);
  assert.equal(mc.policy.interstitialsShownThisSession, 3);
  harness.emitTransaction({ productId: 'ios.remove_ads', owned: true, verified: true });
  mc.policy.interstitialsShownThisSession = 0;
  await mc.runResultExitTransition(() => {});
  assert.equal(calls, 3);
  mc.dispose();
});

test('v2/v3/v4/v5 진행도 이전과 손상·미래 세이브 원본 보호', async () => {
  for (const version of [2, 3, 4, 5]) {
    const local = createMemoryLocalStorage({ 'solar-smash-3d.save': JSON.stringify({
      schemaVersion: version, mode: 'solar', weapon: 'laser',
      progression: {
        coins: 700,
        completedMissions: ['m1'],
        rewardedMissionIds: version === 5 ? ['m1'] : [],
        ownedSkins: ['earth', 'ember'],
        equippedSkin: 'ember'
      }
    }) });
    const store = new GameStateStore({ storage: new StorageAdapter({ getLocalStorage: () => local }) });
    const state = await store.loadGame();
    assert.equal(state.progression.coins, 700);
    assert.equal(state.progression.equippedSkin, 'ember');
    assert.deepEqual(state.progression.rewardedMissionIds, version === 5 ? ['m1'] : []);
    assert.deepEqual(state.progression.missionRecords, {});
    await store.persist(state);
    assert.equal(JSON.parse(local.dump('solar-smash-3d.save')).schemaVersion, 6);
  }
  for (const original of ['{bad json', JSON.stringify({ schemaVersion: 999, mode: 'planet' })]) {
    const local = createMemoryLocalStorage({ 'solar-smash-3d.save': original });
    const store = new GameStateStore({ storage: new StorageAdapter({ getLocalStorage: () => local }) });
    const state = await store.loadGame();
    assert.equal(state.capabilities.storageBlocked, true);
    assert.equal(await store.persist(state), false);
    assert.equal(local.dump('solar-smash-3d.save'), original);
  }
});

test('7. 전면 광고 활성 시간·완료 횟수·보상 광고 직후 180초 간격·지연 로드 차단·단일 이동을 검증한다', async () => {
  const harness = createFakeTestPlatform();
  const store = new GameStateStore({ storage: harness.platform.storage });
  const state = await store.loadGame();
  const mc = new MonetizationController({
    platform: harness.platform,
    state,
    stateStore: store,
    products: TEST_PRODUCTS,
    rewardedPolicy: TEST_REWARDED_POLICY,
    interstitialPolicy: TEST_INTERSTITIAL_POLICY
  });
  await mc.refreshEntitlements();
  assert.equal(mc.entitlementState, 'not_owned');

  let shownCount = 0;
  harness.setInterstitialHandler(async ({ requestId }) => {
    shownCount += 1;
    return { requestId, status: 'closed', shown: true, closed: true };
  });

  // 120초 미달 + 완료 3회 -> 전면 광고 미표시
  mc.recordActiveTime(90);
  mc.recordMissionCompleted();
  mc.recordMissionCompleted();
  mc.recordMissionCompleted();
  let moves = 0;
  await mc.runResultExitTransition(() => { moves += 1; });
  assert.equal(shownCount, 0);
  assert.equal(moves, 1);

  // 120초 충족 -> 전면 광고 1회 표시 및 이동 1회
  mc.recordActiveTime(40); // 누적 130초
  await mc.runResultExitTransition(() => { moves += 1; });
  assert.equal(shownCount, 1);
  assert.equal(moves, 2);

  // 직후에는 완료 3회 및 180초 미충족으로 차단
  mc.recordMissionCompleted();
  mc.recordMissionCompleted();
  mc.recordMissionCompleted();
  await mc.runResultExitTransition(() => { moves += 1; });
  assert.equal(shownCount, 1);

  // 180초 경과 후 보상 광고 시청 -> 최근 광고 180초 간격 재시작으로 전면 광고 금지
  mc.recordActiveTime(190); // 누적 320초
  const c3 = store.claimMissionReward(state, {
    status: 'completed',
    mission: { id: 'm3' },
    progress: { count: 2, damage: 52 }
  });
  await mc.prepareMissionResult(c3);
  await mc.watchRewardedBonus();

  await mc.runResultExitTransition(() => { moves += 1; });
  assert.equal(shownCount, 1); // 보상 광고 직후 전면 광고 차단 확인

  // 다시 180초 경과 후 광고 미준비(ready=false)이면 기다리지 않고 즉시 이동
  mc.recordActiveTime(185);
  harness.setInterstitialReady(false);
  await mc.runResultExitTransition(() => { moves += 1; });
  assert.equal(shownCount, 1);
  assert.equal(moves, 5);
});

test('8. 기존 코인 상점과 미션 시스템 회귀 검증', async () => {
  const local = createMemoryLocalStorage();
  const storage = new StorageAdapter({ getLocalStorage: () => local });
  const store = new GameStateStore({ storage });
  const state = await store.loadGame();
  const shop = new ShopSystem({ state, persist: (s) => store.persist(s) });
  const missions = new MissionSystem();

  missions.startMission('m4');
  const snap = missions.recordImpact({
    mode: 'planet',
    weapon: 'missile',
    targetIndex: 0,
    damage: 104,
    runId: missions.runId
  });
  assert.equal(snap.status, 'completed');
  const claimed = store.claimMissionReward(state, snap);
  assert.equal(claimed.reward, 300);
  assert.equal(state.progression.coins, 300);

  const buy = shop.buyItem('obsidian');
  assert.equal(buy.ok, true);
  assert.equal(state.progression.coins, 50);
  const equip = shop.equipItem('obsidian');
  assert.equal(equip.ok, true);
  assert.equal(state.progression.equippedSkin, 'obsidian');
});
