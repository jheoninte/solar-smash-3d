function parseSave(raw, validate) {
  const data = JSON.parse(raw);
  if (validate) {
    if (!validate(data)) throw new Error('Unrecognized settings format');
    return data;
  }
  const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
  if (!object(data) || !['mode', 'weapon', 'stats', 'session', 'progression'].some((key) => key in data)
    || (data.schemaVersion !== undefined && ![2, 3, 4, 5, 6].includes(data.schemaVersion))
    || ['stats', 'session', 'progression'].some((key) => key in data && !object(data[key]))) {
    throw new Error('Unrecognized save format');
  }
  return data;
}

// No SDK imports here: both adapters and delayed/failing storage can be injected.
export class StorageAdapter {
  constructor({ isNative = false, preferencesLoader,
    getLocalStorage = () => globalThis.localStorage } = {}) {
    this.isNative = isNative;
    this.preferencesLoader = preferencesLoader;
    this.getLocalStorage = getLocalStorage;
    this.loadedKeys = new Set();
    this.tail = Promise.resolve();
  }

  preferences() {
    this.preferencesPromise ??= Promise.resolve().then(() => this.preferencesLoader());
    return this.preferencesPromise;
  }

  async load(key, { validate } = {}) {
    this.loadedKeys.delete(key);
    try {
      let raw;
      if (this.isNative) {
        const preferences = await this.preferences();
        raw = (await preferences.get({ key })).value;
        if (raw === null) {
          const legacy = this.getLocalStorage().getItem(key);
          if (legacy !== null) {
            const data = parseSave(legacy, validate);
            // Keep the source intact even after successful migration.
            this.loadedKeys.add(key);
            try {
              await preferences.set({ key, value: legacy });
              return { data, writable: true, persisted: true, migrated: true };
            } catch {
              return { data, writable: true, persisted: false, error: 'migration-write' };
            }
          }
        }
      } else {
        raw = this.getLocalStorage().getItem(key);
      }
      const data = raw === null ? null : parseSave(raw, validate);
      this.loadedKeys.add(key);
      return { data, writable: true, persisted: true };
    } catch {
      // A failed read is not an empty save. Protect the original until reload.
      return { data: null, writable: false, persisted: false, error: 'read-or-format' };
    }
  }

  save(key, payload) {
    if (!this.loadedKeys.has(key)) return Promise.resolve(false);
    let snapshot;
    try { snapshot = JSON.stringify(payload); }
    catch { return Promise.resolve(false); }
    // Capture JSON now, before any caller mutates state for the next request.
    const write = async () => {
      try {
        if (this.isNative) await (await this.preferences()).set({ key, value: snapshot });
        else this.getLocalStorage().setItem(key, snapshot);
        return true;
      } catch { return false; }
    };
    const result = this.tail.then(write);
    this.tail = result.then(() => undefined, () => undefined);
    return result;
  }

  flush() { return this.tail; }
}
