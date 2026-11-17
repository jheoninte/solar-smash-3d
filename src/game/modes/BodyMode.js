import * as THREE from 'three';
import { TerrainSurface } from '../destruction/TerrainSurface.js';
import { ImpactEffects } from '../destruction/ImpactEffects.js';
import { WEAPONS } from '../weapons/definitions.js';

export class BodyMode {
  constructor({ scene, eventBus, id, getImpacts, getSkin }) {
    this.scene = scene;
    this.eventBus = eventBus;
    this.id = id;
    this.getImpacts = getImpacts;
    this.getSkin = getSkin;
    this.group = new THREE.Group();
    this.bodies = [];
    this.history = [];
    this.active = false;
  }

  setup(impacts = []) {
    this.cleanup();
    this.active = true;
    this.scene.add(this.group);
    this.effects = new ImpactEffects(this.scene);
    this.createBodies();
    this.unsubscribe = this.eventBus.subscribe('impact', (impact) => this.onImpact(impact));
    this.restoreTerrain(impacts);
    this.scene.updateMatrixWorld(true);
  }

  addBody({ radius, color, distance = 0, phase = 0, orbitSpeed = 0, spin = 0.2, sun = false, earth = false }) {
    const pivot = new THREE.Group();
    pivot.rotation.y = phase;
    const surface = sun ? null : new TerrainSurface(radius, color, earth, this.getSkin?.()?.palette);
    const geometry = surface?.geometry || new THREE.SphereGeometry(radius, 64, 40);
    const material = surface?.material || new THREE.MeshBasicMaterial({ color });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.x = distance;
    mesh.userData = { targetIndex: this.bodies.length, mode: this.id, radius, sun };
    pivot.add(mesh);
    this.group.add(pivot);
    this.bodies.push({ mesh, pivot, orbitSpeed, spin, surface });
    if (sun) this.group.add(new THREE.PointLight(0xffa64d, 60, 25, 1.5));
    if (distance) {
      const points = [];
      for (let index = 0; index <= 128; index += 1) {
        const angle = index / 128 * Math.PI * 2;
        points.push(new THREE.Vector3(Math.cos(angle) * distance, 0, Math.sin(angle) * distance));
      }
      this.group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),
        new THREE.LineBasicMaterial({ color: 0x203951, transparent: true, opacity: 0.6 })));
    }
    return mesh;
  }

  getTargets() {
    return this.bodies.map((body) => body.mesh);
  }

  onImpact(impact) {
    if (!this.active || impact.mode !== this.id) return;
    const body = this.bodies[impact.targetIndex];
    const definition = WEAPONS[impact.weapon];
    if (!body || !definition || !impact.localPosition) return;
    const nextHistory = (this.getImpacts?.() || [...this.history, impact].slice(-120))
      .filter((entry) => entry.mode === this.id);
    const appendOnly = nextHistory.length === this.history.length + 1
      && this.history.every((entry, index) => entry === nextHistory[index]);
    if (appendOnly) {
      body.surface?.applyImpact(impact);
      body.surface?.commit();
      this.history = nextHistory;
    } else {
      this.restoreTerrain(nextHistory);
    }
    this.scene.updateMatrixWorld(true);
    this.effects.spawn(body.mesh, impact, definition);
  }

  restoreTerrain(impacts) {
    this.history = impacts.filter((impact) => impact.mode === this.id).slice(-120);
    for (const body of this.bodies) body.surface?.reset();
    for (const impact of this.history) this.bodies[impact.targetIndex]?.surface?.applyImpact(impact);
    for (const body of this.bodies) body.surface?.commit();
  }

  update(deltaSeconds) {
    this.effects?.update(deltaSeconds);
    for (const body of this.bodies) {
      body.mesh.rotation.y += body.spin * deltaSeconds;
      body.pivot.rotation.y += body.orbitSpeed * deltaSeconds;
    }
  }

  disposeTree(root) {
    root.traverse((object) => {
      object.geometry?.dispose();
      if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose());
      else object.material?.dispose();
    });
  }

  cleanup() {
    this.active = false;
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.effects?.dispose();
    this.effects = null;
    this.group.removeFromParent();
    this.disposeTree(this.group);
    this.group.clear();
    this.bodies = [];
    this.history = [];
  }
}
