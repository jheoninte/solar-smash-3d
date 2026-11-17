export class Loop {
  constructor({ update, render, maxDeltaSeconds = 0.05 }) {
    this.update = update;
    this.render = render;
    this.maxDeltaSeconds = maxDeltaSeconds;
    this.running = false;
    this.frameHandle = 0;
    this.lastFrameTime = 0;
    this.elapsedMilliseconds = 0;
    this.tick = this.tick.bind(this);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.lastFrameTime = performance.now();
    this.frameHandle = requestAnimationFrame(this.tick);
  }

  stop() {
    if (!this.running) return;
    this.running = false;
    cancelAnimationFrame(this.frameHandle);
  }

  getElapsedMilliseconds() {
    return this.elapsedMilliseconds;
  }

  tick(now) {
    if (!this.running) return;
    const deltaSeconds = Math.min((now - this.lastFrameTime) / 1000, this.maxDeltaSeconds);
    this.lastFrameTime = now;
    this.elapsedMilliseconds += deltaSeconds * 1000;
    this.update(deltaSeconds, this.elapsedMilliseconds);
    this.render(deltaSeconds, this.elapsedMilliseconds);
    if (this.running) this.frameHandle = requestAnimationFrame(this.tick);
  }
}
