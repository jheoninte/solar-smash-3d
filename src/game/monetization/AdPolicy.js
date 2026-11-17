import { getMission } from '../missions/definitions.js';
import { INTERSTITIAL_POLICY, REWARDED_POLICY } from './config.js';

export class AdPolicy {
  constructor({ rewardedPolicy = REWARDED_POLICY, interstitialPolicy = INTERSTITIAL_POLICY } = {}) {
    this.rewardedPolicy = rewardedPolicy;
    this.interstitialPolicy = interstitialPolicy;
    this.activePlaySeconds = 0;
    this.completedRuns = 0;
    this.completionsSinceLastInterstitial = 0;
    this.lastAnyAdShownAtActiveSeconds = -Infinity;
    this.interstitialsShownThisSession = 0;
  }

  recordActiveTime(deltaSeconds) {
    if (Number.isFinite(deltaSeconds) && deltaSeconds > 0) {
      this.activePlaySeconds += deltaSeconds;
    }
  }

  recordMissionCompleted() {
    this.completedRuns += 1;
    this.completionsSinceLastInterstitial += 1;
  }

  recordRewardedShown() {
    this.lastAnyAdShownAtActiveSeconds = this.activePlaySeconds;
  }

  recordInterstitialShown() {
    this.interstitialsShownThisSession += 1;
    this.completionsSinceLastInterstitial = 0;
    this.lastAnyAdShownAtActiveSeconds = this.activePlaySeconds;
  }

  calculateBonus(missionOrId) {
    const id = typeof missionOrId === 'string' ? missionOrId : missionOrId?.id;
    const mission = getMission(id);
    if (!mission) return 0;
    return Math.max(0, Math.floor(mission.reward * this.rewardedPolicy.bonusFraction));
  }

  canOfferRewarded({
    mission,
    isFirst = false,
    basicRewardSaved = false,
    rewardedMissionIds = [],
    adsSupported = false,
    canRequestAds = false,
    isRewardedReady = false,
    isOnline = true
  }) {
    const id = typeof mission === 'string' ? mission : mission?.id;
    const definition = getMission(id);
    if (!definition || !isFirst || !basicRewardSaved) return false;
    if (!this.rewardedPolicy.enabled) return false;
    if (!adsSupported || !canRequestAds || !isRewardedReady || !isOnline) return false;
    if (this.rewardedPolicy.maxClaimsPerMission < 1) return false;
    if (Array.isArray(rewardedMissionIds) && rewardedMissionIds.includes(definition.id)) return false;
    return this.calculateBonus(definition) > 0;
  }

  canShowInterstitial({
    entitlementState = 'unknown',
    adsSupported = false,
    canRequestAds = false,
    isInterstitialReady = false,
    isOnline = true
  } = {}) {
    if (!this.interstitialPolicy.enabled) return false;
    if (entitlementState !== 'not_owned') return false;
    if (!adsSupported || !canRequestAds || !isInterstitialReady || !isOnline) return false;
    if (this.interstitialsShownThisSession >= this.interstitialPolicy.maxPerSession) return false;
    if (this.activePlaySeconds < this.interstitialPolicy.firstEligibleActiveSeconds) return false;
    if (this.completedRuns < this.interstitialPolicy.minCompletedRuns) return false;
    if (this.completionsSinceLastInterstitial < this.interstitialPolicy.minCompletionsBetweenAds) return false;
    if (this.activePlaySeconds - this.lastAnyAdShownAtActiveSeconds < this.interstitialPolicy.minSecondsBetweenAnyAds) {
      return false;
    }
    return true;
  }
}
