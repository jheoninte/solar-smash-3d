import { BodyMode } from './BodyMode.js';

export class SolarMode extends BodyMode {
  constructor(options) {
    super({ ...options, id: 'solar' });
  }

  createBodies() {
    this.addBody({ radius: 1.7, color: 0xffb631, sun: true });
    this.addBody({ radius: 0.65, color: 0x36a6dd, distance: 4.2, phase: 0.4, orbitSpeed: 0.28, earth: true });
    this.addBody({ radius: 0.9, color: 0xd97853, distance: 7, phase: 2.8, orbitSpeed: 0.16 });
  }
}
