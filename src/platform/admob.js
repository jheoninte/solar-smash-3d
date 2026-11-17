import { createUnavailableAds } from './monetization.js';

// iOS requires the pinned native overrides: one request ID and one terminal response.
// Android remains unavailable until its presentation lifecycle is implemented.
export function createAdMobAds({
  plugin, isIOS = false, rewardedAdUnitId = null, interstitialAdUnitId = null,
  isTesting = false, isOnline = () => globalThis.navigator?.onLine !== false
} = {}) {
  if (!plugin || !isIOS || (!rewardedAdUnitId && !interstitialAdUnitId)) return createUnavailableAds();
  let disposed = false;
  let protocolReady = false;
  let protocolFailed = false;
  let consent = false;
  let privacyRequired = false;
  let trackingStatus = 'notDetermined';
  let epoch = 0;
  let active = null;
  let consentFlight = null;
  let initialization = null;
  let bridgeFlight = null;
  const ready = { rewarded: false, interstitial: false };
  const loadedAt = { rewarded: 0, interstitial: 0 };
  const loading = { rewarded: null, interstitial: null };
  const ids = { rewarded: rewardedAdUnitId, interstitial: interstitialAdUnitId };
  const listeners = new Set();
  const handles = [];
  const publish = () => {
    if (!disposed) for (const listener of [...listeners]) {
      try { listener({ canRequestAds: consent, privacyOptionsRequired: privacyRequired }); } catch {}
    }
  };

  function ensureBridge() {
    if (disposed || protocolFailed) return Promise.resolve(false);
    if (protocolReady) return Promise.resolve(true);
    if (bridgeFlight) return bridgeFlight;
    // Defer entry so synchronous native throws cannot leave a cached failed flight.
    const task = Promise.resolve().then(async () => {
      try {
        const result = await plugin.getPresentationCapabilities();
        if (result?.protocolVersion !== 1 || disposed) return false;
        // Wait for registration before preload/show; a missed Showed event loses cooldown.
        for (const [event, type] of [
          ['onRewardedVideoAdShowed', 'rewarded'], ['interstitialAdShowed', 'interstitial']
        ]) {
          const handle = await plugin.addListener(event, (payload) => {
            const attempt = active;
            if (!disposed && attempt?.type === type && payload?.requestId === attempt.requestId) attempt.markShown();
          });
          if (disposed) { await handle.remove(); return false; }
          else handles.push(handle);
        }
        protocolReady = !disposed;
        return protocolReady;
      } catch {
        protocolReady = false;
        for (const handle of handles.splice(0)) await Promise.resolve().then(() => handle.remove()).catch(() => {});
        return false;
      }
    }).finally(() => {
      if (bridgeFlight === task) bridgeFlight = null;
    });
    bridgeFlight = task;
    return bridgeFlight;
  }

  async function initialize() {
    initialization ??= Promise.resolve().then(() => plugin.initialize({ initializeForTesting: isTesting }))
      .catch((error) => { initialization = null; throw error; });
    return initialization;
  }

  function isReady(type) {
    // Google cached ads expire; refresh rather than offering a stale ad.
    return !disposed && protocolReady && consent && ready[type]
      && performance.now() - loadedAt[type] < 50 * 60 * 1000;
  }

  function load(type) {
    if (disposed || !ids[type] || !protocolReady) return Promise.resolve({ status: 'unavailable' });
    if (!consent) return Promise.resolve({ status: 'consent_required' });
    if (!isOnline()) return Promise.resolve({ status: 'offline' });
    if (isReady(type)) return Promise.resolve({ status: 'ready' });
    if (loading[type]) return loading[type];
    const generation = epoch;
    loading[type] = (async () => {
      try {
        await initialize();
        if (disposed || generation !== epoch || !consent) return { status: 'consent_required' };
        const method = type === 'rewarded' ? 'prepareRewardVideoAd' : 'prepareInterstitial';
        await plugin[method]({ adId: ids[type], isTesting });
        if (disposed || generation !== epoch || !consent) return { status: 'consent_required' };
        ready[type] = true;
        loadedAt[type] = performance.now();
        return { status: 'ready' };
      } catch {
        if (generation === epoch) ready[type] = false;
        return { status: isOnline() ? 'no_fill' : 'offline' };
      } finally { loading[type] = null; }
    })();
    return loading[type];
  }

  function syncConsentAndPreload({ requestATT = false, privacyOptions = false } = {}) {
    if (disposed) return Promise.resolve({ status: 'unavailable' });
    if (active) return Promise.resolve({ status: 'busy' });
    if (consentFlight) return consentFlight;
    consentFlight = (async () => {
      epoch++;
      consent = false;
      ready.rewarded = ready.interstitial = false;
      publish();
      try {
        if (!await ensureBridge() || disposed) return { status: 'unavailable' };
        if (privacyOptions) await plugin.showPrivacyOptionsForm();
        if (disposed) return { status: 'unavailable' };
        let info = await plugin.requestConsentInfo();
        if (disposed) return { status: 'unavailable' };
        // Updating privacy options must not immediately re-open an initial consent form.
        if (!privacyOptions && info?.isConsentFormAvailable === true && info.status === 'REQUIRED') {
          info = await plugin.showConsentForm();
        }
        if (disposed) return { status: 'unavailable' };
        consent = info?.canRequestAds === true;
        privacyRequired = info?.privacyOptionsRequirementStatus === 'REQUIRED';
        if (requestATT && consent && typeof plugin.trackingAuthorizationStatus === 'function') {
          trackingStatus = (await plugin.trackingAuthorizationStatus())?.status || 'notDetermined';
          if (trackingStatus === 'notDetermined') {
            await plugin.requestTrackingAuthorization();
            trackingStatus = (await plugin.trackingAuthorizationStatus())?.status || 'notDetermined';
          }
        }
        return { status: 'ok', canRequestAds: consent, privacyOptionsRequired: privacyRequired, trackingStatus };
      } catch {
        consent = false; // A failed refresh must never retain stale consent or a cached ad.
        return { status: 'error', canRequestAds: false, privacyOptionsRequired: privacyRequired };
      } finally {
        if (disposed) consent = false;
        publish();
        consentFlight = null;
        // Preload does not hold the modal/input lock. Old loads cannot publish readiness.
        if (!disposed && consent) {
          for (const type of ['rewarded', 'interstitial']) {
            Promise.resolve(loading[type]).then(() => load(type)).catch(() => {});
          }
        }
      }
    })();
    return consentFlight;
  }

  async function show(type, { requestId, onShown } = {}) {
    if (disposed || !requestId || active || consentFlight || !isReady(type) || !isOnline()) {
      return { requestId, status: 'not_ready', shown: false, closed: false, reward: null };
    }
    ready[type] = false;
    const attempt = { type, requestId, shown: false, markShown() {
      if (active === attempt && !attempt.shown && !disposed) {
        attempt.shown = true;
        try { onShown?.(); } catch {}
      }
    } };
    active = attempt;
    try {
      const method = type === 'rewarded' ? 'showRewardVideoAd' : 'showInterstitial';
      // Native call stays pending until dismiss/failure. No raw close or JS drain timer.
      const result = await plugin[method]({ requestId, adId: ids[type] });
      if (disposed) return { requestId, status: 'disposed', shown: result?.shown === true, closed: result?.closed === true, reward: null };
      if (result?.protocolVersion !== 1 || result.requestId !== requestId || result.closed !== true) {
        protocolReady = false; // Never grant from an upstream SDK's early show Promise.
        protocolFailed = true; // A malformed show cannot prove the native screen closed.
        return { requestId, status: 'protocol_error', shown: attempt.shown, closed: false, reward: null };
      }
      if (result.shown === true) attempt.markShown();
      return {
        requestId, status: result.status, shown: attempt.shown, closed: true,
        reward: type === 'rewarded' && result.shown === true && result.reward?.verified === true
          ? { verified: true } : null
      };
    } catch {
      // Patched native executors reject only before presenting; displayed failures resolve terminally.
      return { requestId, status: 'error', shown: attempt.shown, closed: !attempt.shown, reward: null };
    } finally {
      if (active === attempt) active = null;
      if (!disposed && consent && protocolReady) load(type);
    }
  }

  return {
    get supported() { return !disposed && protocolReady; },
    canRequestAds: () => !disposed && protocolReady && consent,
    isPrivacyOptionsRequired: () => !disposed && privacyRequired,
    getTrackingStatus: () => trackingStatus,
    syncConsentAndPreload,
    openPrivacyOptions: () => syncConsentAndPreload({ privacyOptions: true }),
    subscribeConsentChanges(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    isRewardedReady: () => isReady('rewarded'),
    isInterstitialReady: () => isReady('interstitial'),
    loadRewarded: () => load('rewarded'),
    loadInterstitial: () => load('interstitial'),
    showRewarded: (options) => show('rewarded', options),
    showInterstitial: (options) => show('interstitial', options),
    dispose() {
      disposed = true;
      epoch++;
      consent = false;
      ready.rewarded = ready.interstitial = false;
      listeners.clear();
      for (const handle of handles.splice(0)) Promise.resolve(handle.remove()).catch(() => {});
      // Do not fabricate a closed result or resolve a still-presented native screen.
    }
  };
}
