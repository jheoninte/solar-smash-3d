import { getCollectionGoal } from '../game/shop/collection.js';
import {
  MISSIONS,
  evaluateMissionStars,
  formatDurationMs,
  getNextStarGoal,
  isValidActiveMs
} from '../game/missions/definitions.js';

function formatStarGlyphs(stars) {
  const count = Math.max(0, Math.min(3, stars));
  return '★'.repeat(count) + '☆'.repeat(3 - count);
}

export class UIManager {
  constructor({ root, stat, modeButtons, weaponButtons, resetButton }) {
    this.root = root;
    this.stat = stat;
    this.modeButtons = modeButtons;
    this.weaponButtons = weaponButtons;
    this.resetButton = resetButton;
    this.listDialog = document.getElementById('mission-select-overlay');
    this.resultDialog = document.getElementById('mission-result-overlay');
    this.shopDialog = document.getElementById('shop-overlay');
    this.settingsDialog = document.getElementById('settings-overlay');
    this.tutorialDialog = document.getElementById('tutorial-overlay');
    this.lastHudCache = null;
  }

  init({ hubGameActive, mode, weapon, onModeChange, onWeaponChange, onReset,
    onMissionList, onMissionStart, onMissionExit, onShopOpen, onShopClose, onShopBuy, onShopEquip,
    onPurchaseRemoveAds, onRestorePurchases, onWatchRewardedAd, onResultNext, onResultRetry, onResultSandbox,
    settingsStore, hapticsSupported, isMonetizationBusy, isPrivacyOptionsRequired, onOpenPrivacyOptions,
    onSettingsChange, onCameraReset, onTutorialDismiss, onModalChange, onAutoFireToggle }) {
    Object.assign(this, {
      settingsStore,
      hapticsSupported,
      isMonetizationBusy: isMonetizationBusy || (() => false),
      isPrivacyOptionsRequired: isPrivacyOptionsRequired || (() => false),
      onOpenPrivacyOptions,
      onTutorialDismiss,
      onModalChange,
      onPurchaseRemoveAds,
      onRestorePurchases,
      onWatchRewardedAd,
      onResultNext,
      onResultRetry,
      onResultSandbox
    });
    // Capture before every HUD/dialog handler while native UI owns the interaction.
    for (const surface of [this.root, this.listDialog, this.resultDialog, this.shopDialog, this.settingsDialog, this.tutorialDialog]) {
      for (const type of ['click', 'input', 'change']) {
        surface.addEventListener(type, (event) => {
          if (this.isMonetizationBusy()) {
            event.preventDefault();
            event.stopImmediatePropagation();
          }
        }, true);
      }
    }
    document.getElementById('btn-open-settings').addEventListener('click', () => this.showSettings());
    document.getElementById('btn-settings-close').addEventListener('click', () => this.closeSettings());
    document.getElementById('btn-show-tutorial').addEventListener('click', () => this.showTutorial(true));
    document.getElementById('btn-privacy-options')?.addEventListener('click', () => {
      if (!this.isMonetizationBusy()) this.onOpenPrivacyOptions?.();
    });
    document.getElementById('btn-tutorial-close').addEventListener('click', () => this.closeTutorial());
    document.getElementById('btn-camera-reset').addEventListener('click', onCameraReset);
    for (const [id, key] of [['toggle-sound', 'soundEnabled'], ['toggle-haptics', 'hapticsEnabled']]) {
      document.getElementById(id).addEventListener('change', (event) => onSettingsChange(key, event.target.checked));
    }
    document.getElementById('range-volume').addEventListener('input', (event) => {
      onSettingsChange('volume', Number(event.target.value) / 100);
      document.getElementById('volume-value').textContent = event.target.value + '%';
    });
    this.settingsDialog.addEventListener('cancel', (event) => { event.preventDefault(); this.closeSettings(); });
    this.tutorialDialog.addEventListener('cancel', (event) => { event.preventDefault(); this.closeTutorial(); });
    for (const button of this.modeButtons) {
      button.addEventListener('click', () => onModeChange(button.dataset.mode));
    }
    for (const button of this.weaponButtons) {
      button.addEventListener('click', () => onWeaponChange(button.dataset.w));
    }
    this.resetButton.addEventListener('click', onReset);
    document.getElementById('btn-auto-fire').addEventListener('click', onAutoFireToggle);
    this.updateAutoFire(false);
    document.getElementById('btn-open-missions').addEventListener('click', onMissionList);
    document.getElementById('btn-open-shop').addEventListener('click', onShopOpen);
    document.getElementById('btn-shop-close').addEventListener('click', () => {
      if (this.isMonetizationBusy()) return;
      onShopClose?.();
      onMissionExit();
    });
    this.onShopBuy = onShopBuy;
    this.onShopEquip = onShopEquip;
    document.getElementById('btn-sandbox').addEventListener('click', onMissionExit);
    document.getElementById('btn-mission-exit').addEventListener('click', onMissionExit);
    document.getElementById('btn-mission-rewarded-ad').addEventListener('click', () => {
      if (!this.isMonetizationBusy()) this.onWatchRewardedAd?.();
    });
    document.getElementById('btn-mission-result-close').addEventListener('click', () => {
      if (!this.isMonetizationBusy()) (this.onResultSandbox || onMissionExit)();
    });
    document.getElementById('btn-mission-retry').addEventListener('click', () => {
      if (!this.isMonetizationBusy()) (this.onResultRetry || onMissionStart)(this.resultMissionId);
    });
    document.getElementById('btn-mission-next').addEventListener('click', () => {
      if (this.isMonetizationBusy()) return;
      const index = MISSIONS.findIndex((mission) => mission.id === this.resultMissionId);
      if (MISSIONS[index + 1]) {
        if (this.onResultNext) this.onResultNext(MISSIONS[index + 1].id);
        else onMissionStart(MISSIONS[index + 1].id);
      }
    });
    for (const dialog of [this.listDialog, this.resultDialog, this.shopDialog]) {
      dialog.addEventListener('cancel', (event) => {
        event.preventDefault();
        if (this.isMonetizationBusy()) return;
        if (dialog === this.shopDialog) onShopClose?.();
        if (dialog === this.resultDialog && this.onResultSandbox) {
          this.onResultSandbox();
          return;
        }
        onMissionExit();
      });
    }
    this.onMissionStart = onMissionStart;
    this.syncSelection(mode, weapon);
    for (const element of document.querySelectorAll('[data-hub-only]')) {
      if (!hubGameActive) element.remove();
    }
  }

  updateAutoFire(enabled) {
    const button = document.getElementById('btn-auto-fire');
    button.setAttribute('aria-pressed', String(enabled));
    button.classList.toggle('is-active', enabled);
    button.textContent = enabled ? '공격 중 · 눌러서 중지' : '자동공격 시작';
  }

  updateAimPoint(point) {
    const reticle = document.getElementById('aim-reticle');
    reticle.hidden = !point;
    if (point) {
      const left = point.clientX + 'px', top = point.clientY + 'px';
      if (reticle.style.left !== left) reticle.style.left = left;
      if (reticle.style.top !== top) reticle.style.top = top;
    }
  }

  renderCollectionGoal(id, state) {
    const box = document.getElementById(id);
    const goal = getCollectionGoal(state?.progression);
    const key = JSON.stringify(goal);
    if (box.dataset.goal === key) return;
    box.dataset.goal = key;
    box.replaceChildren();
    const title = document.createElement('strong');
    title.textContent = goal ? '다음 수집 목표 · ' + goal.name : '모든 행성 외형을 모았어요!';
    box.append(title);
    if (!goal) return;
    const progress = document.createElement('progress');
    progress.max = goal.price;
    progress.value = goal.progress;
    progress.setAttribute('aria-label', goal.name + ' 구매에 필요한 코인');
    const message = document.createElement('p');
    message.textContent = goal.missingCoins > 0
      ? goal.missingCoins.toLocaleString() + ' 코인 더 모으면 해금 · ' + goal.coins.toLocaleString() + ' / ' + goal.price
      : '코인이 충분해요. 상점에서 구매할 수 있어요!';
    box.append(progress, message);
    if (goal.missingCoins > 0 && goal.missionTitle) {
      const recommendation = document.createElement('p');
      recommendation.textContent = '다음 도전: ' + goal.missionTitle + ' · 첫 완료 코인 획득';
      box.append(recommendation);
    }
  }

  syncSelection(mode, weapon) {
    for (const button of this.modeButtons) {
      button.classList.toggle('is-active', button.dataset.mode === mode);
      button.setAttribute('aria-pressed', String(button.dataset.mode === mode));
    }
    for (const button of this.weaponButtons) {
      button.classList.toggle('is-active', button.dataset.w === weapon);
      button.setAttribute('aria-pressed', String(button.dataset.w === weapon));
    }
  }

  updateStats(state, projectileCount) {
    const text = '데미지 ' + state.stats.damage + ' · 명중 ' + state.stats.impactCount + ' · 비행 중 ' + projectileCount;
    if (this.stat.textContent !== text) this.stat.textContent = text;
    const wallet = document.getElementById('player-coins');
    const coins = state.progression.coins.toLocaleString() + ' 코인';
    if (wallet.textContent !== coins) wallet.textContent = coins;
    this.currentState = state;
    if (this.resultDialog.open) this.renderCollectionGoal('mission-result-collection', state);
    this.updateSaveNotices(state);
    this.updateSettingsStatus();
  }

  updateSaveNotices(state) {
    const { isSaving, storage, storageBlocked, hasSaved } = state.capabilities;
    const message = storageBlocked
      ? '이전 저장을 읽지 못해 덮어쓰기를 중단했습니다. 현재 진행은 임시로 유지됩니다. 앱을 다시 열어 확인해주세요.'
      : isSaving ? '기기에 저장 중입니다…'
        : !storage ? '저장하지 못했습니다. 변경 사항은 현재 실행 중에만 유지됩니다.'
          : hasSaved ? '기기에 저장되었습니다.' : '';
    for (const id of ['save-status', 'shop-save-status', 'result-save-status']) {
      const element = document.getElementById(id);
      if (element.textContent !== message) element.textContent = message;
      element.hidden = !message || (id === 'save-status' && !storageBlocked && storage);
      element.classList.toggle('info', !storageBlocked && (isSaving || storage));
    }
  }

  updateMissionHUD(snapshot) {
    const hud = document.getElementById('mission-hud');
    const playKind = document.getElementById('play-kind');
    if (!snapshot) {
      if (this.lastHudCache !== null) {
        hud.querySelector('details').open = false;
        hud.hidden = true;
        playKind.textContent = 'SANDBOX';
        this.lastHudCache = null;
      }
      return;
    }

    const { mission, progress, activeMs = 0 } = snapshot;
    const goal = mission.req.count || mission.req.damage;
    const current = Math.min(mission.req.count ? progress.count : progress.damage, goal);
    const titleText = mission.title;
    const progressText = current + ' / ' + goal + (mission.req.count ? '회 명중' : ' 데미지');
    const timeText = '경과 ' + formatDurationMs(activeMs) + ' · 3★ ' + formatDurationMs(mission.stars.threeStarMaxMs) + ' 이하';
    const goalText = mission.desc;

    const prev = this.lastHudCache || {};
    if (hud.hidden) hud.hidden = false;
    if (playKind.textContent !== 'MISSION') playKind.textContent = 'MISSION';
    if (prev.titleText !== titleText) {
      document.getElementById('mission-hud-title').textContent = titleText;
    }
    if (prev.progressText !== progressText) {
      document.getElementById('mission-hud-progress').textContent = progressText;
    }
    if (prev.timeText !== timeText) {
      document.getElementById('mission-hud-time').textContent = timeText;
    }
    if (prev.goalText !== goalText) {
      document.getElementById('mission-goal').textContent = goalText;
    }
    if (prev.max !== goal || prev.value !== current) {
      const bar = document.getElementById('mission-progress');
      bar.max = goal;
      bar.value = current;
    }
    this.lastHudCache = { titleText, progressText, timeText, goalText, max: goal, value: current };
  }

  updateSettingsStatus() {
    const { isSaving, storage, blocked, hasSaved } = this.settingsStore.status;
    const element = document.getElementById('settings-save-status');
    const message = blocked ? '이전 설정을 읽지 못해 덮어쓰기를 중단했습니다. 이번 실행에만 적용됩니다.'
      : isSaving ? '설정 저장 중…' : !storage ? '설정을 저장하지 못했습니다. 이번 실행에만 적용됩니다.'
        : hasSaved ? '설정이 저장되었습니다.' : '';
    if (element.textContent !== message) element.textContent = message;
    element.hidden = !message;
    element.classList.toggle('info', !blocked && (isSaving || storage));
    const supported = this.hapticsSupported();
    document.getElementById('toggle-haptics').disabled = !supported;
    const hint = supported ? '지원 기기에서 명중 시 가볍게 진동합니다.' : '현재 환경에서는 햅틱을 지원하지 않습니다.';
    const description = document.getElementById('haptics-description');
    if (description.textContent !== hint) description.textContent = hint;
    const privacyBtn = document.getElementById('btn-privacy-options');
    if (privacyBtn) {
      privacyBtn.hidden = !this.isPrivacyOptionsRequired();
      privacyBtn.disabled = this.isMonetizationBusy();
    }
  }

  showSettings() {
    if (this.isMonetizationBusy()) return;
    const settings = this.settingsStore.settings;
    document.getElementById('toggle-sound').checked = settings.soundEnabled;
    document.getElementById('toggle-haptics').checked = settings.hapticsEnabled;
    document.getElementById('range-volume').value = Math.round(settings.volume * 100);
    document.getElementById('volume-value').textContent = Math.round(settings.volume * 100) + '%';
    this.updateSettingsStatus();
    this.settingsDialog.showModal();
    this.onModalChange();
  }

  closeSettings() {
    if (this.isMonetizationBusy()) return;
    this.settingsDialog.close();
    document.getElementById('btn-open-settings').focus();
    this.onModalChange();
  }

  showTutorial(fromSettings = false) {
    if (this.isMonetizationBusy()) return;
    this.tutorialFromSettings = fromSettings;
    if (fromSettings) this.settingsDialog.close();
    this.tutorialDialog.showModal();
    this.onModalChange();
  }

  closeTutorial() {
    if (this.isMonetizationBusy()) return;
    this.tutorialDialog.close();
    this.onTutorialDismiss();
    if (this.tutorialFromSettings) this.showSettings();
    else this.onModalChange();
  }

  showMissionList(state) {
    this.closeDialogs();
    const list = document.getElementById('mission-list');
    list.replaceChildren();
    const records = state.progression.missionRecords || {};
    for (const mission of MISSIONS) {
      const completed = state.progression.completedMissions.includes(mission.id);
      const bestActiveMs = isValidActiveMs(records[mission.id]?.bestActiveMs) ? records[mission.id].bestActiveMs : null;
      const bestStars = bestActiveMs !== null ? evaluateMissionStars(mission, bestActiveMs) : 0;

      const item = document.createElement('li');
      item.className = 'mission-item' + (completed ? ' completed' : '');
      const info = document.createElement('div');
      info.className = 'mission-info';
      const title = document.createElement('h3');
      title.textContent = mission.title + (completed ? ' · 완료' : '');
      const description = document.createElement('p');
      description.textContent = mission.desc;

      const recordLine = document.createElement('p');
      recordLine.className = 'mission-record-line';
      if (bestActiveMs !== null) {
        recordLine.textContent = '최고 ' + formatStarGlyphs(bestStars) + ' (별 ' + bestStars + '개) · ' + formatDurationMs(bestActiveMs);
        recordLine.setAttribute('aria-label', '최고 기록 별 3개 중 ' + bestStars + '개, 시간 ' + formatDurationMs(bestActiveMs));
      } else if (completed) {
        recordLine.textContent = '완료 · 기록 없음';
      } else {
        recordLine.textContent = '별 기준 3★ ' + formatDurationMs(mission.stars.threeStarMaxMs)
          + ' · 2★ ' + formatDurationMs(mission.stars.twoStarMaxMs);
      }

      const reward = document.createElement('span');
      reward.className = 'reward';
      reward.textContent = completed ? '첫 완료 보상 수령 완료' : '첫 완료 +' + mission.reward + ' 코인';
      info.append(title, description, recordLine, reward);
      const button = document.createElement('button');
      button.textContent = completed ? '재도전' : '시작';
      button.setAttribute('aria-label', mission.title + (completed ? ' 재도전' : ' 시작'));
      button.dataset.missionId = mission.id;
      button.addEventListener('click', () => this.onMissionStart(mission.id));
      item.append(info, button);
      list.append(item);
    }
    this.listDialog.showModal();
    this.onModalChange();
  }

  showMissionResult(result, rewardOfferSnapshot = null) {
    this.closeDialogs();
    const {
      mission,
      reward,
      isFirst,
      activeMs = null,
      stars = 0,
      previousBestMs = null,
      bestActiveMs = null,
      bestStars = 0,
      isFirstRecord = false,
      isNewRecord = false
    } = result;

    this.resultMissionId = mission.id;
    document.getElementById('mission-result-title').textContent = mission.title + ' 완료!';
    document.getElementById('mission-result-reward').textContent = isFirst
      ? '첫 완료 보상 +' + reward + ' 코인' : '재도전 완료! 첫 완료 보상은 이미 받았습니다.';

    const recordBox = document.getElementById('mission-result-record');
    recordBox.replaceChildren();
    if (isValidActiveMs(activeMs)) {
      recordBox.hidden = false;

      const starRow = document.createElement('div');
      starRow.className = 'result-star-row';
      const starBadge = document.createElement('span');
      starBadge.className = 'star-rating';
      starBadge.textContent = formatStarGlyphs(stars) + ' (별 ' + stars + '개)';
      starBadge.setAttribute('aria-label', '별 3개 중 ' + stars + '개 획득');
      starRow.append(starBadge);

      if (isFirstRecord) {
        const badge = document.createElement('span');
        badge.className = 'record-badge';
        badge.textContent = '첫 기록';
        starRow.append(badge);
      } else if (isNewRecord) {
        const badge = document.createElement('span');
        badge.className = 'record-badge';
        badge.textContent = '최고기록 갱신';
        starRow.append(badge);
      }

      const currentLine = document.createElement('p');
      currentLine.className = 'result-record-line';
      currentLine.textContent = '이번 기록 ' + formatDurationMs(activeMs);

      const bestLine = document.createElement('p');
      bestLine.className = 'result-record-line';
      if (bestActiveMs !== null) {
        const prevSuffix = !isFirstRecord && isNewRecord && previousBestMs !== null
          ? ' (이전 ' + formatDurationMs(previousBestMs) + ')'
          : '';
        bestLine.textContent = '최고기록 ' + formatDurationMs(bestActiveMs) + ' · ' + formatStarGlyphs(bestStars) + prevSuffix;
      }

      const goalLine = document.createElement('p');
      goalLine.className = 'result-goal-line';
      const nextGoal = getNextStarGoal(mission, activeMs);
      if (nextGoal?.targetStars) {
        goalLine.textContent = '다음 별 기준: 별 ' + nextGoal.targetStars + '개 ('
          + formatDurationMs(nextGoal.targetMaxMs) + ' 이하 · ' + formatDurationMs(nextGoal.remainingToSaveMs) + ' 단축 필요)';
      } else {
        goalLine.textContent = '3성 달성! 최고기록 ' + formatDurationMs(bestActiveMs ?? activeMs) + ' 단축에 도전해보세요.';
      }

      recordBox.append(starRow, currentLine, bestLine, goalLine);
    } else {
      recordBox.hidden = true;
    }

    this.updateMissionResultMonetization(rewardOfferSnapshot);
    this.renderCollectionGoal('mission-result-collection', this.currentState);
    this.updateSaveNotices(this.currentState);
    const next = document.getElementById('btn-mission-next');
    next.hidden = MISSIONS.findIndex((entry) => entry.id === mission.id) === MISSIONS.length - 1;
    this.resultDialog.showModal();
    this.onModalChange();
  }

  updateMissionResultMonetization(snapshot) {
    const adButton = document.getElementById('btn-mission-rewarded-ad');
    const bonusNotice = document.getElementById('mission-bonus-status');
    const busy = Boolean(snapshot?.busy || this.isMonetizationBusy());
    const offer = snapshot?.offer || null;

    if (offer) {
      adButton.hidden = false;
      adButton.disabled = busy;
      adButton.textContent = '광고를 보고 +' + offer.bonusCoins.toLocaleString() + ' 코인';
    } else {
      adButton.hidden = true;
      adButton.disabled = true;
    }

    const notice = snapshot?.notice || null;
    if (notice?.text) {
      bonusNotice.hidden = false;
      bonusNotice.textContent = notice.text;
      bonusNotice.classList.toggle('info', notice.tone === 'info');
    } else {
      bonusNotice.hidden = true;
      bonusNotice.textContent = '';
    }

    for (const id of ['btn-mission-next', 'btn-mission-retry', 'btn-mission-result-close']) {
      document.getElementById(id).disabled = busy;
    }
  }

  showShop(items, state, shopMonetizationSnapshot = null) {
    this.closeDialogs();
    this.renderShop(items, state, null, null, shopMonetizationSnapshot);
    this.shopDialog.showModal();
    this.onModalChange();
  }

  renderShop(items, state, result, action, shopMonetizationSnapshot = null) {
    this.renderCollectionGoal('shop-collection-goal', state);
    const focusId = this.shopDialog.contains(document.activeElement)
      ? document.activeElement.dataset.skinId : null;
    document.getElementById('shop-balance').textContent = state.progression.coins.toLocaleString() + ' 코인';
    if (shopMonetizationSnapshot) {
      this.renderShopIAP(shopMonetizationSnapshot);
    }
    this.updateSaveNotices(state);
    const list = document.getElementById('shop-list');
    list.replaceChildren();
    for (const item of items) {
      const card = document.createElement('li');
      card.className = 'shop-item' + (item.isEquipped ? ' equipped' : '');
      const preview = document.createElement('div');
      preview.className = 'skin-preview';
      preview.setAttribute('aria-hidden', 'true');
      item.swatches.forEach((color, index) => preview.style.setProperty('--skin-' + index, color));
      const info = document.createElement('div');
      info.className = 'skin-info';
      const title = document.createElement('h3');
      title.textContent = item.name;
      const description = document.createElement('p');
      description.textContent = item.description;
      const price = document.createElement('span');
      price.className = 'reward';
      price.textContent = item.isOwned ? '보유 중' : item.price.toLocaleString() + ' 코인';
      info.append(title, description, price);
      const button = document.createElement('button');
      button.dataset.skinId = item.id;
      button.dataset.shopAction = item.isOwned ? 'equip' : 'buy';
      button.disabled = item.isEquipped || (!item.isOwned && !item.canAfford);
      button.dataset.coinDisabled = String(button.disabled);
      button.disabled ||= this.isMonetizationBusy();
      button.textContent = item.isEquipped ? '장착 중' : item.isOwned ? '장착' : item.canAfford ? '구매' : '코인 부족';
      button.setAttribute('aria-label', item.name + ' ' + button.textContent);
      button.addEventListener('click', () => item.isOwned ? this.onShopEquip(item.id) : this.onShopBuy(item.id));
      card.append(preview, info, button);
      list.append(card);
    }
    const status = document.getElementById('shop-status');
    const messages = {
      'invalid-item': '상품을 찾을 수 없습니다.',
      'already-owned': '이미 보유한 외형입니다.',
      'insufficient-coins': '코인이 부족합니다. 미션 첫 완료 보상을 모아보세요.',
      'not-owned': '먼저 외형을 구매해주세요.'
    };
    status.textContent = !result ? '' : result.ok
      ? result.item.name + (action === 'buy' ? ' 구매 완료! 장착 버튼으로 적용하세요.' : ' 장착 완료! 상점을 닫으면 확인할 수 있습니다.')
      : messages[result.reason] || '다시 시도해주세요.';
    if (focusId) {
      const button = [...list.querySelectorAll('[data-skin-id]')].find((entry) => entry.dataset.skinId === focusId);
      (button && !button.disabled ? button : document.getElementById('btn-shop-close')).focus({ preventScroll: true });
    }
  }

  renderShopIAP(snapshot) {
    const container = document.getElementById('iap-content');
    const focusId = container?.contains(document.activeElement) ? document.activeElement.id : this.pendingIAPFocus;
    if (focusId && snapshot.busy) this.pendingIAPFocus = focusId;
    const statusEl = document.getElementById('iap-status');
    const closeBtn = document.getElementById('btn-shop-close');
    if (!container || !statusEl) return;
    closeBtn.disabled = Boolean(snapshot.busy);
    for (const button of document.querySelectorAll('[data-coin-disabled]')) {
      button.disabled = snapshot.busy || button.dataset.coinDisabled === 'true';
    }
    container.replaceChildren();

    if (snapshot.owned) {
      const badge = document.createElement('p');
      badge.className = 'iap-unavailable';
      badge.textContent = '보유 중 · 전면 광고 제거가 적용되어 있습니다.';
      container.append(badge);
    } else if (snapshot.sellable && snapshot.product) {
      const row = document.createElement('div');
      row.className = 'iap-card';
      const info = document.createElement('div');
      info.className = 'skin-info';
      const title = document.createElement('h4');
      title.textContent = snapshot.product.title;
      const desc = document.createElement('p');
      desc.textContent = snapshot.product.description;
      info.append(title, desc);

      const actions = document.createElement('div');
      actions.className = 'iap-actions';
      const buyBtn = document.createElement('button');
      buyBtn.id = 'btn-buy-remove-ads';
      buyBtn.className = 'primary';
      buyBtn.disabled = Boolean(snapshot.busy);
      buyBtn.textContent = snapshot.product.displayPrice;
      buyBtn.setAttribute('aria-label', snapshot.product.title + ' 구매 ' + snapshot.product.displayPrice);
      buyBtn.addEventListener('click', () => {
        if (!this.isMonetizationBusy()) this.onPurchaseRemoveAds?.();
      });
      actions.append(buyBtn);
      row.append(info, actions);
      container.append(row);
    } else {
      const note = document.createElement('p');
      note.className = 'iap-unavailable';
      note.textContent = snapshot.loading
        ? '상품 정보를 확인하고 있습니다…'
        : '현재 유료 상품을 이용할 수 없습니다.';
      container.append(note);
    }

    if (snapshot.paymentsSupported) {
      const restoreBtn = document.createElement('button');
      restoreBtn.id = 'btn-restore-purchases';
      restoreBtn.className = 'quiet iap-restore';
      restoreBtn.disabled = Boolean(snapshot.busy);
      restoreBtn.textContent = '구매 복원';
      restoreBtn.addEventListener('click', () => {
        if (!this.isMonetizationBusy()) this.onRestorePurchases?.();
      });
      container.append(restoreBtn);
    }

    if (snapshot.notice?.text) {
      statusEl.hidden = false;
      statusEl.textContent = snapshot.notice.text;
      statusEl.classList.toggle('info', snapshot.notice.tone === 'info');
    } else {
      statusEl.hidden = true;
      statusEl.textContent = '';
    }
    if (focusId && !snapshot.busy) {
      const target = document.getElementById(focusId);
      (target && !target.disabled ? target : closeBtn).focus({ preventScroll: true });
      this.pendingIAPFocus = null;
    }
  }

  closeDialogs() {
    if (this.listDialog.open) this.listDialog.close();
    if (this.resultDialog.open) this.resultDialog.close();
    if (this.shopDialog.open) this.shopDialog.close();
    if (this.settingsDialog.open) this.settingsDialog.close();
    if (this.tutorialDialog.open) this.tutorialDialog.close();
    this.onModalChange();
  }

  isDialogOpen() {
    return this.listDialog.open || this.resultDialog.open || this.shopDialog.open
      || this.settingsDialog.open || this.tutorialDialog.open;
  }

  isBlockingInput() {
    return this.isMonetizationBusy() || this.isDialogOpen();
  }
}
