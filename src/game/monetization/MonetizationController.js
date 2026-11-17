import { AdPolicy } from './AdPolicy.js';
import { INTERSTITIAL_POLICY, PRODUCTS, REWARDED_POLICY } from './config.js';

// Only read-only queries expire. Never unlock an external presentation on a timer.
async function queryWithDeadline(query, milliseconds = 8000) {
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(query),
      new Promise((resolve) => { timer = setTimeout(() => resolve(null), milliseconds); })
    ]);
  } finally { clearTimeout(timer); }
}

export class MonetizationController {
  constructor({
    platform,
    state,
    stateStore,
    products = PRODUCTS,
    rewardedPolicy = REWARDED_POLICY,
    interstitialPolicy = INTERSTITIAL_POLICY,
    isOnline = () => globalThis.navigator?.onLine !== false,
    onStateChange = () => {},
    onRewardClaimed = () => {}
  }) {
    this.platform = platform;
    this.state = state;
    this.stateStore = stateStore;
    this.products = products;
    this.rewardedPolicy = rewardedPolicy;
    this.interstitialPolicy = interstitialPolicy;
    this.isOnline = isOnline;
    this.onStateChange = onStateChange;
    this.onRewardClaimed = onRewardClaimed;

    this.policy = new AdPolicy({ rewardedPolicy, interstitialPolicy });
    this.entitlementState = 'unknown'; // 'unknown' | 'not_owned' | 'owned'
    this.entitlementRevision = 0;
    this.activeRewardAttempt = null;
    this.catalogProduct = null;
    this.catalogLoading = false;
    this.iapNotice = null;
    this.bonusNotice = null;

    this.purchaseBusy = false;
    this.restoreBusy = false;
    this.adBusy = false;
    this.consentBusy = false;
    this.transitionInProgress = false;

    this.shopOpen = false;
    this.shopGeneration = 0;
    this.resultGeneration = 0;
    this.requestSeq = 0;
    this.currentOffer = null;
    this.disposed = false;

    this.unsubscribeTransactions = typeof this.platform.payments?.subscribeTransactions === 'function'
      ? this.platform.payments.subscribeTransactions((update) => this.handleTransactionUpdate(update))
      : () => {};
    this.unsubscribeRewardEvents = typeof this.platform.ads?.subscribeRewardEvents === 'function'
      ? this.platform.ads.subscribeRewardEvents((event) => this.handleRewardEvent(event))
      : () => {};
    this.unsubscribeConsentEvents = typeof this.platform.ads?.subscribeConsentChanges === 'function'
      ? this.platform.ads.subscribeConsentChanges(() => this.onStateChange())
      : () => {};
  }

  isBusy() {
    return this.purchaseBusy || this.restoreBusy || this.adBusy || this.transitionInProgress || this.consentBusy;
  }

  isPrivacyOptionsRequired() {
    return this.readAdFlag('isPrivacyOptionsRequired');
  }

  async openPrivacyOptions() {
    if (this.disposed || this.isBusy() || typeof this.platform.ads?.openPrivacyOptions !== 'function') {
      return { status: 'unavailable' };
    }
    this.consentBusy = true;
    this.onStateChange();
    try {
      const res = await this.platform.ads.openPrivacyOptions();
      if (!this.disposed) this.onStateChange();
      return res || { status: 'ok' };
    } catch {
      if (!this.disposed) this.onStateChange();
      return { status: 'error' };
    } finally {
      this.consentBusy = false;
      if (!this.disposed) this.onStateChange();
    }
  }

  async refreshAdConsent() {
    if (this.disposed || this.isBusy() || typeof this.platform.ads?.syncConsentAndPreload !== 'function') return;
    this.consentBusy = true;
    this.onStateChange();
    try { await this.platform.ads.syncConsentAndPreload({ requestATT: false }); }
    catch { /* Adapter keeps consent false on failure. */ }
    finally {
      this.consentBusy = false;
      if (!this.disposed) this.onStateChange();
    }
  }

  recordActiveTime(deltaSeconds) {
    if (!this.disposed && !this.isBusy()) {
      this.policy.recordActiveTime(deltaSeconds);
    }
  }

  recordMissionCompleted() {
    if (!this.disposed) {
      this.policy.recordMissionCompleted();
    }
  }

  resolveProductId(productDef) {
    if (!productDef) return null;
    if (this.platform.name === 'ios') return productDef.iosProductId || null;
    if (this.platform.name === 'android') return productDef.androidProductId || null;
    return null;
  }

  resolveAdUnitId(policy) {
    if (!policy) return null;
    if (this.platform.name === 'ios') return policy.iosAdUnitId || null;
    if (this.platform.name === 'android') return policy.androidAdUnitId || null;
    return null;
  }

  hasInterstitialBenefit() {
    return Boolean(this.platform.ads?.supported && this.interstitialPolicy.enabled && this.resolveAdUnitId(this.interstitialPolicy));
  }

  hasRewardedConfig() {
    return Boolean(this.rewardedPolicy.enabled && this.resolveAdUnitId(this.rewardedPolicy));
  }

  readAdFlag(method, placement) {
    try {
      const value = this.platform.ads?.[method]?.(placement);
      // Consent and readiness are cached synchronous booleans. Never wait at navigation.
      if (value && typeof value.then === 'function') value.catch?.(() => {});
      return value === true;
    } catch { return false; }
  }

  checkCanRequestAds() {
    return this.readAdFlag('canRequestAds');
  }

  isValidVerifiedResponse(response, removeAdsProductId) {
    if (response?.verified !== true || !removeAdsProductId || !Array.isArray(response.entitlements)) return false;
    return response.entitlements.every((entry) => entry && entry.verified === true
      && typeof entry.productId === 'string' && entry.productId.trim().length > 0
      && typeof entry.owned === 'boolean');
  }

  applyVerifiedEntitlements(response, removeAdsProductId, revision) {
    if (revision !== this.entitlementRevision || !this.isValidVerifiedResponse(response, removeAdsProductId)) {
      return false;
    }
    const owned = Boolean(
      removeAdsProductId &&
      response.entitlements.some(
        (entry) => entry && entry.productId === removeAdsProductId && entry.verified === true && entry.owned === true
      )
    );
    this.entitlementState = owned ? 'owned' : 'not_owned';
    this.entitlementRevision += 1;
    return true;
  }

  handleTransactionUpdate(update) {
    if (this.disposed || !update) return;
    const def = this.products.find((entry) => entry.key === 'remove_ads');
    const productId = this.resolveProductId(def);
    if (!productId || update.productId !== productId || update.verified !== true || typeof update.owned !== 'boolean') return;
    this.entitlementRevision += 1;
    this.entitlementState = update.owned === true ? 'owned' : 'not_owned';
    if (this.entitlementState === 'owned') {
      this.iapNotice = { tone: 'info', text: '전면 광고 제거 권한이 확인되었습니다.' };
    }
    this.onStateChange();
  }

  async refreshEntitlements() {
    if (this.disposed || this.purchaseBusy || this.restoreBusy || !this.platform.payments?.supported) return this.entitlementState;
    if (this.entitlementsPromise) return this.entitlementsPromise;
    const def = this.products.find((entry) => entry.key === 'remove_ads');
    const productId = this.resolveProductId(def);
    const revision = this.entitlementRevision;
    this.entitlementsPromise = (async () => {
      try {
        const res = await queryWithDeadline(() => this.platform.payments.getEntitlements());
        if (!this.disposed && res?.status === 'ok') {
          this.applyVerifiedEntitlements(res, productId, revision);
        }
      } catch {
        // Network or query errors must not erase an already verified entitlement.
      } finally {
        this.entitlementsPromise = null;
      }
      return this.entitlementState;
    })();
    return this.entitlementsPromise;
  }

  openShop() {
    this.shopOpen = true;
    this.shopGeneration += 1;
    this.iapNotice = null;
    const generation = this.shopGeneration;
    this.refreshShopCatalog(generation);
  }

  closeShop() {
    this.shopOpen = false;
    this.shopGeneration += 1;
  }

  async refreshShopCatalog(generation) {
    if (this.disposed || generation !== this.shopGeneration) return;
    const def = this.products.find((entry) => entry.key === 'remove_ads');
    const productId = this.resolveProductId(def);
    if (!this.platform.payments?.supported || !productId || !this.hasInterstitialBenefit()) {
      this.catalogProduct = null;
      this.catalogLoading = false;
      if (this.shopOpen && generation === this.shopGeneration && !this.disposed) {
        this.onStateChange();
      }
      return;
    }

    this.catalogProduct = null;
    this.catalogLoading = true;
    if (this.shopOpen && generation === this.shopGeneration && !this.disposed) {
      this.onStateChange();
    }

    try {
      const [productsRes] = await Promise.all([
        queryWithDeadline(() => this.platform.payments.getProducts([productId])),
        this.refreshEntitlements()
      ]);
      if (this.disposed || generation !== this.shopGeneration) return;
      if (productsRes?.status === 'ok' && Array.isArray(productsRes.products)) {
        const match = productsRes.products.find((item) => item && item.productId === productId);
        const validPrice = typeof match?.displayPrice === 'string' && match.displayPrice.trim().length > 0;
        if (match && match.available === true && validPrice && this.hasInterstitialBenefit()) {
          this.catalogProduct = {
            key: def.key,
            productId,
            title: def.title,
            description: def.description,
            displayPrice: match.displayPrice.trim()
          };
        } else {
          this.catalogProduct = null;
        }
      } else {
        this.catalogProduct = null;
      }
    } catch {
      if (!this.disposed && generation === this.shopGeneration) this.catalogProduct = null;
    } finally {
      if (generation === this.shopGeneration) this.catalogLoading = false;
      if (!this.disposed && this.shopOpen && generation === this.shopGeneration) {
        this.onStateChange();
      }
    }
  }

  getShopSnapshot() {
    const paymentsSupported = Boolean(this.platform.payments?.supported);
    const owned = this.entitlementState === 'owned';
    const sellable = Boolean(paymentsSupported && this.entitlementState === 'not_owned' && this.catalogProduct && this.hasInterstitialBenefit());
    return {
      paymentsSupported,
      owned,
      entitlementState: this.entitlementState,
      sellable,
      loading: this.catalogLoading,
      busy: this.isBusy(),
      product: sellable ? this.catalogProduct : null,
      notice: this.iapNotice
    };
  }

  async purchaseRemoveAds() {
    if (this.disposed || this.isBusy()) return { status: 'busy' };
    const snapshot = this.getShopSnapshot();
    if (!snapshot.sellable || !snapshot.product) {
      this.iapNotice = { tone: 'error', text: '현재 구매할 수 있는 상품이 없습니다.' };
      this.onStateChange();
      return { status: 'unavailable' };
    }
    if (!this.isOnline()) {
      this.iapNotice = { tone: 'error', text: '오프라인 상태에서는 구매할 수 없습니다.' };
      this.onStateChange();
      return { status: 'offline' };
    }

    this.purchaseBusy = true;
    this.iapNotice = { tone: 'info', text: '결제를 진행하는 중입니다…' };
    this.onStateChange();

    const productId = snapshot.product.productId;
    const revision = ++this.entitlementRevision;
    try {
      const res = await this.platform.payments.purchase(productId);
      if (this.disposed) return { status: 'disposed' };
      if (
        res?.status === 'success' &&
        res.entitlement?.verified === true &&
        res.entitlement?.owned === true &&
        res.entitlement?.productId === productId
      ) {
        if (revision !== this.entitlementRevision && this.entitlementState !== 'owned') return { status: 'superseded' };
        this.entitlementRevision += 1;
        this.entitlementState = 'owned';
        this.iapNotice = { tone: 'info', text: '전면 광고 제거가 적용되었습니다.' };
        return { status: 'success' };
      }
      if (res?.status === 'cancelled') {
        this.iapNotice = { tone: 'info', text: '구매가 취소되었습니다.' };
        return { status: 'cancelled' };
      }
      if (res?.status === 'pending') {
        this.iapNotice = { tone: 'info', text: '결제 승인 대기 중입니다. 승인 완료 후 자동으로 적용됩니다.' };
        return { status: 'pending' };
      }
      if (res?.status === 'offline') {
        this.iapNotice = { tone: 'error', text: '오프라인 상태에서는 구매할 수 없습니다.' };
        return { status: 'offline' };
      }
      this.iapNotice = { tone: 'error', text: '구매를 완료하지 못했습니다. 잠시 후 다시 시도해주세요.' };
      return { status: res?.status === 'success' ? 'unverified' : (res?.status || 'error') };
    } catch {
      if (!this.disposed) {
        this.iapNotice = { tone: 'error', text: '구매를 완료하지 못했습니다. 잠시 후 다시 시도해주세요.' };
      }
      return { status: 'error' };
    } finally {
      this.purchaseBusy = false;
      if (!this.disposed) this.onStateChange();
    }
  }

  async restorePurchases() {
    if (this.disposed || this.isBusy()) return { status: 'busy' };
    if (!this.platform.payments?.supported) {
      this.iapNotice = { tone: 'error', text: '현재 환경에서는 구매 복원을 이용할 수 없습니다.' };
      this.onStateChange();
      return { status: 'unavailable' };
    }
    if (!this.isOnline()) {
      this.iapNotice = { tone: 'error', text: '오프라인 상태에서는 구매 복원을 진행할 수 없습니다.' };
      this.onStateChange();
      return { status: 'offline' };
    }

    const def = this.products.find((entry) => entry.key === 'remove_ads');
    const productId = this.resolveProductId(def);

    this.restoreBusy = true;
    const revision = ++this.entitlementRevision;
    this.iapNotice = { tone: 'info', text: '구매 내역을 복원하는 중입니다…' };
    this.onStateChange();

    try {
      const res = await this.platform.payments.restore();
      if (this.disposed) return { status: 'disposed' };
      if (res?.status === 'ok') {
        const applied = this.applyVerifiedEntitlements(res, productId, revision);
        const supersededByVerifiedUpdate = !applied
          && this.isValidVerifiedResponse(res, productId)
          && revision !== this.entitlementRevision
          && this.entitlementState !== 'unknown';
        if (!applied && !supersededByVerifiedUpdate) {
          this.iapNotice = { tone: 'error', text: '검증된 최신 구매 내역을 확인하지 못했습니다.' };
          return { status: 'unverified' };
        }
        this.iapNotice = this.entitlementState === 'owned'
          ? { tone: 'info', text: '전면 광고 제거 구매가 복원되었습니다.' }
          : { tone: 'info', text: '복원할 전면 광고 제거 내역이 없습니다.' };
        return { status: 'ok', owned: this.entitlementState === 'owned' };
      }
      if (res?.status === 'offline') {
        this.iapNotice = { tone: 'error', text: '오프라인 상태에서는 구매 복원을 진행할 수 없습니다.' };
        return { status: 'offline' };
      }
      this.iapNotice = { tone: 'error', text: '구매 내역을 확인하지 못했습니다. 잠시 후 다시 시도해주세요.' };
      return { status: res?.status || 'error' };
    } catch {
      if (!this.disposed) {
        this.iapNotice = { tone: 'error', text: '구매 내역을 확인하지 못했습니다. 잠시 후 다시 시도해주세요.' };
      }
      return { status: 'error' };
    } finally {
      this.restoreBusy = false;
      if (!this.disposed) this.onStateChange();
    }
  }

  invalidateRewardOffer() {
    this.resultGeneration += 1;
    if (this.currentOffer) {
      this.currentOffer.active = false;
      this.currentOffer = null;
    }
    this.bonusNotice = null;
  }

  getRewardOfferSnapshot() {
    const offer = this.currentOffer;
    return {
      offer: offer && offer.active && !offer.claimed
        ? { requestId: offer.requestId, missionId: offer.missionId, bonusCoins: offer.bonusCoins }
        : null,
      busy: this.adBusy,
      notice: this.bonusNotice
    };
  }

  async prepareMissionResult(result) {
    this.invalidateRewardOffer();
    const generation = this.resultGeneration;
    if (!result || !result.isFirst || !result.mission) return null;

    let saved = false;
    try {
      saved = Boolean(await result.whenSaved);
    } catch {
      saved = false;
    }
    if (this.disposed || generation !== this.resultGeneration) return null;
    if (!saved || this.state.capabilities.storageBlocked || !this.state.capabilities.storage) return null;
    if (!this.hasRewardedConfig()) return null;

    const canRequest = this.checkCanRequestAds();
    if (this.disposed || generation !== this.resultGeneration) return null;

    const placement = this.rewardedPolicy.placement;
    const ready = this.readAdFlag('isRewardedReady', placement);
    const eligible = this.policy.canOfferRewarded({
      mission: result.mission,
      isFirst: result.isFirst,
      basicRewardSaved: saved,
      rewardedMissionIds: this.state.progression.rewardedMissionIds,
      adsSupported: Boolean(this.platform.ads?.supported),
      canRequestAds: canRequest,
      isRewardedReady: ready,
      isOnline: this.isOnline()
    });
    if (!eligible) return null;

    const bonusCoins = this.policy.calculateBonus(result.mission);
    this.requestSeq += 1;
    this.currentOffer = {
      requestId: `rew_${this.requestSeq}`,
      missionId: result.mission.id,
      bonusCoins,
      active: true,
      claimed: false,
      inFlight: false
    };
    this.onStateChange();
    return this.getRewardOfferSnapshot().offer;
  }

  grantOfferReward(offer) {
    if (!offer || !offer.active || offer.claimed || this.disposed) return false;
    offer.claimed = true;
    const claimed = this.stateStore.claimMissionAdBonus(this.state, offer.missionId);
    if (!claimed) return false;
    this.bonusNotice = {
      tone: 'info',
      text: `보너스 +${claimed.bonus.toLocaleString()} 코인을 받았습니다!`
    };
    this.onRewardClaimed(claimed);
    this.onStateChange();
    return true;
  }

  handleRewardEvent(event) {
    if (this.disposed || !event || event.verified !== true) return false;
    const attempt = this.activeRewardAttempt;
    if (!attempt || attempt.requestId !== event.requestId || !attempt.offer.inFlight) return false;
    attempt.recordShown();
    return this.grantOfferReward(attempt.offer);
  }

  async watchRewardedBonus() {
    const offer = this.currentOffer;
    if (this.disposed || !offer || !offer.active || offer.claimed || offer.inFlight || this.isBusy()) {
      return { status: 'ignored' };
    }
    if (!this.isOnline()) {
      this.bonusNotice = { tone: 'error', text: '오프라인 상태에서는 광고를 재생할 수 없습니다.' };
      this.onStateChange();
      return { status: 'offline' };
    }
    if (!this.hasRewardedConfig() || !this.platform.ads?.supported || !this.checkCanRequestAds()
      || !this.readAdFlag('isRewardedReady', this.rewardedPolicy.placement)
      || this.state.capabilities.storageBlocked || !this.state.capabilities.storage) {
      this.bonusNotice = { tone: 'error', text: '현재 보상 광고를 이용할 수 없습니다. 기본 보상은 유지됩니다.' };
      this.onStateChange();
      return { status: 'unavailable' };
    }

    offer.inFlight = true;
    const requestId = `reward_attempt_${++this.requestSeq}`;
    let shown = false;
    const attempt = { requestId, offer, recordShown: () => {
      if (!this.disposed && this.activeRewardAttempt === attempt && !shown) {
        shown = true;
        this.policy.recordRewardedShown();
      }
    } };
    this.activeRewardAttempt = attempt;
    this.adBusy = true;
    this.bonusNotice = { tone: 'info', text: '보상 광고를 준비하고 있습니다…' };
    this.onStateChange();

    try {
      const res = await this.platform.ads.showRewarded({
        requestId,
        placement: this.rewardedPolicy.placement,
        onShown: attempt.recordShown
      });
      if (this.disposed) return { status: 'disposed' };

      if (res?.requestId === requestId) {
        if (res.shown === true) attempt.recordShown();
        if (res.reward?.verified === true) this.handleRewardEvent({ requestId, verified: true });
      }

      if (offer.claimed) {
        return { status: 'rewarded', bonus: offer.bonusCoins };
      }

      if (offer.active) {
        if (res?.status === 'cancelled' || res?.status === 'closed') {
          this.bonusNotice = { tone: 'error', text: '광고를 끝까지 시청하지 않아 보상이 지급되지 않았습니다.' };
        } else {
          this.bonusNotice = { tone: 'error', text: '광고를 재생할 수 없습니다. 기본 보상은 이미 지급되었습니다.' };
        }
      }
      return { status: res?.status || 'no_reward', bonus: 0 };
    } catch {
      if (!this.disposed && offer.active && !offer.claimed) {
        this.bonusNotice = { tone: 'error', text: '광고 재생 중 오류가 발생했습니다. 기본 보상은 이미 지급되었습니다.' };
      }
      return { status: 'error', bonus: 0 };
    } finally {
      if (this.activeRewardAttempt === attempt) this.activeRewardAttempt = null;
      offer.inFlight = false;
      this.adBusy = false;
      if (!this.disposed) this.onStateChange();
    }
  }

  async runResultExitTransition(navigate, { allowInterstitial = true } = {}) {
    if (this.disposed || this.isBusy()) return false;
    this.transitionInProgress = true;
    this.invalidateRewardOffer();
    this.onStateChange();

    try {
      if (allowInterstitial && this.hasInterstitialBenefit() && this.platform.ads?.supported && this.isOnline()) {
        const canRequest = this.checkCanRequestAds();
        const placement = this.interstitialPolicy.placement;
        const ready = this.readAdFlag('isInterstitialReady', placement);
        const eligible = this.policy.canShowInterstitial({
          entitlementState: this.entitlementState,
          adsSupported: Boolean(this.platform.ads?.supported),
          canRequestAds: canRequest,
          isInterstitialReady: ready,
          isOnline: this.isOnline()
        });

        if (eligible) {
          this.requestSeq += 1;
          const requestId = `int_${this.requestSeq}`;
          this.adBusy = true;
          this.onStateChange();
          let adResult = null;
          let shown = false;
          let settled = false;
          const onShown = () => {
            if (!shown && !settled && !this.disposed && this.adBusy) {
              shown = true;
              this.policy.recordInterstitialShown();
            }
          };
          try {
            adResult = await this.platform.ads.showInterstitial({ requestId, placement, onShown });
            if (adResult?.requestId === requestId && adResult.shown === true) onShown();
          } catch {
            adResult = { requestId, status: 'error', shown: false, closed: true };
          } finally {
            settled = true;
            this.adBusy = false;
          }
        }
      }
    } catch {
      // A failed eligibility/readiness check must not trap the result screen.
    }

    try {
      if (!this.disposed) await navigate();
      return true;
    } finally {
      this.transitionInProgress = false;
      if (!this.disposed) this.onStateChange();
    }
  }

  dispose() {
    this.disposed = true;
    this.invalidateRewardOffer();
    this.closeShop();
    this.unsubscribeTransactions();
    this.unsubscribeRewardEvents();
    this.unsubscribeConsentEvents();
  }
}
