import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateMissionStars,
  formatDurationMs,
  getNextStarGoal,
  isValidActiveMs
} from '../src/game/missions/definitions.js';
import { MissionSystem } from '../src/game/missions/MissionSystem.js';
import { StorageAdapter } from '../src/platform/storage.js';
import { GameStateStore } from '../src/game/state.js';

function createMemoryLocalStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => { map.set(key, String(value)); },
    removeItem: (key) => { map.delete(key); },
    dump: (key) => map.get(key)
  };
}

function createFakeClock(start = 1000) {
  let current = start;
  return {
    now: () => current,
    advance(ms) { current += ms; },
    set(ms) { current = ms; }
  };
}

test('1. 별점 경계(3성/2성 직전·정확한 경계·직후·시간 초과 1성)와 잘못된 시간 거부를 검증한다', () => {
  // m1: 3성 <= 8000ms, 2성 <= 16000ms
  assert.equal(evaluateMissionStars('m1', 7999), 3);
  assert.equal(evaluateMissionStars('m1', 8000), 3);
  assert.equal(evaluateMissionStars('m1', 8001), 2);
  assert.equal(evaluateMissionStars('m1', 15999), 2);
  assert.equal(evaluateMissionStars('m1', 16000), 2);
  assert.equal(evaluateMissionStars('m1', 16001), 1);
  assert.equal(evaluateMissionStars('m1', 999999), 1);

  // m3: 3성 <= 6000ms, 2성 <= 12000ms
  assert.equal(evaluateMissionStars('m3', 6000), 3);
  assert.equal(evaluateMissionStars('m3', 6001), 2);
  assert.equal(evaluateMissionStars('m3', 12000), 2);
  assert.equal(evaluateMissionStars('m3', 12001), 1);

  // 유효하지 않은 시간 및 알 수 없는 미션 ID는 0성 반환
  for (const invalid of [0, -1, -5000, NaN, Infinity, -Infinity, 12.5, null, undefined, '8000']) {
    assert.equal(isValidActiveMs(invalid), false);
    assert.equal(evaluateMissionStars('m1', invalid), 0);
  }
  assert.equal(evaluateMissionStars('unknown_mission', 5000), 0);

  // 다음 별 목표 및 경계 근처 포맷 반올림 검증
  assert.deepEqual(getNextStarGoal('m1', 16001), {
    currentStars: 1,
    targetStars: 2,
    targetMaxMs: 16000,
    remainingToSaveMs: 1
  });
  assert.deepEqual(getNextStarGoal('m1', 8001), {
    currentStars: 2,
    targetStars: 3,
    targetMaxMs: 8000,
    remainingToSaveMs: 1
  });
  assert.deepEqual(getNextStarGoal('m1', 8000), {
    currentStars: 3,
    targetStars: null,
    targetMaxMs: null,
    remainingToSaveMs: 0
  });
  assert.equal(formatDurationMs(8000), '8.00초');
  assert.equal(formatDurationMs(8001), '8.01초');
});

test('2. 활성 시간, 지연 프레임 실제 경과시간, 겹친 정지 사유, 완료 후 시간 고정 및 이전 런 차단을 검증한다', () => {
  const clock = createFakeClock(10000);
  const missions = new MissionSystem({ now: clock.now });

  missions.startMission('m3'); // Missile 50 데미지 (26 * 2 = 52)
  const firstRunId = missions.runId;

  // 느린 프레임(350ms 지연)에서도 clamp 없이 실제 경과 시간 포함
  clock.advance(350);
  assert.equal(missions.getSnapshot().activeMs, 350);

  // 첫 발사체 명중 (아직 미완료)
  const step1 = missions.recordImpact({
    mode: 'planet',
    weapon: 'missile',
    targetIndex: 0,
    damage: 26,
    runId: firstRunId
  });
  assert.equal(step1.status, 'active');
  assert.equal(step1.activeMs, 350);

  // 겹친 정지 사유: modal + hidden 동시 활성 후 modal만 해제해도 hidden 때문에 계속 정지
  missions.pause('modal');
  clock.advance(4000);
  missions.pause('hidden');
  clock.advance(6000);
  missions.resume('modal');
  assert.equal(missions.isPaused(), true);
  clock.advance(5000);
  assert.equal(missions.getSnapshot().activeMs, 350);

  // 마지막 정지 사유 해제 시 재개
  missions.resume('hidden');
  assert.equal(missions.isPaused(), false);
  clock.advance(5650); // 누적 활성 시간 = 350 + 5650 = 6000ms (정확한 3성 경계)

  const completed = missions.recordImpact({
    mode: 'planet',
    weapon: 'missile',
    targetIndex: 0,
    damage: 26,
    runId: firstRunId
  });
  assert.equal(completed.status, 'completed');
  assert.equal(completed.activeMs, 6000);
  assert.equal(completed.stars, 3);

  // 완료 후 시계 진행, getSnapshot 반복 호출, pause/resume으로 기록이 변하지 않음
  clock.advance(25000);
  missions.pause('modal');
  missions.resume('modal');
  assert.equal(missions.getSnapshot().activeMs, 6000);
  assert.equal(missions.getSnapshot().stars, 3);

  // 재도전 시작 후 이전 런의 지연 impact는 무시됨
  missions.startMission('m3');
  assert.notEqual(missions.runId, firstRunId);
  assert.equal(missions.getSnapshot().activeMs, 0);
  const stale = missions.recordImpact({
    mode: 'planet',
    weapon: 'missile',
    targetIndex: 0,
    damage: 26,
    runId: firstRunId
  });
  assert.equal(stale, null);
  assert.equal(missions.getSnapshot().progress.damage, 0);
});

test('3. 빠른 재도전만 최고기록을 갱신하고 동률·느린 재도전 및 중복 보상/보너스를 방지한다', async () => {
  const clock = createFakeClock(1000);
  const missions = new MissionSystem({ now: clock.now });
  const local = createMemoryLocalStorage();
  const storage = new StorageAdapter({ getLocalStorage: () => local });
  const store = new GameStateStore({ storage });
  const state = await store.loadGame();

  // 1회차: 10000ms 완료 -> 2성, 첫 완료 보상 100코인, 첫 기록
  missions.startMission('m1');
  for (let i = 0; i < 4; i += 1) {
    missions.recordImpact({ mode: 'planet', weapon: 'meteor', targetIndex: 0, damage: 18, runId: missions.runId });
  }
  clock.advance(10000);
  const snap1 = missions.recordImpact({ mode: 'planet', weapon: 'meteor', targetIndex: 0, damage: 18, runId: missions.runId });
  const res1 = store.claimMissionReward(state, snap1);
  assert.equal(res1.isFirst, true);
  assert.equal(res1.reward, 100);
  assert.equal(res1.isFirstRecord, true);
  assert.equal(res1.isNewRecord, true);
  assert.equal(res1.bestActiveMs, 10000);
  assert.equal(res1.bestStars, 2);
  assert.equal(state.progression.coins, 100);

  // 동일 완료 스냅샷 중복 호출 -> 코인 및 기록 중복 반영 없음
  const dup = store.claimMissionReward(state, snap1);
  assert.equal(dup.isFirst, false);
  assert.equal(dup.reward, 0);
  assert.equal(dup.isNewRecord, false);
  assert.equal(state.progression.coins, 100);

  // 광고 보너스 수령 후 재도전 시에도 보너스 중복 수령 불가
  const bonus1 = store.claimMissionAdBonus(state, 'm1');
  assert.equal(bonus1.bonus, 50);
  assert.equal(state.progression.coins, 150);

  // 2회차: 느린 기록 (14000ms) -> 보상 0, 최고기록 10000ms 유지
  missions.startMission('m1');
  for (let i = 0; i < 4; i += 1) {
    missions.recordImpact({ mode: 'planet', weapon: 'meteor', targetIndex: 0, damage: 18, runId: missions.runId });
  }
  clock.advance(14000);
  const snap2 = missions.recordImpact({ mode: 'planet', weapon: 'meteor', targetIndex: 0, damage: 18, runId: missions.runId });
  const res2 = store.claimMissionReward(state, snap2);
  assert.equal(res2.isFirst, false);
  assert.equal(res2.reward, 0);
  assert.equal(res2.isFirstRecord, false);
  assert.equal(res2.isNewRecord, false);
  assert.equal(res2.bestActiveMs, 10000);
  assert.equal(state.progression.missionRecords.m1.bestActiveMs, 10000);
  assert.equal(state.progression.coins, 150);

  // 3회차: 동률 기록 (10000ms) -> 갱신 아님
  missions.startMission('m1');
  for (let i = 0; i < 4; i += 1) {
    missions.recordImpact({ mode: 'planet', weapon: 'meteor', targetIndex: 0, damage: 18, runId: missions.runId });
  }
  clock.advance(10000);
  const snap3 = missions.recordImpact({ mode: 'planet', weapon: 'meteor', targetIndex: 0, damage: 18, runId: missions.runId });
  const res3 = store.claimMissionReward(state, snap3);
  assert.equal(res3.isNewRecord, false);
  assert.equal(res3.bestActiveMs, 10000);

  // 4회차: 빠른 기록 (7500ms) -> 최고기록 갱신(3성), 반복 보상 0, 광고 보너스 재수령 불가
  missions.startMission('m1');
  for (let i = 0; i < 4; i += 1) {
    missions.recordImpact({ mode: 'planet', weapon: 'meteor', targetIndex: 0, damage: 18, runId: missions.runId });
  }
  clock.advance(7500);
  const snap4 = missions.recordImpact({ mode: 'planet', weapon: 'meteor', targetIndex: 0, damage: 18, runId: missions.runId });
  const res4 = store.claimMissionReward(state, snap4);
  assert.equal(res4.isFirst, false);
  assert.equal(res4.reward, 0);
  assert.equal(res4.isFirstRecord, false);
  assert.equal(res4.isNewRecord, true);
  assert.equal(res4.previousBestMs, 10000);
  assert.equal(res4.bestActiveMs, 7500);
  assert.equal(res4.bestStars, 3);
  assert.equal(state.progression.missionRecords.m1.bestActiveMs, 7500);
  assert.equal(state.progression.coins, 150);
  assert.equal(store.claimMissionAdBonus(state, 'm1'), null);
});

test('4. v6 기록 복원·필드 정규화 및 실패 저장 후 복구를 검증한다', async () => {
  const corruptedV6 = JSON.stringify({
    schemaVersion: 6,
    mode: 'planet',
    weapon: 'meteor',
    progression: {
      coins: 250,
      completedMissions: ['m1'],
      rewardedMissionIds: ['m1'],
      missionRecords: {
        m1: { bestActiveMs: 7400 },
        unknown_id: { bestActiveMs: 5000 },
        m2: { bestActiveMs: 0 },
        m3: { bestActiveMs: -120 },
        m4: { bestActiveMs: 1234.5 },
        m5: { bestActiveMs: Infinity },
        m6: ['invalid']
      },
      ownedSkins: ['earth'],
      equippedSkin: 'earth'
    }
  });

  const local = createMemoryLocalStorage({ 'solar-smash-3d.save': corruptedV6 });
  let failNextWrite = false;
  let pendingWrite = null;
  const writes = [];

  const storage = new StorageAdapter({
    getLocalStorage: () => ({
      getItem: (k) => local.getItem(k),
      setItem: (k, v) => {
        if (failNextWrite) throw new Error('simulated write error');
        writes.push(JSON.parse(v));
        local.setItem(k, v);
      }
    })
  });

  const store = new GameStateStore({ storage });
  const state = await store.loadGame();

  // 유효한 m1 기록만 보존되고 잘못된 필드들은 제거됨
  assert.deepEqual(state.progression.missionRecords, { m1: { bestActiveMs: 7400 } });

  // 쓰기 실패 후에도 다음 저장에서 복구 및 스냅샷 순서 보존
  failNextWrite = true;
  const failedSave = await store.claimMissionReward(state, {
    status: 'completed',
    mission: { id: 'm2' },
    progress: { count: 10, damage: 100 },
    activeMs: 9000
  }).whenSaved;
  assert.equal(failedSave, false);

  failNextWrite = false;
  pendingWrite = store.claimMissionReward(state, {
    status: 'completed',
    mission: { id: 'm2' },
    progress: { count: 10, damage: 100 },
    activeMs: 7800
  }).whenSaved;
  assert.equal(await pendingWrite, true);

  const finalSaved = JSON.parse(local.dump('solar-smash-3d.save'));
  assert.equal(finalSaved.schemaVersion, 6);
  assert.deepEqual(finalSaved.progression.missionRecords, {
    m1: { bestActiveMs: 7400 },
    m2: { bestActiveMs: 7800 }
  });
});

test('기록 필드는 미완료 미션을 완료시키거나 레거시 세이브의 첫 보상을 소모하지 않는다', async () => {
  for (const version of [2, 3, 4, 5, 6]) {
    const local = createMemoryLocalStorage({ 'solar-smash-3d.save': JSON.stringify({
      schemaVersion: version,
      progression: {
        coins: 100, completedMissions: ['m1'], rewardedMissionIds: ['m2'],
        missionRecords: { m1: { bestActiveMs: 7000 }, m2: { bestActiveMs: 5000 } }
      }
    }) });
    const store = new GameStateStore({ storage: new StorageAdapter({ getLocalStorage: () => local }) });
    const state = await store.loadGame();
    assert.deepEqual(state.progression.completedMissions, ['m1']);
    assert.deepEqual(state.progression.rewardedMissionIds, []);
    assert.deepEqual(state.progression.missionRecords, version === 6 ? { m1: { bestActiveMs: 7000 } } : {});
    const result = store.claimMissionReward(state, {
      mission: { id: 'm2' }, status: 'completed', progress: { count: 10, damage: 100 }
    });
    assert.equal(result.reward, 150);
    assert.equal(result.activeMs, null);
    assert.equal(state.progression.missionRecords.m2, undefined);
    await result.whenSaved;
  }
});

test('기록 저장은 지연된 Preferences에서도 불변 스냅샷과 순서를 유지한다', async () => {
  let releaseFirst;
  let signalEntered;
  const entered = new Promise((resolve) => { signalEntered = resolve; });
  const gate = new Promise((resolve) => { releaseFirst = resolve; });
  const writes = [];
  let pending = 0, maxPending = 0;
  const storage = new StorageAdapter({
    isNative: true,
    getLocalStorage: () => createMemoryLocalStorage(),
    preferencesLoader: async () => ({
      get: async () => ({ value: null }),
      async set({ value }) {
        pending++;
        maxPending = Math.max(maxPending, pending);
        if (writes.length === 0) { signalEntered(); await gate; }
        writes.push(JSON.parse(value));
        pending--;
      }
    })
  });
  const store = new GameStateStore({ storage });
  const state = await store.loadGame();
  const completion = (activeMs) => ({
    mission: { id: 'm1' }, status: 'completed', progress: { count: 5, damage: 90 }, activeMs
  });
  const first = store.claimMissionReward(state, completion(10000));
  await entered;
  const improved = store.claimMissionReward(state, completion(7000));
  assert.equal(writes.length, 0);
  releaseFirst();
  assert.equal(await first.whenSaved, true);
  assert.equal(await improved.whenSaved, true);
  assert.equal(maxPending, 1);
  assert.deepEqual(writes.map((save) => save.progression.missionRecords.m1.bestActiveMs), [10000, 7000]);
  assert.deepEqual(writes.map((save) => save.progression.coins), [100, 100]);
});

test('정지 중 타격은 진행되지 않고 동기 레이저 완료도 시간을 고정한다', () => {
  const clock = createFakeClock();
  const missions = new MissionSystem({ now: clock.now });
  missions.startMission('m2');
  const impact = { mode: 'planet', weapon: 'laser', targetIndex: 0, damage: 10, runId: missions.runId };
  clock.advance(500);
  missions.pause('settings');
  assert.equal(missions.recordImpact(impact), null);
  assert.equal(missions.getSnapshot().progress.count, 0);
  clock.advance(20000);
  missions.resume('settings');
  assert.equal(missions.getSnapshot().stars, 0);
  for (let i = 0; i < 10; i++) missions.recordImpact(impact);
  assert.equal(missions.getSnapshot().activeMs, 500);
  assert.equal(missions.getSnapshot().stars, 3);
  clock.advance(100000);
  assert.equal(missions.getSnapshot().activeMs, 500);
});
