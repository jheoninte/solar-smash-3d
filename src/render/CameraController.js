export class CameraController {
  constructor() { this.reset(); }

  reset() {
    this.yaw = 0;
    this.pitch = Math.atan(0.32);
    this.zoomRatio = 1;
  }

  fit(camera, radius) {
    this.radius = radius;
    this.updateCamera(camera);
  }

  rotate(dx, dy) {
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
    this.yaw = (this.yaw - dx * Math.PI * 2) % (Math.PI * 2);
    this.pitch = Math.max(-1.4, Math.min(1.4, this.pitch + dy * Math.PI));
  }

  zoom(factor) {
    if (Number.isFinite(factor) && factor > 0) this.zoomRatio = Math.max(0.7, Math.min(2.4, this.zoomRatio * factor));
  }

  updateCamera(camera) {
    const vertical = camera.fov * Math.PI / 360;
    const horizontal = Math.atan(Math.tan(vertical) * camera.aspect);
    const fitDistance = this.radius * 1.2 * Math.hypot(1, 0.32) / Math.sin(Math.min(vertical, horizontal));
    const distance = Math.max(this.radius * 1.35, fitDistance * this.zoomRatio);
    camera.position.set(distance * Math.cos(this.pitch) * Math.sin(this.yaw),
      distance * Math.sin(this.pitch), distance * Math.cos(this.pitch) * Math.cos(this.yaw));
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
  }
}
