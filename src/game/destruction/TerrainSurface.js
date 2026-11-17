import * as THREE from 'three';
import { WEAPONS } from '../weapons/definitions.js';

export class TerrainSurface {
  constructor(radius, color, earth = false, palette = {}) {
    this.radius = radius;
    this.geometry = new THREE.SphereGeometry(radius, 128, 80);
    const position = this.geometry.attributes.position;
    this.directions = new Float32Array(position.count * 3);
    this.basePositions = new Float32Array(position.count * 3);
    this.baseColors = new Float32Array(position.count * 3);
    this.heat = new Float32Array(position.count);
    this.seams = [];
    const duplicates = new Map();
    const direction = new THREE.Vector3();
    const shade = new THREE.Color();
    const ocean = new THREE.Color(palette.ocean ?? 0x125b91);
    const coast = new THREE.Color(palette.coast ?? 0x42ada2);
    const land = new THREE.Color(palette.land ?? 0x467647);
    const peak = new THREE.Color(palette.peak ?? 0xb1a67e);
    const ice = new THREE.Color(palette.ice ?? 0xd3e5e6);
    const rock = new THREE.Color(palette.rock ?? color);
    for (let index = 0; index < position.count; index += 1) {
      direction.fromBufferAttribute(position, index).normalize();
      const key = [direction.x, direction.y, direction.z].map((value) => Math.round(value * 1e6)).join(',');
      const canonical = key.split(',').map(Number);
      direction.set(...canonical).normalize();
      const offset = index * 3;
      direction.toArray(this.directions, offset);
      const continent = Math.sin(direction.x * 3.2 + Math.sin(direction.z * 3))
        + Math.cos(direction.z * 4.3 + direction.y * 2.4)
        + Math.sin(direction.y * 5.1 - direction.x * 2.2) * 0.65;
      const detail = Math.sin(direction.x * 33 + direction.y * 17)
        * Math.cos(direction.z * 29 - direction.y * 21);
      let elevation;
      if (earth) {
        const shore = THREE.MathUtils.smoothstep(continent, -0.15, 0.18);
        const mountain = THREE.MathUtils.smoothstep(continent, 0.6, 1.9);
        shade.copy(ocean).lerp(coast, shore).lerp(land, shore)
          .lerp(peak, mountain * 0.7).lerp(ice, THREE.MathUtils.smoothstep(Math.abs(direction.y), 0.82, 0.96));
        elevation = Math.max(0, continent) * 0.009 + detail * shore * 0.002;
      } else {
        shade.copy(rock).multiplyScalar(0.65 + (continent + 2.65) * 0.11 + detail * 0.07);
        elevation = continent * 0.006 + detail * 0.003;
      }
      direction.multiplyScalar(radius * (1 + elevation)).toArray(this.basePositions, offset);
      shade.toArray(this.baseColors, offset);
      const group = duplicates.get(key) || [];
      group.push(index);
      duplicates.set(key, group);
    }
    this.seams = [...duplicates.values()].filter((group) => group.length > 1);
    this.geometry.setAttribute('color', new THREE.BufferAttribute(this.baseColors.slice(), 3));
    this.geometry.setAttribute('heat', new THREE.BufferAttribute(this.heat, 1));
    this.material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0.03 });
    this.material.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader.replace('#include <common>',
        '#include <common>\nattribute float heat;\nvarying float vHeat;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvHeat = heat;');
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>',
        '#include <common>\nvarying float vHeat;')
        .replace('#include <emissivemap_fragment>',
          '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(1.0, 0.12, 0.004) * vHeat * 2.7;');
    };
    this.material.customProgramCacheKey = () => 'terrain-heat-v1';
    this.reset();
    this.commit();
  }

  reset() {
    this.geometry.attributes.position.array.set(this.basePositions);
    this.geometry.attributes.color.array.set(this.baseColors);
    this.heat.fill(0);
  }

  applyImpact(impact) {
    const definition = WEAPONS[impact.weapon];
    if (!definition || !impact.localPosition) return;
    const normal = new THREE.Vector3().copy(impact.localPosition).normalize();
    if (!Number.isFinite(normal.lengthSq()) || normal.lengthSq() === 0) return;
    const craterRadius = Math.min(impact.size, this.radius * 0.4);
    if (!Number.isFinite(craterRadius) || craterRadius <= 0) return;
    const depth = Math.min(definition.depth, this.radius * 0.22);
    const position = this.geometry.attributes.position;
    const color = this.geometry.attributes.color;
    for (let index = 0; index < position.count; index += 1) {
      const offset = index * 3;
      const dot = this.directions[offset] * normal.x + this.directions[offset + 1] * normal.y
        + this.directions[offset + 2] * normal.z;
      const distance = this.radius * Math.sqrt(Math.max(0, 2 * (1 - dot)));
      const normalized = distance / craterRadius;
      if (normalized >= 1.23) continue;
      const bowl = Math.pow(Math.max(0, 1 - normalized * normalized), 2);
      const rim = Math.pow(Math.max(0, 1 - Math.pow((normalized - 0.95) / 0.28, 2)), 2);
      const current = Math.hypot(position.array[offset], position.array[offset + 1], position.array[offset + 2]);
      const next = THREE.MathUtils.clamp(current - depth * bowl + depth * 0.2 * rim,
        this.radius * 0.35, this.radius * 1.12);
      position.setXYZ(index, this.directions[offset] * next,
        this.directions[offset + 1] * next, this.directions[offset + 2] * next);
      const scorch = Math.max(0, 1 - normalized / 1.23) * 0.85;
      const heat = Math.pow(Math.max(0, 1 - normalized / 0.58), 0.6);
      this.heat[index] = Math.max(this.heat[index] * (1 - scorch), heat);
      color.setXYZ(index,
        color.array[offset] * (1 - scorch) + 0.035 * scorch,
        color.array[offset + 1] * (1 - scorch) + 0.018 * scorch,
        color.array[offset + 2] * (1 - scorch) + 0.014 * scorch);
    }
  }

  commit() {
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.color.needsUpdate = true;
    this.geometry.attributes.heat.needsUpdate = true;
    this.geometry.computeVertexNormals();
    const normals = this.geometry.attributes.normal;
    const average = new THREE.Vector3();
    const value = new THREE.Vector3();
    for (const group of this.seams) {
      average.set(0, 0, 0);
      for (const index of group) average.add(value.fromBufferAttribute(normals, index));
      average.normalize();
      for (const index of group) normals.setXYZ(index, average.x, average.y, average.z);
    }
    normals.needsUpdate = true;
    this.geometry.computeBoundingSphere();
    this.geometry.computeBoundingBox();
  }
}
