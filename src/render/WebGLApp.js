import * as THREE from 'three';
import { CameraController } from './CameraController.js';

export class WebGLApp {
  constructor({ canvas }) {
    this.canvas = canvas;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#020617');
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 500);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.cameraController = new CameraController();
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.radius = 3.4;
    const ambient = new THREE.HemisphereLight(0xb5eaff, 0x17102c, 1.2);
    const light = new THREE.DirectionalLight(0xffead0, 3);
    light.position.set(-5, 6, 8);
    this.scene.add(ambient, light);
    this.createStars();
    this.resize = this.resize.bind(this);
    window.addEventListener('resize', this.resize);
    this.resize();
  }

  createStars() {
    const positions = [];
    for (let index = 0; index < 1100; index += 1) {
      const angle = index * 2.399963;
      const vertical = 1 - 2 * (index + 0.5) / 1100;
      const horizontal = Math.sqrt(1 - vertical * vertical);
      positions.push(Math.cos(angle) * horizontal * 130, vertical * 130, Math.sin(angle) * horizontal * 130);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    this.stars = new THREE.Points(geometry, new THREE.PointsMaterial({ color: 0xbfd8ff, size: 0.18 }));
    this.scene.add(this.stars);
  }

  setMode(mode) {
    this.radius = mode === 'solar' ? 8.3 : 3.4;
    this.resetCamera();
  }

  resetCamera() {
    this.cameraController.reset();
    this.cameraController.fit(this.camera, this.radius);
  }

  resize() {
    const width = Math.max(1, window.innerWidth);
    const height = Math.max(1, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(width, height);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.cameraController.fit(this.camera, this.radius);
  }

  pick(event, targets) {
    const bounds = this.canvas.getBoundingClientRect();
    this.pointer.set((event.clientX - bounds.left) / bounds.width * 2 - 1,
      -(event.clientY - bounds.top) / bounds.height * 2 + 1);
    this.scene.updateMatrixWorld(true);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    return this.raycaster.intersectObjects(targets, false)[0] || null;
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    window.removeEventListener('resize', this.resize);
    this.stars.geometry.dispose();
    this.stars.material.dispose();
    this.scene.clear();
    this.renderer.dispose();
  }
}
