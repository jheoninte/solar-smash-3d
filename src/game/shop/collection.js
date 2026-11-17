import { SHOP_ITEMS } from './definitions.js';
import { MISSIONS } from '../missions/definitions.js';

export function getCollectionGoal(progression) {
  const owned = Array.isArray(progression?.ownedSkins) ? progression.ownedSkins : [];
  const coins = Number.isSafeInteger(progression?.coins) && progression.coins >= 0 ? progression.coins : 0;
  const item = SHOP_ITEMS.filter((entry) => entry.price > 0 && !owned.includes(entry.id))
    .sort((a, b) => a.price - b.price)[0];
  if (!item) return null;
  const completed = Array.isArray(progression?.completedMissions) ? progression.completedMissions : [];
  const mission = MISSIONS.find((entry) => !completed.includes(entry.id)) || null;
  return {
    id: item.id, name: item.name, price: item.price,
    coins, missingCoins: Math.max(0, item.price - coins),
    progress: Math.min(item.price, coins),
    missionId: mission?.id || null, missionTitle: mission?.title || null
  };
}
