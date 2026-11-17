import test from 'node:test';
import assert from 'node:assert/strict';
import { AutoFireController } from '../src/game/weapons/AutoFireController.js';
import { getCollectionGoal } from '../src/game/shop/collection.js';
import { SHOP_ITEMS } from '../src/game/shop/definitions.js';
import { MISSIONS } from '../src/game/missions/definitions.js';

test('auto fire respects cadence and never catches up in a burst after a long frame', () => {
  let time = 1000, shots = 0;
  const controller = new AutoFireController({ now: () => time });
  const tick = () => controller.update(450, () => { shots++; return true; });
  assert.equal(tick(), false);
  controller.toggle();
  assert.equal(tick(), true);
  assert.equal(tick(), false);
  time = 1449;
  assert.equal(tick(), false);
  time = 1450;
  assert.equal(tick(), true);
  time = 99999;
  assert.equal(tick(), true);
  assert.equal(tick(), false);
  assert.equal(shots, 3);
});

test('stop inside a shot callback stays stopped until an explicit restart', () => {
  const changes = [];
  const controller = new AutoFireController({ now: () => 1000, onChange: (value) => changes.push(value) });
  controller.toggle();
  assert.equal(controller.update(700, () => { controller.stop(); return true; }), true);
  assert.equal(controller.enabled, false);
  assert.equal(controller.update(700, () => assert.fail('shot after stop')), false);
  controller.stop();
  controller.toggle();
  assert.equal(controller.update(700, () => true), true);
  controller.toggle();
  assert.deepEqual(changes, [true, false, true, false]);
});

test('misses retry promptly without firing each frame; invalid intervals do nothing', () => {
  let time = 1000, attempts = 0;
  const controller = new AutoFireController({ now: () => time });
  controller.toggle();
  const miss = () => { attempts++; return false; };
  controller.update(1100, miss);
  time += 99;
  controller.update(1100, miss);
  assert.equal(attempts, 1);
  time++;
  controller.update(1100, miss);
  assert.equal(attempts, 2);
  for (const interval of [0, -1, NaN, Infinity]) controller.update(interval, () => assert.fail('invalid interval'));
});

test('collection goals reflect the next affordable target without mutating progression', () => {
  const progression = { coins: 150, ownedSkins: ['earth'], completedMissions: [MISSIONS[0].id] };
  const original = structuredClone(progression);
  const goal = getCollectionGoal(progression);
  assert.equal(goal.id, 'obsidian');
  assert.equal(goal.missingCoins, 100);
  assert.equal(goal.progress, 150);
  assert.equal(goal.missionId, MISSIONS[1].id);
  assert.deepEqual(progression, original);
  progression.coins = 999;
  assert.equal(getCollectionGoal(progression).missingCoins, 0);
  assert.equal(getCollectionGoal(progression).progress, 250);
  progression.ownedSkins.push('obsidian');
  assert.equal(getCollectionGoal(progression).id, 'ember');
});

test('collection goals handle completed collections, all missions complete and invalid coins', () => {
  assert.equal(getCollectionGoal({ ownedSkins: SHOP_ITEMS.map((item) => item.id) }), null);
  assert.equal(getCollectionGoal({ completedMissions: MISSIONS.map((mission) => mission.id) }).missionId, null);
  for (const coins of [-1, NaN, Infinity, 1.5]) assert.equal(getCollectionGoal({ coins }).coins, 0);
});
