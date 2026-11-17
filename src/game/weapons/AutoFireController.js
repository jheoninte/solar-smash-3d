// Input intent and pacing only; no DOM, renderer, SDK or saved state.
export class AutoFireController {
  constructor({ now = () => performance.now(), onChange = () => {} } = {}) {
    this.now = now;
    this.onChange = onChange;
    this.enabled = false;
    this.nextAt = 0;
  }

  toggle() {
    if (this.enabled) this.stop();
    else {
      this.enabled = true;
      this.nextAt = 0;
      this.onChange(true);
    }
  }

  stop() {
    if (!this.enabled) return;
    this.enabled = false;
    this.nextAt = 0;
    this.onChange(false);
  }

  update(intervalMs, fire) {
    if (!this.enabled || !Number.isFinite(intervalMs) || intervalMs <= 0) return false;
    const now = this.now();
    if (!Number.isFinite(now) || now < this.nextAt) return false;
    // One shot per update. Long frames never replay a burst of missed shots.
    this.nextAt = now + intervalMs;
    const fired = fire() === true;
    if (!fired && this.enabled) this.nextAt = now + Math.min(intervalMs, 100);
    return fired;
  }
}
