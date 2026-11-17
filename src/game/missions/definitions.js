export const MISSIONS = [
  {
    id: 'm1',
    title: '운석 투하',
    desc: 'Meteor를 5회 명중시키세요.',
    mode: 'planet',
    req: { weapon: 'meteor', count: 5 },
    reward: 100,
    stars: { threeStarMaxMs: 8000, twoStarMaxMs: 16000 }
  },
  {
    id: 'm2',
    title: '레이저 커팅',
    desc: 'Laser로 10회 타격하세요.',
    mode: 'planet',
    req: { weapon: 'laser', count: 10 },
    reward: 150,
    stars: { threeStarMaxMs: 8000, twoStarMaxMs: 16000 }
  },
  {
    id: 'm3',
    title: '미사일 폭격',
    desc: 'Missile로 50 데미지를 입히세요.',
    mode: 'planet',
    req: { weapon: 'missile', damage: 50 },
    reward: 200,
    stars: { threeStarMaxMs: 6000, twoStarMaxMs: 12000 }
  },
  {
    id: 'm4',
    title: '행성 파괴자',
    desc: '아무 무기로 100 데미지를 입히세요.',
    mode: 'planet',
    req: { damage: 100 },
    reward: 300,
    stars: { threeStarMaxMs: 12000, twoStarMaxMs: 24000 }
  },
  {
    id: 'm5',
    title: '태양계 정복',
    desc: 'Solar의 작은 행성을 3회 타격하세요. 태양은 제외됩니다.',
    mode: 'solar',
    req: { count: 3, excludeTargetIndex: [0] },
    reward: 400,
    stars: { threeStarMaxMs: 12000, twoStarMaxMs: 24000 }
  },
  {
    id: 'm6',
    title: '마스터 타격가',
    desc: '한 번의 미션에서 200 데미지를 달성하세요.',
    mode: 'planet',
    req: { damage: 200 },
    reward: 500,
    stars: { threeStarMaxMs: 20000, twoStarMaxMs: 40000 }
  }
];

export function getMission(id) {
  return MISSIONS.find((mission) => mission.id === id) || null;
}

export function isGoalReached(mission, progress) {
  return Boolean(mission && progress
    && Number.isFinite(progress.count) && progress.count >= 0
    && Number.isFinite(progress.damage) && progress.damage >= 0
    && (!mission.req.count || progress.count >= mission.req.count)
    && (!mission.req.damage || progress.damage >= mission.req.damage));
}

export function isValidActiveMs(value) {
  return Number.isSafeInteger(value) && value > 0;
}

export function evaluateMissionStars(missionOrId, activeMs) {
  const id = typeof missionOrId === 'string' ? missionOrId : missionOrId?.id;
  const mission = getMission(id);
  if (!mission || !isValidActiveMs(activeMs)) return 0;
  if (activeMs <= mission.stars.threeStarMaxMs) return 3;
  if (activeMs <= mission.stars.twoStarMaxMs) return 2;
  return 1;
}

export function getNextStarGoal(missionOrId, activeMs) {
  const id = typeof missionOrId === 'string' ? missionOrId : missionOrId?.id;
  const mission = getMission(id);
  const stars = evaluateMissionStars(mission, activeMs);
  if (!mission || stars === 0) return null;
  if (stars === 1) {
    return {
      currentStars: 1,
      targetStars: 2,
      targetMaxMs: mission.stars.twoStarMaxMs,
      remainingToSaveMs: activeMs - mission.stars.twoStarMaxMs
    };
  }
  if (stars === 2) {
    return {
      currentStars: 2,
      targetStars: 3,
      targetMaxMs: mission.stars.threeStarMaxMs,
      remainingToSaveMs: activeMs - mission.stars.threeStarMaxMs
    };
  }
  return {
    currentStars: 3,
    targetStars: null,
    targetMaxMs: null,
    remainingToSaveMs: 0
  };
}

export function formatDurationMs(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '0.00초';
  if (ms === 0) return '0.00초';
  // Round up to the nearest 10ms so a missed threshold (e.g. 8001ms > 8000ms) never displays as 8.00초.
  const centiseconds = Math.ceil(ms / 10);
  return (centiseconds / 100).toFixed(2) + '초';
}
