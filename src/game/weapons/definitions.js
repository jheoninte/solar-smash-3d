export const WEAPONS = {
  meteor: {
    autoIntervalMs: 700,
    speed: 18, size: 0.58, depth: 0.24, damage: 18, color: 0xff8a28,
    effects: { color: 0xff9c32, count: 24, speed: 3.4, life: 0.85, flashLife: 0.16 }
  },
  laser: {
    autoIntervalMs: 450,
    speed: Infinity, size: 0.27, depth: 0.32, damage: 10, color: 0x67e8f9,
    effects: { color: 0x67e8f9, count: 10, speed: 4.2, life: 0.45, flashLife: 0.09 }
  },
  missile: {
    autoIntervalMs: 1100,
    speed: 30, size: 0.82, depth: 0.28, damage: 26, color: 0xf0f4ff,
    effects: { color: 0xffdc96, count: 40, speed: 4.8, life: 1.05, flashLife: 0.22 }
  }
};
