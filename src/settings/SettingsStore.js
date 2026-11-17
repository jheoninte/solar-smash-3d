const DEFAULTS = { soundEnabled: true, volume: 0.35, hapticsEnabled: true, tutorialDismissed: false };

export class SettingsStore {
  constructor(storage) {
    this.storage = storage;
    this.key = 'solar-smash-3d.settings.v1';
    this.settings = { ...DEFAULTS };
    this.status = { isSaving: false, storage: true, blocked: false, hasSaved: false };
    this.pending = 0;
  }

  async load() {
    const result = await this.storage.load(this.key, {
      validate: (value) => value !== null && typeof value === 'object'
        && !Array.isArray(value) && value.settingsVersion === 1
    });
    const data = result.data || {};
    for (const key of Object.keys(DEFAULTS)) {
      this.settings[key] = key === 'volume'
        ? Number.isFinite(data[key]) ? Math.max(0, Math.min(1, data[key])) : DEFAULTS[key]
        : typeof data[key] === 'boolean' ? data[key] : DEFAULTS[key];
    }
    this.status.storage = result.persisted;
    this.status.blocked = !result.writable;
    return this.settings;
  }

  set(key, value) {
    if (!Object.hasOwn(DEFAULTS, key)) return Promise.resolve(false);
    if (key === 'volume') {
      if (!Number.isFinite(value)) return Promise.resolve(false);
      value = Math.max(0, Math.min(1, value));
    } else if (typeof value !== 'boolean') return Promise.resolve(false);
    this.settings[key] = value;
    return this.save();
  }

  async save() {
    if (this.status.blocked) return false;
    this.pending += 1;
    this.status.isSaving = true;
    let success = false;
    try { success = await this.storage.save(this.key, { settingsVersion: 1, ...this.settings }); }
    catch { /* The current session still uses the user's chosen settings. */ }
    finally {
      this.status.isSaving = --this.pending > 0;
      this.status.storage = success;
      this.status.hasSaved = success;
    }
    return success;
  }
}
