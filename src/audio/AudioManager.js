export class AudioManager {
  constructor(settingsStore, { getContextClass = () => globalThis.AudioContext || globalThis.webkitAudioContext } = {}) {
    Object.assign(this, { settingsStore, getContextClass });
    this.activeNodes = new Set();
    this.paused = false;
    this.disposed = false;
  }

  unlock() {
    if (this.disposed) return;
    try {
      if (!this.ctx) {
        const Context = this.getContextClass();
        if (!Context) return;
        this.ctx = new Context();
        this.masterGain = this.ctx.createGain();
        this.masterGain.connect(this.ctx.destination);
        this.updateVolume();
      }
      this.ctx.resume().then(() => {
        if (this.paused && !this.disposed) this.ctx.suspend().catch(() => {});
      }).catch(() => {});
    } catch { /* Audio must never block the game. */ }
  }

  updateVolume() {
    if (!this.masterGain) return;
    const { soundEnabled, volume } = this.settingsStore.settings;
    this.masterGain.gain.value = soundEnabled ? volume : 0;
    if (!soundEnabled || volume === 0) this.stopVoices();
  }

  play(type) {
    if (this.disposed || this.paused || !this.settingsStore.settings.soundEnabled
      || this.settingsStore.settings.volume === 0 || this.ctx?.state !== 'running' || this.activeNodes.size >= 8) return;
    const shapes = {
      meteor: ['triangle', 380, 70, 0.16], laser: ['square', 1000, 220, 0.09],
      missile: ['sawtooth', 180, 45, 0.2], impact: ['triangle', 110, 28, 0.2],
      complete: ['sine', 520, 880, 0.28]
    };
    const shape = shapes[type];
    if (!shape) return;
    let voice;
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      voice = { osc, gain };
      const [wave, from, to, duration] = shape;
      const now = this.ctx.currentTime;
      osc.type = wave;
      osc.frequency.setValueAtTime(from, now);
      osc.frequency.exponentialRampToValueAtTime(to, now + duration);
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
      osc.connect(gain);
      gain.connect(this.masterGain);
      this.activeNodes.add(voice);
      osc.onended = () => this.release(voice);
      osc.start(now);
      osc.stop(now + duration);
    } catch { if (voice) this.release(voice); }
  }

  release(voice) {
    voice.osc.onended = null;
    try { voice.osc.disconnect(); voice.gain.disconnect(); } catch { /* Already closed. */ }
    this.activeNodes.delete(voice);
  }
  stopVoices() {
    for (const voice of [...this.activeNodes]) {
      try { voice.osc.stop(); } catch { /* Already ended. */ }
      this.release(voice);
    }
  }
  setPaused(paused) {
    this.paused = paused;
    if (!this.ctx || this.disposed) return;
    if (paused) this.stopVoices();
    try {
      const operation = paused ? this.ctx.suspend() : this.ctx.resume();
      operation.then(() => {
        if (!paused && this.paused && !this.disposed) this.ctx.suspend().catch(() => {});
      }).catch(() => {});
    } catch { /* Unsupported context. */ }
  }
  dispose() {
    this.disposed = true;
    this.stopVoices();
    try { this.ctx?.close().catch(() => {}); } catch { /* Already closed. */ }
  }
}
