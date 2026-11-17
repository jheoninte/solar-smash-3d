// Platform contracts for IAP and Ads. Default implementation stays unavailable.
// Purchases/transactions require an SDK-verified productId and boolean owned.
// Entitlement queries/restores return {status:'ok', verified:true, entitlements:[...]}
// only for a complete authoritative verified snapshot (including an empty list).
// All list entries must also be verified. Query errors never revoke rights.
//
// Ads: consent/readiness methods return cached synchronous booleans (default false).
// show* receives {requestId, placement, onShown}. onShown fires only at actual display.
// Its Promise MUST stay pending until native UI has ended AND reward callbacks have
// been normalized, regardless of raw close/reward order. It returns the same requestId,
// shown, closed and optionally reward:{verified:true} from the SDK reward event.
// A raw close callback alone is not terminal; the native adapter owns this ordering.
// Reject only after the presentation has ended (or failed before display).
// No timer may unlock a displayed ad. Reward events carry the active attempt ID;
// events before show or after terminal settlement are ignored. Never synthesize rewards.
export function createUnavailablePayments() {
  return {
    supported: false,
    async getProducts() {
      return { status: 'unavailable', products: [] };
    },
    async purchase() {
      return { status: 'unavailable' };
    },
    async restore() {
      return { status: 'unavailable', entitlements: [] };
    },
    async getEntitlements() {
      return { status: 'unavailable', entitlements: [] };
    },
    subscribeTransactions() {
      return () => {};
    }
  };
}

export function createUnavailableAds() {
  return {
    supported: false,
    canRequestAds() {
      return false;
    },
    isRewardedReady() {
      return false;
    },
    async loadRewarded() {
      return { status: 'unavailable' };
    },
    async showRewarded({ requestId } = {}) {
      return { requestId: requestId ?? null, status: 'unavailable', shown: false, closed: false, reward: null };
    },
    subscribeRewardEvents() {
      return () => {};
    },
    isInterstitialReady() {
      return false;
    },
    async loadInterstitial() {
      return { status: 'unavailable' };
    },
    async showInterstitial({ requestId } = {}) {
      return { requestId: requestId ?? null, status: 'unavailable', shown: false, closed: false };
    }
  };
}
