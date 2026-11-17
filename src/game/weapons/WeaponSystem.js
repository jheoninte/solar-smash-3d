import * as THREE from 'three';
import { WEAPONS } from './definitions.js';

export class WeaponSystem {
  constructor({ scene, eventBus }) {
    this.scene = scene;
    this.eventBus = eventBus;
    this.projectiles = [];
    this.beams = [];
    this.geometries = {
      meteor: new THREE.IcosahedronGeometry(0.14, 1),
      missile: new THREE.ConeGeometry(0.075, 0.35, 10)
    };
    this.materials = {
      meteor: new THREE.MeshBasicMaterial({ color: WEAPONS.meteor.color }),
      missile: new THREE.MeshBasicMaterial({ color: WEAPONS.missile.color }),
      laser: new THREE.LineBasicMaterial({ color: WEAPONS.laser.color })
    };
  }

  fireWeapon({ type, origin, hit, runId = null }) {
    const definition = WEAPONS[type];
    if (!definition || !hit) return;
    const target = hit.object;
    const localPosition = target.worldToLocal(hit.point.clone());
    const impact = {
      runId,
      localPosition: { x: localPosition.x, y: localPosition.y, z: localPosition.z },
      mode: target.userData.mode,
      targetIndex: target.userData.targetIndex,
      weapon: type,
      size: definition.size,
      damage: definition.damage
    };
    const launch = origin.clone().add(new THREE.Vector3(0.6, -0.5, 0));
    if (type === 'laser') {
      const geometry = new THREE.BufferGeometry().setFromPoints([launch, hit.point]);
      const mesh = new THREE.Line(geometry, this.materials.laser);
      this.scene.add(mesh);
      this.beams.push({ mesh, remaining: 0.12 });
      this.eventBus.emitImpact(impact);
      return;
    }
    const mesh = new THREE.Mesh(this.geometries[type], this.materials[type]);
    mesh.position.copy(launch);
    this.scene.add(mesh);
    this.projectiles.push({ mesh, target, localPosition, impact, speed: definition.speed });
  }

  update(deltaSeconds) {
    for (let index = this.beams.length - 1; index >= 0; index -= 1) {
      const beam = this.beams[index];
      beam.remaining -= deltaSeconds;
      if (beam.remaining <= 0) {
        beam.mesh.removeFromParent();
        beam.mesh.geometry.dispose();
        this.beams.splice(index, 1);
      }
    }
    for (let index = this.projectiles.length - 1; index >= 0; index -= 1) {
      const projectile = this.projectiles[index];
      const destination = projectile.target.localToWorld(projectile.localPosition.clone());
      const direction = destination.sub(projectile.mesh.position);
      const step = projectile.speed * deltaSeconds;
      if (direction.length() <= step) {
        this.eventBus.emitImpact(projectile.impact);
        projectile.mesh.removeFromParent();
        this.projectiles.splice(index, 1);
      } else {
        direction.normalize();
        projectile.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
        projectile.mesh.position.addScaledVector(direction, step);
      }
    }
  }

  getProjectiles() {
    return this.projectiles;
  }

  clear() {
    for (const projectile of this.projectiles) projectile.mesh.removeFromParent();
    for (const beam of this.beams) {
      beam.mesh.removeFromParent();
      beam.mesh.geometry.dispose();
    }
    this.projectiles = [];
    this.beams = [];
  }

  dispose() {
    this.clear();
    Object.values(this.geometries).forEach((geometry) => geometry.dispose());
    Object.values(this.materials).forEach((material) => material.dispose());
  }
}
