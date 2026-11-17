import { createUnavailablePayments } from './monetization.js';

function isVerifiedEntitlement(entry) {
  return Boolean(
    entry &&
    typeof entry === 'object' &&
    typeof entry.productId === 'string' &&
    entry.productId.length > 0 &&
    entry.verified === true &&
    typeof entry.owned === 'boolean'
  );
}

export function createStoreKit2Payments({
  plugin,
  isOnline = () => globalThis.navigator?.onLine !== false
} = {}) {
  if (!plugin) return createUnavailablePayments();

  const transactionListeners = new Set();
  let nativeHandlePromise = null;
  let disposed = false;

  function ensureNativeListener() {
    if (nativeHandlePromise || typeof plugin.addListener !== 'function') return;
    nativeHandlePromise = Promise.resolve()
      .then(() => plugin.addListener('transactionUpdate', (raw) => {
        if (disposed || !isVerifiedEntitlement(raw)) return;
        const update = {
          productId: raw.productId,
          owned: raw.owned,
          verified: true,
          transactionId: typeof raw.transactionId === 'string' ? raw.transactionId : null
        };
        for (const listener of [...transactionListeners]) {
          try { listener(update); } catch { /* Isolate subscriber failures. */ }
        }
      }))
      .catch(() => { nativeHandlePromise = null; });
  }

  return {
    supported: true,

    async getProducts(productIds) {
      if (disposed) return { status: 'unavailable', products: [] };
      const ids = Array.isArray(productIds)
        ? [...new Set(productIds.filter((id) => typeof id === 'string' && id.trim().length > 0))]
        : [];
      if (ids.length === 0) return { status: 'ok', products: [] };
      if (!isOnline()) return { status: 'offline', products: [] };

      try {
        const res = await plugin.getProducts({ productIds: ids });
        if (disposed) return { status: 'unavailable', products: [] };
        if (res?.status !== 'ok' || !Array.isArray(res.products)) {
          return { status: res?.status === 'offline' ? 'offline' : 'error', products: [] };
        }
        const products = res.products
          .filter((item) => item && typeof item.productId === 'string' && item.productId.length > 0)
          .map((item) => ({
            productId: item.productId,
            displayPrice: typeof item.displayPrice === 'string' ? item.displayPrice.trim() : '',
            available: item.available === true && typeof item.displayPrice === 'string' && item.displayPrice.trim().length > 0
          }));
        return { status: 'ok', products };
      } catch {
        return { status: isOnline() ? 'error' : 'offline', products: [] };
      }
    },

    async purchase(productId) {
      if (disposed || typeof productId !== 'string' || productId.length === 0) {
        return { status: 'error' };
      }
      if (!isOnline()) return { status: 'offline' };

      try {
        const res = await plugin.purchase({ productId });
        if (disposed) return { status: 'unavailable' };
        if (!res || typeof res !== 'object') return { status: 'error' };
        if (res.status === 'cancelled' || res.status === 'pending' || res.status === 'offline') {
          return { status: res.status };
        }
        if (res.status === 'unverified') {
          return { status: 'unverified' };
        }
        if (res.status === 'success') {
          if (!isVerifiedEntitlement(res.entitlement) || res.entitlement.productId !== productId) {
            return { status: 'unverified' };
          }
          return {
            status: 'success',
            entitlement: {
              productId: res.entitlement.productId,
              owned: res.entitlement.owned,
              verified: true
            }
          };
        }
        return { status: 'error' };
      } catch {
        return { status: isOnline() ? 'error' : 'offline' };
      }
    },

    async restore() {
      if (disposed) return { status: 'unavailable', entitlements: [] };
      if (!isOnline()) return { status: 'offline', entitlements: [] };

      try {
        const res = await plugin.restore();
        if (disposed) return { status: 'unavailable', entitlements: [] };
        if (res?.status === 'cancelled' || res?.status === 'offline') {
          return { status: res.status, entitlements: [] };
        }
        if (res?.status !== 'ok' || res.verified !== true || !Array.isArray(res.entitlements)) {
          return { status: 'error', entitlements: [] };
        }
        if (!res.entitlements.every(isVerifiedEntitlement)) {
          return { status: 'error', entitlements: [] };
        }
        return {
          status: 'ok',
          verified: true,
          entitlements: res.entitlements.map((entry) => ({
            productId: entry.productId,
            owned: entry.owned,
            verified: true
          }))
        };
      } catch {
        return { status: isOnline() ? 'error' : 'offline', entitlements: [] };
      }
    },

    async getEntitlements() {
      if (disposed) return { status: 'unavailable', entitlements: [] };
      try {
        const res = await plugin.getEntitlements();
        if (disposed) return { status: 'unavailable', entitlements: [] };
        if (res?.status !== 'ok' || res.verified !== true || !Array.isArray(res.entitlements)) {
          return { status: res?.status === 'offline' ? 'offline' : 'error', entitlements: [] };
        }
        if (!res.entitlements.every(isVerifiedEntitlement)) {
          return { status: 'error', entitlements: [] };
        }
        return {
          status: 'ok',
          verified: true,
          entitlements: res.entitlements.map((entry) => ({
            productId: entry.productId,
            owned: entry.owned,
            verified: true
          }))
        };
      } catch {
        return { status: isOnline() ? 'error' : 'offline', entitlements: [] };
      }
    },

    subscribeTransactions(listener) {
      if (disposed || typeof listener !== 'function') return () => {};
      transactionListeners.add(listener);
      ensureNativeListener();
      return () => {
        transactionListeners.delete(listener);
      };
    },

    dispose() {
      disposed = true;
      transactionListeners.clear();
      if (nativeHandlePromise) {
        nativeHandlePromise.then((handle) => handle?.remove?.()).catch(() => {});
        nativeHandlePromise = null;
      }
    }
  };
}
