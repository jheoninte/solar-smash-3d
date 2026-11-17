// Production policy defaults: disabled and null IDs until store/ad units are configured.
export const PRODUCTS = Object.freeze([
  Object.freeze({
    key: 'remove_ads',
    type: 'non-consumable',
    title: '전면 광고 제거',
    description: '자동 전면 광고를 제거합니다. 보상 광고는 원할 때만 선택할 수 있습니다.',
    iosProductId: null,
    androidProductId: null
  })
]);

export const REWARDED_POLICY = Object.freeze({
  enabled: false,
  isTesting: false,
  placement: 'first_mission_completion',
  iosAdUnitId: null,
  androidAdUnitId: null,
  bonusFraction: 0.5,
  maxClaimsPerMission: 1
});

export const INTERSTITIAL_POLICY = Object.freeze({
  enabled: false,
  isTesting: false,
  placement: 'mission_result_exit',
  iosAdUnitId: null,
  androidAdUnitId: null,
  firstEligibleActiveSeconds: 120,
  minCompletedRuns: 2,
  minCompletionsBetweenAds: 3,
  minSecondsBetweenAnyAds: 180,
  maxPerSession: 3
});

// Official Google Mobile Ads sample test unit IDs for iOS (isolated from production defaults).
export const GOOGLE_SAMPLE_IOS_AD_UNITS = Object.freeze({
  rewarded: 'ca-app-pub-3940256099942544/1712485313',
  interstitial: 'ca-app-pub-3940256099942544/4411468910'
});

// Explicit test-only configuration for Xcode StoreKit Configuration + AdMob sample units.
// Never selected automatically in production runtime.
export const TEST_ONLY_MONETIZATION_CONFIG = Object.freeze({
  products: Object.freeze([
    Object.freeze({
      key: 'remove_ads',
      type: 'non-consumable',
      title: '전면 광고 제거',
      description: '자동 전면 광고를 제거합니다. 보상 광고는 원할 때만 선택할 수 있습니다.',
      iosProductId: 'dev.solarsmash.remove_ads',
      androidProductId: null
    })
  ]),
  rewardedPolicy: Object.freeze({
    ...REWARDED_POLICY,
    enabled: true,
    isTesting: true,
    iosAdUnitId: GOOGLE_SAMPLE_IOS_AD_UNITS.rewarded
  }),
  interstitialPolicy: Object.freeze({
    ...INTERSTITIAL_POLICY,
    enabled: true,
    isTesting: true,
    iosAdUnitId: GOOGLE_SAMPLE_IOS_AD_UNITS.interstitial
  })
});
