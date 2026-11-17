import * as THREE from 'three';

export class ImpactEffects {
  constructor(scene, capacity = 384) {
    this.capacity = capacity;
    this.cursor = 0;
    this.positions = new Float32Array(capacity * 3);
    this.colors = new Float32Array(capacity * 3);
    this.baseColors = new Float32Array(capacity * 3);
    this.velocities = new Float32Array(capacity * 3);
    this.accelerations = new Float32Array(capacity * 3);
    this.life = new Float32Array(capacity);
    this.maxLife = new Float32Array(capacity);
    this.group = new THREE.Group();
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3).setUsage(THREE.DynamicDrawUsage));
    this.material = new THREE.PointsMaterial({ size: 0.085, vertexColors: true, transparent: true,
      opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending });
    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    this.group.add(this.points);
    this.flashGeometry = new THREE.SphereGeometry(1, 12, 8);
    this.flashes = Array.from({ length: 8 }, () => {
      const mesh = new THREE.Mesh(this.flashGeometry, new THREE.MeshBasicMaterial({ transparent: true,
        depthWrite: false, blending: THREE.AdditiveBlending }));
      mesh.visible = false;
      this.group.add(mesh);
      return { mesh, life: 0, maxLife: 1, radius: 1 };
    });
    scene.add(this.group);
  }

  spawn(mesh, impact, definition) {
    const local = new THREE.Vector3().copy(impact.localPosition);
    const origin = mesh.localToWorld(local.clone());
    const normal = local.normalize().transformDirection(mesh.matrixWorld);
    const tangent = new THREE.Vector3().crossVectors(normal,
      Math.abs(normal.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0)).normalize();
    const bitangent = new THREE.Vector3().crossVectors(normal, tangent);
    const scale = Math.min(1, mesh.userData.radius / 1.5);
    const config = definition.effects;
    const color = new THREE.Color(config.color);
    const velocity = new THREE.Vector3();
    for (let index = 0; index < config.count; index += 1) {
      const slot = this.cursor;
      this.cursor = (slot + 1) % this.capacity;
      const offset = slot * 3;
      const angle = Math.random() * Math.PI * 2;
      const spread = Math.random() * 0.8;
      velocity.copy(normal).multiplyScalar(0.5 + Math.random() * 0.5)
        .addScaledVector(tangent, Math.cos(angle) * spread)
        .addScaledVector(bitangent, Math.sin(angle) * spread).normalize()
        .multiplyScalar(config.speed * scale * (0.6 + Math.random() * 0.4));
      origin.toArray(this.positions, offset);
      velocity.toArray(this.velocities, offset);
      normal.clone().multiplyScalar(-2.5 * scale).toArray(this.accelerations, offset);
      color.toArray(this.baseColors, offset);
      color.toArray(this.colors, offset);
      this.life[slot] = config.life * (0.65 + Math.random() * 0.35);
      this.maxLife[slot] = this.life[slot];
    }
    const flash = this.flashes.find((candidate) => candidate.life <= 0)
      || this.flashes.reduce((oldest, candidate) => candidate.life < oldest.life ? candidate : oldest);
    flash.life = config.flashLife;
    flash.maxLife = config.flashLife;
    flash.radius = Math.min(impact.size * 0.65, mesh.userData.radius * 0.24);
    flash.mesh.position.copy(origin);
    flash.mesh.scale.setScalar(flash.radius);
    flash.mesh.material.color.copy(color);
    flash.mesh.material.opacity = 0.85;
    flash.mesh.visible = true;
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.color.needsUpdate = true;
  }

  update(deltaSeconds) {
    let changed = false;
    for (let index = 0; index < this.capacity; index += 1) {
      if (this.life[index] <= 0) continue;
      changed = true;
      this.life[index] = Math.max(0, this.life[index] - deltaSeconds);
      const fade = this.life[index] / this.maxLife[index];
      for (let axis = 0; axis < 3; axis += 1) {
        const offset = index * 3 + axis;
        this.positions[offset] += this.velocities[offset] * deltaSeconds
          + 0.5 * this.accelerations[offset] * deltaSeconds * deltaSeconds;
        this.velocities[offset] += this.accelerations[offset] * deltaSeconds;
        this.colors[offset] = this.baseColors[offset] * fade;
      }
    }
    if (changed) {
      this.geometry.attributes.position.needsUpdate = true;
      this.geometry.attributes.color.needsUpdate = true;
    }
    for (const flash of this.flashes) {
      if (flash.life <= 0) continue;
      flash.life = Math.max(0, flash.life - deltaSeconds);
      flash.mesh.visible = flash.life > 0;
      flash.mesh.material.opacity = flash.life / flash.maxLife * 0.85;
      flash.mesh.scale.setScalar(flash.radius * (2 - flash.life / flash.maxLife));
    }
  }

  dispose() {
    this.group.removeFromParent();
    this.geometry.dispose();
    this.material.dispose();
    this.flashGeometry.dispose();
    for (const flash of this.flashes) flash.mesh.material.dispose();
    this.group.clear();
  }
}
