export class GestureController {
  constructor(canvas, { onTap, onRotate, onZoom, isBlocked = () => false,
    onInteract = () => {}, now = () => performance.now() }) {
    Object.assign(this, { canvas, onTap, onRotate, onZoom, isBlocked, onInteract, now });
    this.pointers = new Map();
    this.tapCandidate = null;
    this.window = canvas.ownerDocument?.defaultView;
    this.document = canvas.ownerDocument;
    this.handlers = {};
    for (const name of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'lostpointercapture', 'wheel']) {
      this.handlers[name] = (event) => this[name](event);
      canvas.addEventListener(name, this.handlers[name], { passive: false });
    }
    this.onBlur = () => this.reset();
    this.onVisibility = () => { if (this.document.hidden) this.reset(); };
    this.window?.addEventListener('blur', this.onBlur);
    this.document?.addEventListener('visibilitychange', this.onVisibility);
  }

  pointerdown(event) {
    if (this.isBlocked() || event.button !== 0) return;
    event.preventDefault();
    this.onInteract();
    this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY,
      startX: event.clientX, startY: event.clientY, time: this.now() });
    this.tapCandidate = this.pointers.size === 1 && event.isPrimary !== false ? event.pointerId : null;
    try { this.canvas.setPointerCapture(event.pointerId); } catch { this.reset(); }
  }

  pointermove(event) {
    if (this.isBlocked()) { this.reset(); return; }
    const point = this.pointers.get(event.pointerId);
    if (!point) return;
    event.preventDefault();
    const dx = event.clientX - point.x;
    const dy = event.clientY - point.y;
    if (Math.hypot(event.clientX - point.startX, event.clientY - point.startY) > 8) this.tapCandidate = null;
    if (this.pointers.size === 1 && this.tapCandidate === null) {
      const bounds = this.canvas.getBoundingClientRect();
      this.onRotate(dx / Math.max(1, bounds.width), dy / Math.max(1, bounds.height));
    } else if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      const before = Math.hypot(a.x - b.x, a.y - b.y);
      point.x = event.clientX;
      point.y = event.clientY;
      const after = Math.hypot(a.x - b.x, a.y - b.y);
      if (before > 1 && after > 1) this.onZoom(before / after);
    }
    point.x = event.clientX;
    point.y = event.clientY;
  }

  pointerup(event) {
    const point = this.pointers.get(event.pointerId);
    if (!point) return;
    event.preventDefault();
    const tap = !this.isBlocked() && this.pointers.size === 1 && this.tapCandidate === event.pointerId
      && this.now() - point.time <= 350
      && Math.hypot(event.clientX - point.startX, event.clientY - point.startY) <= 8;
    this.pointers.delete(event.pointerId);
    this.tapCandidate = null;
    this.release(event.pointerId);
    if (tap) this.onTap(event);
  }

  pointercancel() { this.reset(); }
  lostpointercapture(event) { if (this.pointers.has(event.pointerId)) this.reset(); }
  wheel(event) {
    if (this.isBlocked()) return;
    event.preventDefault();
    if (Number.isFinite(event.deltaY)) this.onZoom(Math.exp(Math.max(-100, Math.min(100, event.deltaY)) * 0.002));
  }
  release(id) {
    try { if (this.canvas.hasPointerCapture(id)) this.canvas.releasePointerCapture(id); } catch { /* Already released. */ }
  }
  reset() {
    const ids = [...this.pointers.keys()];
    this.pointers.clear();
    this.tapCandidate = null;
    ids.forEach((id) => this.release(id));
  }
  dispose() {
    this.reset();
    for (const [name, listener] of Object.entries(this.handlers)) this.canvas.removeEventListener(name, listener);
    this.window?.removeEventListener('blur', this.onBlur);
    this.document?.removeEventListener('visibilitychange', this.onVisibility);
  }
}
