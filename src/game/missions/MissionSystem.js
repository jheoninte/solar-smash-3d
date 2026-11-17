import { evaluateMissionStars, getMission, isGoalReached } from './definitions.js';

export class MissionSystem {
  constructor({ now = () => performance.now() } = {}) {
    this.clock = now;
    this.lastClockMs = null;
    this.pauseReasons = new Set();
    this.runId = 0;
    this.stopMission();
  }

  readNow() {
    const raw = Number(this.clock());
    if (!Number.isFinite(raw)) return this.lastClockMs ?? 0;
    if (this.lastClockMs === null || raw >= this.lastClockMs) {
      this.lastClockMs = raw;
    }
    return this.lastClockMs;
  }

  isPaused() {
    return this.pauseReasons.size > 0;
  }

  pause(reason = 'default') {
    if (this.status === 'active' && !this.isPaused() && this.segmentStartedAt !== null) {
      this.accumulatedMs += Math.max(0, this.readNow() - this.segmentStartedAt);
      this.segmentStartedAt = null;
    }
    this.pauseReasons.add(reason);
  }

  resume(reason = 'default') {
    this.pauseReasons.delete(reason);
    if (this.status === 'active' && !this.isPaused() && this.segmentStartedAt === null) {
      this.segmentStartedAt = this.readNow();
    }
  }

  setPaused(reason, paused) {
    if (paused) this.pause(reason);
    else this.resume(reason);
  }

  startMission(id) {
    this.stopMission();
    this.activeMission = getMission(id);
    this.status = this.activeMission ? 'active' : 'idle';
    if (this.status === 'active') {
      this.segmentStartedAt = this.readNow();
    }
    return this.activeMission;
  }

  stopMission() {
    this.runId += 1;
    this.activeMission = null;
    this.status = 'idle';
    this.progress = { count: 0, damage: 0 };
    this.pauseReasons.clear();
    this.accumulatedMs = 0;
    this.segmentStartedAt = null;
    this.completedActiveMs = null;
  }

  computeRawActiveMs() {
    if (!this.activeMission) return 0;
    if (this.status === 'completed' && this.completedActiveMs !== null) {
      return this.completedActiveMs;
    }
    const runningMs = this.segmentStartedAt !== null
      ? Math.max(0, this.readNow() - this.segmentStartedAt)
      : 0;
    return this.accumulatedMs + runningMs;
  }

  recordImpact(impact) {
    const mission = this.activeMission;
    if (!mission || this.status !== 'active' || this.isPaused()
      || impact.runId !== this.runId || impact.mode !== mission.mode) return null;
    if (!Number.isFinite(impact.damage) || impact.damage < 0) return null;
    if (!Number.isInteger(impact.targetIndex) || impact.targetIndex < 0
      || impact.targetIndex >= (mission.mode === 'planet' ? 1 : 3)) return null;
    if (mission.req.weapon && impact.weapon !== mission.req.weapon) return null;
    if (mission.req.excludeTargetIndex?.includes(impact.targetIndex)) return null;
    this.progress.count += 1;
    this.progress.damage += impact.damage;
    if (isGoalReached(mission, this.progress)) {
      const totalRaw = this.computeRawActiveMs();
      this.accumulatedMs = totalRaw;
      this.segmentStartedAt = null;
      this.completedActiveMs = Math.max(1, Math.ceil(totalRaw));
      this.status = 'completed';
    }
    return this.getSnapshot();
  }

  getSnapshot() {
    if (!this.activeMission) return null;
    const activeMs = this.status === 'completed' && this.completedActiveMs !== null
      ? this.completedActiveMs
      : Math.max(0, Math.floor(this.computeRawActiveMs()));
    const stars = this.status === 'completed'
      ? evaluateMissionStars(this.activeMission, activeMs)
      : 0;
    return {
      mission: this.activeMission,
      progress: { ...this.progress },
      status: this.status,
      runId: this.runId,
      activeMs,
      stars,
      paused: this.isPaused()
    };
  }
}
