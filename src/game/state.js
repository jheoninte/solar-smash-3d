import { evaluateMissionStars, getMission, isGoalReached, isValidActiveMs } from './missions/definitions.js';
import { REWARDED_POLICY } from './monetization/config.js';
import { DEFAULT_SKIN, getSkin } from './shop/definitions.js';
import { StorageAdapter } from '../platform/storage.js';

const DEFAULT_SCHEMA = {
  schemaVersion: 6,
  storageKey: 'solar-smash-3d.save',
  defaults: {
    mode: 'planet',
    weapon: 'meteor',
    stats: {
      damage: 0,
      impactCount: 0
    },
    session: {
      recentImpacts: []
    },
    progression: {
      coins: 0,
      completedMissions: [],
      rewardedMissionIds: [],
      missionRecords: {},
      ownedSkins: [DEFAULT_SKIN],
      equippedSkin: DEFAULT_SKIN
    }
  }
};

function cloneDefaults(schema) {
  return JSON.parse(JSON.stringify(schema.defaults));
}

async function loadSchema() {
  try {
    const response = await fetch(new URL('../../docs/SAVE_SCHEMA.json', import.meta.url));
    if (!response.ok) return DEFAULT_SCHEMA;
    return await response.json();
  } catch {
    return DEFAULT_SCHEMA;
  }
}

function normalizeMissionRecords(rawRecords, completedMissions) {
  if (!rawRecords || typeof rawRecords !== 'object' || Array.isArray(rawRecords)) {
    return {};
  }
  const normalized = {};
  for (const [id, entry] of Object.entries(rawRecords)) {
    if (!getMission(id) || !completedMissions.includes(id)) continue;
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    if (!isValidActiveMs(entry.bestActiveMs)) continue;
    normalized[id] = { bestActiveMs: entry.bestActiveMs };
  }
  return normalized;
}

function mergeRuntimeState(schema, storedState) {
  const defaults = cloneDefaults(schema);
  const count = (value) => Number.isFinite(value) && value >= 0 ? value : 0;
  const ownedSkins = [...new Set([DEFAULT_SKIN, ...(Array.isArray(storedState?.progression?.ownedSkins)
    ? storedState.progression.ownedSkins.filter((id) => getSkin(id)) : [])])];
  const equippedSkin = ownedSkins.includes(storedState?.progression?.equippedSkin)
    ? storedState.progression.equippedSkin : DEFAULT_SKIN;
  const rawCompleted = Array.isArray(storedState?.progression?.completedMissions)
    ? storedState.progression.completedMissions.filter((id) => getMission(id))
    : [];
  const completedMissions = [...new Set(rawCompleted)];
  // Legacy saves predate timing. A stray record cannot create a completion or
  // consume a first-clear reward when recovering partially corrupted data.
  const missionRecords = storedState?.schemaVersion === 6
    ? normalizeMissionRecords(storedState?.progression?.missionRecords, completedMissions)
    : {};
  const rewardedMissionIds = Array.isArray(storedState?.progression?.rewardedMissionIds)
    ? [...new Set(storedState.progression.rewardedMissionIds.filter(
      (id) => getMission(id) && completedMissions.includes(id)
    ))]
    : [];
  const impacts = Array.isArray(storedState?.session?.recentImpacts)
    ? storedState.session.recentImpacts.filter((impact) => {
      const position = impact?.localPosition;
      return ['planet', 'solar'].includes(impact?.mode)
        && ['meteor', 'laser', 'missile'].includes(impact?.weapon)
        && Number.isInteger(impact?.targetIndex) && impact.targetIndex >= 0
        && impact.targetIndex < (impact.mode === 'planet' ? 1 : 3)
        && Number.isFinite(impact.size) && impact.size > 0 && impact.size <= 1
        && Number.isFinite(impact.damage) && impact.damage >= 0
        && position && [position.x, position.y, position.z].every(Number.isFinite)
        && Math.hypot(position.x, position.y, position.z) > 0;
    }).slice(-120)
    : [];
  return {
    mode: ['planet', 'solar'].includes(storedState?.mode) ? storedState.mode : defaults.mode,
    weapon: ['meteor', 'laser', 'missile'].includes(storedState?.weapon) ? storedState.weapon : defaults.weapon,
    stats: {
      damage: count(storedState?.stats?.damage),
      impactCount: count(storedState?.stats?.impactCount)
    },
    session: {
      recentImpacts: impacts
    },
    progression: {
      coins: Number.isSafeInteger(storedState?.progression?.coins) && storedState.progression.coins >= 0
        ? storedState.progression.coins : 0,
      completedMissions,
      rewardedMissionIds,
      missionRecords,
      ownedSkins,
      equippedSkin
    },
    capabilities: {
      hubGame: Boolean(globalThis.window?.HubGame),
      storage: true,
      storageBlocked: false,
      hasSaved: false,
      isSaving: false
    }
  };
}

export class GameStateStore {
  constructor({ storage = new StorageAdapter() } = {}) {
    this.schema = DEFAULT_SCHEMA;
    this.storageKey = DEFAULT_SCHEMA.storageKey;
    this.storage = storage;
    this.saveRequests = 0;
  }

  async loadGame() {
    this.schema = await loadSchema();
    this.schema.schemaVersion = DEFAULT_SCHEMA.schemaVersion;
    this.storageKey = this.schema.storageKey || DEFAULT_SCHEMA.storageKey;

    const loaded = await this.storage.load(this.storageKey);
    const state = mergeRuntimeState(this.schema, loaded.data);
    state.capabilities.storage = loaded.persisted;
    state.capabilities.storageBlocked = !loaded.writable;
    return state;
  }

  setMode(state, mode) {
    state.mode = mode;
    return this.persist(state);
  }

  setWeapon(state, weapon) {
    state.weapon = weapon;
    return this.persist(state);
  }

  recordImpact(state, impact) {
    const { runId, ...savedImpact } = impact;
    state.session.recentImpacts.push(savedImpact);
    state.stats.damage += impact.damage;
    state.stats.impactCount += 1;
    if (state.session.recentImpacts.length > 120) {
      state.session.recentImpacts.splice(0, state.session.recentImpacts.length - 120);
    }
    return this.persist(state);
  }

  resetSession(state) {
    state.stats.damage = 0;
    state.stats.impactCount = 0;
    state.session.recentImpacts = [];
    return this.persist(state);
  }

  claimMissionReward(state, completion) {
    const mission = getMission(completion?.mission?.id);
    if (completion?.status !== 'completed' || !isGoalReached(mission, completion.progress)) return null;
    const isFirst = !state.progression.completedMissions.includes(mission.id);
    const reward = isFirst ? mission.reward : 0;
    if (isFirst) {
      state.progression.completedMissions.push(mission.id);
      state.progression.coins = Math.min(Number.MAX_SAFE_INTEGER, state.progression.coins + reward);
    }

    const hasValidTime = isValidActiveMs(completion?.activeMs);
    const activeMs = hasValidTime ? completion.activeMs : null;
    const stars = hasValidTime ? evaluateMissionStars(mission, activeMs) : 0;

    const existingRecord = state.progression.missionRecords[mission.id];
    const previousBestMs = isValidActiveMs(existingRecord?.bestActiveMs) ? existingRecord.bestActiveMs : null;
    const previousStars = previousBestMs !== null ? evaluateMissionStars(mission, previousBestMs) : 0;

    let isFirstRecord = false;
    let isNewRecord = false;
    let bestActiveMs = previousBestMs;
    let bestStars = previousStars;

    if (hasValidTime) {
      if (previousBestMs === null) {
        isFirstRecord = true;
        isNewRecord = true;
        bestActiveMs = activeMs;
        bestStars = stars;
        state.progression.missionRecords[mission.id] = { bestActiveMs };
      } else if (activeMs < previousBestMs) {
        isNewRecord = true;
        bestActiveMs = activeMs;
        bestStars = stars;
        state.progression.missionRecords[mission.id] = { bestActiveMs };
      }
    }

    const whenSaved = this.persist(state);
    return {
      mission,
      reward,
      isFirst,
      whenSaved,
      activeMs,
      stars,
      previousBestMs,
      previousStars,
      bestActiveMs,
      bestStars,
      isFirstRecord,
      isNewRecord
    };
  }

  claimMissionAdBonus(state, missionId) {
    const mission = getMission(missionId);
    if (!mission) return null;
    if (!state.progression.completedMissions.includes(mission.id)) return null;
    if (state.progression.rewardedMissionIds.includes(mission.id)) return null;
    const bonus = Math.max(0, Math.floor(mission.reward * REWARDED_POLICY.bonusFraction));
    if (bonus <= 0) return null;
    state.progression.rewardedMissionIds.push(mission.id);
    state.progression.coins = Math.min(Number.MAX_SAFE_INTEGER, state.progression.coins + bonus);
    const whenSaved = this.persist(state);
    return { mission, bonus, whenSaved };
  }

  async persist(state) {
    if (state.capabilities.storageBlocked) return false;
    const payload = {
      schemaVersion: this.schema.schemaVersion,
      mode: state.mode,
      weapon: state.weapon,
      stats: state.stats,
      session: state.session,
      progression: state.progression
    };
    this.saveRequests += 1;
    state.capabilities.isSaving = true;
    let success = false;
    try { success = await this.storage.save(this.storageKey, payload); }
    catch { /* Keep memory progress and allow later writes to recover. */ }
    finally {
      this.saveRequests -= 1;
      state.capabilities.isSaving = this.saveRequests > 0;
      state.capabilities.storage = success;
      state.capabilities.hasSaved = success;
    }
    return success;
  }
}
