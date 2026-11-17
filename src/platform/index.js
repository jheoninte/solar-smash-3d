import { Capacitor, registerPlugin } from '@capacitor/core';
import { StorageAdapter } from './storage.js';
import { HapticsService } from './haptics.js';
import { createUnavailableAds, createUnavailablePayments } from './monetization.js';
import { createStoreKit2Payments } from './storekit2.js';
import { createAdMobAds } from './admob.js';
import { INTERSTITIAL_POLICY, PRODUCTS, REWARDED_POLICY } from '../game/monetization/config.js';

const unavailable = async () => ({ status: 'unavailable' });

function resolveProductId(productDef, platformName) {
  if (!productDef) return null;
  if (platformName === 'ios') return productDef.iosProductId || null;
  if (platformName === 'android') return productDef.androidProductId || null;
  return null;
}

function resolveAdUnitId(policy, platformName) {
  if (!policy?.enabled) return null;
  if (platformName === 'ios') return policy.iosAdUnitId || null;
  if (platformName === 'android') return policy.androidAdUnitId || null;
  return null;
}

export function createPlatform({
  capacitor = Capacitor,
  products = PRODUCTS,
  rewardedPolicy = REWARDED_POLICY,
  interstitialPolicy = INTERSTITIAL_POLICY,
  storeKitPlugin = null,
  adMobPlugin = null,
  isOnline = () => globalThis.navigator?.onLine !== false
} = {}) {
  const isNative = Boolean(capacitor?.isNativePlatform?.());
  const name = capacitor?.getPlatform?.() || 'web';

  const removeAdsDef = products.find((item) => item.key === 'remove_ads');
  const productId = resolveProductId(removeAdsDef, name);
  const rewardedAdUnitId = resolveAdUnitId(rewardedPolicy, name);
  const interstitialAdUnitId = resolveAdUnitId(interstitialPolicy, name);

  const hasStoreKitPlugin = Boolean(
    isNative &&
    name === 'ios' &&
    productId &&
    capacitor?.isPluginAvailable?.('StoreKit2')
  );
  const resolvedStoreKit = hasStoreKitPlugin
    ? (storeKitPlugin || registerPlugin('StoreKit2'))
    : null;

  const hasAdMobPlugin = Boolean(
    isNative &&
    name === 'ios' &&
    (rewardedAdUnitId || interstitialAdUnitId) &&
    capacitor?.isPluginAvailable?.('AdMob')
  );
  const resolvedAdMob = hasAdMobPlugin
    ? (adMobPlugin || registerPlugin('AdMob'))
    : null;

  return {
    isNative,
    name,
    storage: new StorageAdapter({
      isNative,
      preferencesLoader: async () => (await import('@capacitor/preferences')).Preferences
    }),
    haptics: new HapticsService({
      supported: Boolean(isNative && capacitor?.isPluginAvailable?.('Haptics')),
      loader: async () => (await import('@capacitor/haptics')).Haptics
    }),
    payments: resolvedStoreKit
      ? createStoreKit2Payments({ plugin: resolvedStoreKit, isOnline })
      : createUnavailablePayments(),
    ads: resolvedAdMob
      ? createAdMobAds({
          plugin: resolvedAdMob,
          isIOS: name === 'ios',
          rewardedAdUnitId,
          interstitialAdUnitId,
          isTesting: Boolean(rewardedPolicy?.isTesting || interstitialPolicy?.isTesting),
          isOnline
        })
      : createUnavailableAds(),
    ranking: { supported: false, signIn: unavailable, submitScore: unavailable, showLeaderboard: unavailable }
  };
}
