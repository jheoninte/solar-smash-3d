import { BodyMode } from './BodyMode.js';

export class PlanetMode extends BodyMode {
  constructor(options) {
    super({ ...options, id: 'planet' });
  }

  createBodies() {
    this.addBody({ radius: 3, color: 0x319ba8, earth: true });
  }
}
