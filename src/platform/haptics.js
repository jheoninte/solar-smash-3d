export class HapticsService {
  constructor({ supported = false, loader, now = () => performance.now() } = {}) {
    Object.assign(this, { supported, loader, now });
    this.lastPlay = -Infinity;
    this.disposed = false;
  }

  async impact(enabled) {
    const allowed = () => typeof enabled === 'function' ? enabled() : enabled;
    if (!allowed() || !this.supported || this.disposed || this.busy || this.now() - this.lastPlay < 80) return false;
    this.lastPlay = this.now();
    const requestedAt = this.lastPlay;
    this.busy = true;
    try {
      this.plugin ??= Promise.resolve().then(() => this.loader());
      const haptics = await this.plugin;
      if (this.disposed || !allowed() || this.now() - requestedAt > 250) return false;
      this.lastPlay = this.now();
      await haptics.impact({ style: 'LIGHT' });
      return true;
    } catch { this.supported = false; return false; }
    finally { this.busy = false; }
  }

  dispose() { this.disposed = true; }
}
