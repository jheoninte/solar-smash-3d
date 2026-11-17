import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { MISSIONS } from '../src/game/missions/definitions.js';
import { WEAPONS } from '../src/game/weapons/definitions.js';
import { SHOP_ITEMS } from '../src/game/shop/definitions.js';
import { REWARDED_POLICY } from '../src/game/monetization/config.js';

// Design calculation only: this candidate is never imported by the game.
const candidate = JSON.parse(await readFile(new URL('../docs/BALANCE_CANDIDATE.json', import.meta.url), 'utf8'));
const sum = (values) => values.reduce((total, value) => total + value, 0);
const sec = (ms) => (ms / 1000).toFixed(2);
assert.equal(candidate.status, 'proposal-not-runtime');
const existingIds = new Set(MISSIONS.map((mission) => mission.id));
const proposedIds = new Set();
for (const mission of candidate.missions) {
  assert.ok(!existingIds.has(mission.id), 'Candidate must append missions, never replace existing records.');
  assert.ok(!proposedIds.has(mission.id));
  proposedIds.add(mission.id);
}
for (const id of candidate.protectedMissionIds) assert.ok(existingIds.has(id));

function optionsFor(mission) {
  const req = mission.req;
  if (req.weaponCounts) return [req.weaponCounts];
  const weapons = req.weapon ? [req.weapon] : Object.keys(WEAPONS);
  return weapons.map((weapon) => ({ [weapon]: Math.max(
    req.count || 0,
    Math.ceil((req.damage || 0) / WEAPONS[weapon].damage),
    sum(Object.values(req.targetCounts || {}))
  ) }));
}

function lowerBound(mission, tapIntervalMs = 0) {
  const plans = optionsFor(mission).map((counts) => {
    let spent = 0, lastInterval = 0;
    for (const [weapon, count] of Object.entries(counts)) {
      assert.ok(Number.isSafeInteger(count) && count > 0);
      const cooldown = candidate.cooldownMs[weapon];
      assert.ok(Number.isSafeInteger(cooldown) && cooldown > 0);
      const interval = tapIntervalMs ? Math.ceil(cooldown / tapIntervalMs) * tapIntervalMs : cooldown;
      spent += count * interval;
      lastInterval = Math.max(lastInterval, interval);
    }
    // First shot is available immediately; put a longest-cooldown shot last.
    return { counts, ms: spent - lastInterval };
  });
  return plans.sort((left, right) => left.ms - right.ms)[0];
}

const rows = candidate.missions.map((mission) => {
  const ideal = lowerBound(mission);
  assert.ok(mission.stars.threeStarMaxMs > ideal.ms, `${mission.id}: impossible three-star candidate`);
  assert.ok(mission.stars.twoStarMaxMs > mission.stars.threeStarMaxMs);
  assert.ok(Number.isSafeInteger(mission.reward) && mission.reward > 0);
  return `| ${mission.id} ${mission.title} | ${Object.entries(ideal.counts).map(([weapon, count]) => `${weapon} ${count}발`).join(' + ')} | ${sec(ideal.ms)} | ${sec(lowerBound(mission, 500).ms)} | ${sec(mission.stars.threeStarMaxMs)} / ${sec(mission.stars.twoStarMaxMs)} |`;
});

const oldRewards = sum(MISSIONS.map((mission) => mission.reward));
const newRewards = sum(candidate.missions.map((mission) => mission.reward));
const oldPrices = sum(SHOP_ITEMS.map((skin) => skin.price));
const newPrices = sum(candidate.skins.map((skin) => skin.price));
const maxBonus = sum([...MISSIONS, ...candidate.missions].map((mission) => Math.floor(mission.reward * REWARDED_POLICY.bonusFraction)));
assert.ok(oldRewards + newRewards >= oldPrices + newPrices, 'All cosmetics must remain obtainable without ads.');
const skinIds = new Set(SHOP_ITEMS.map((skin) => skin.id));
for (const skin of candidate.skins) {
  assert.ok(!skinIds.has(skin.id));
  assert.ok(Number.isSafeInteger(skin.price) && skin.price > 0);
  skinIds.add(skin.id);
}

let coins = 0, skinIndex = 0;
const paidSkins = [...SHOP_ITEMS, ...candidate.skins].filter((skin) => skin.price > 0);
const milestones = [];
for (const mission of [...MISSIONS, ...candidate.missions]) {
  coins += mission.reward;
  while (skinIndex < paidSkins.length && coins >= paidSkins[skinIndex].price) {
    const skin = paidSkins[skinIndex++];
    coins -= skin.price;
    milestones.push(`| ${skin.name} | ${skin.price} | ${mission.id} 완료 후 | ${coins} |`);
  }
}
assert.equal(skinIndex, paidSkins.length);

const report = `# 밸런스 계산 보고서\n\n` +
  `현재 런타임 데이터와 BALANCE_CANDIDATE.json의 제안을 계산했다. **실제 플레이테스트·FPS 측정·리텐션 실험이 아니다. 제안은 아직 게임에 적용하지 않았다.**\n\n` +
  `## 현재 확인한 문제\n\n` +
  `- 수동 탭 공격에는 발사 간격 제한이 없고 레이저는 탭 즉시 명중한다. 자동공격은 이미 운석 ${WEAPONS.meteor.autoIntervalMs}ms·레이저 ${WEAPONS.laser.autoIntervalMs}ms·미사일 ${WEAPONS.missile.autoIntervalMs}ms 간격을 적용한다. 아래 챌린지 전용 공통 대기는 아직 미구현이다. 피해 목표에 필요한 발사 수는 m3 ${Math.ceil(MISSIONS.find((m) => m.id === 'm3').req.damage / WEAPONS.missile.damage)}발, m4 미사일 ${Math.ceil(MISSIONS.find((m) => m.id === 'm4').req.damage / WEAPONS.missile.damage)}발, m6 미사일 ${Math.ceil(MISSIONS.find((m) => m.id === 'm6').req.damage / WEAPONS.missile.damage)}발이다.\n` +
  `- 기존 첫 완료 보상 ${oldRewards}코인, 기존 외형 전체 가격 ${oldPrices}코인으로 기존 콘텐츠를 마치면 ${oldRewards - oldPrices}코인이 남는다. 추가 목표 없이 숫자만 늘리면 반복 탭을 늘릴 수 있다.\n\n` +
  `## 제안의 시간 하한 (초)\n\n` +
  `기존 m1~m6와 샌드박스는 변경하지 않는다. 아래는 새 챌린지 전용 간격을 적용한 계산이다. 첫 발사는 즉시 가능하며 마지막 발사 후 재사용 대기는 제외한다. 비행·조준·무기 교체·오발·기기 성능·사용자 반응은 포함하지 않는다. 500ms 열도 일정한 간격의 이상적인 탭 가정일 뿐 평균 사용자 예측이 아니다. 두 시간 열은 각각 가능한 발사 계획 중 최소값이며, 자유 무기 미션에서는 다른 무기가 선택될 수 있다. 혼합 무기는 마지막에 가장 긴 간격의 무기를 쓴다고 가정한다.\n\n` +
  `| 미션 | 이상적인 발사 계획 | 입력 무제한 하한 | 500ms 탭 하한 | 3성 / 2성 임시 기준 |\n| --- | --- | --- | --- | --- |\n${rows.join('\n')}\n\n` +
  `## 오프라인 경제\n\n` +
  `기존+신규 첫 완료 보상 ${oldRewards + newRewards}코인 = 기존+신규 외형 총 가격 ${oldPrices + newPrices}코인. 새 챌린지는 총 ${newRewards}코인이고 신규 외형은 총 ${newPrices}코인이다. 광고·결제·반복 보상 없이 모두 구매할 수 있다. 기존 소유 외형을 다시 차감하지 않는다. 전 미션의 선택형 광고 보너스까지 전부 받은 가정의 추가 재화는 최대 ${maxBonus}코인이며 필수 수입에 포함하지 않는다. 이는 광고가 실제 채워지거나 활성화됐다는 뜻이 아니다.\n\n` +
  `아래는 m1부터 순서대로 완료하고 가장 저렴한 미소유 외형부터 구입하는 한 가지 예시다. 상점 강제 구매/순차 잠금을 뜻하지 않는다.\n\n` +
  `| 외형 | 가격 | 첫 구매 가능 시점 | 구매 직후 잔액 |\n| --- | --- | --- | --- |\n${milestones.join('\n')}\n\n` +
  `재계산: node scripts/audit-balance.mjs. 실제 구현 후 후보를 런타임으로 통합하면 이 제안 비교용 스크립트도 현재 정의를 중복 합산하지 않도록 함께 갱신한다.\n`;
await writeFile(new URL('../docs/BALANCE_AUDIT.md', import.meta.url), report, 'utf8');
console.log(`Balance proposal checked: ${candidate.missions.length} new missions, ${candidate.skins.length} new cosmetics; no-ad economy ${oldRewards + newRewards}/${oldPrices + newPrices} coins.`);
