export class DestructionEventBus {
  constructor() {
    this.listeners = new Map();
  }

  subscribe(eventName, listener) {
    const listeners = this.listeners.get(eventName) || [];
    listeners.push(listener);
    this.listeners.set(eventName, listeners);
    return () => {
      const activeListeners = this.listeners.get(eventName) || [];
      this.listeners.set(
        eventName,
        activeListeners.filter((candidate) => candidate !== listener)
      );
    };
  }

  emitImpact({ localPosition, size, damage, mode, weapon, targetIndex, runId = null }) {
    const impact = {
      localPosition: { ...localPosition },
      size,
      damage,
      mode,
      weapon,
      targetIndex,
      runId,
      createdAt: Date.now()
    };
    for (const listener of this.listeners.get('impact') || []) {
      listener(impact);
    }
    return impact;
  }
}
