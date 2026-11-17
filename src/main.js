import { Loop } from './game/Loop.js';
import { GameStateStore } from './game/state.js';
import { MissionSystem } from './game/missions/MissionSystem.js';
import { ShopSystem } from './game/shop/ShopSystem.js';
import { DestructionEventBus } from './game/destruction/DestructionEventBus.js';
import { WeaponSystem } from './game/weapons/WeaponSystem.js';
import { AutoFireController } from './game/weapons/AutoFireController.js';
import { WEAPONS } from './game/weapons/definitions.js';
import { PlanetMode } from './game/modes/PlanetMode.js';
import { SolarMode } from './game/modes/SolarMode.js';
import { WebGLApp } from './render/WebGLApp.js';
import { UIManager } from './ui/UIManager.js';
import { createPlatform } from './platform/index.js';
import { GestureController } from './input/GestureController.js';
import { SettingsStore } from './settings/SettingsStore.js';
import { AudioManager } from './audio/AudioManager.js';
import { MonetizationController } from './game/monetization/MonetizationController.js';

async function startGame() {
  const canvas = document.getElementById('c');
  const app = new WebGLApp({ canvas });
  const eventBus = new DestructionEventBus();
  const platform = createPlatform();
  const stateStore = new GameStateStore({ storage: platform.storage });
  const state = await stateStore.loadGame();
  const settingsStore = new SettingsStore(platform.storage);
  await settingsStore.load();
  const audio = new AudioManager(settingsStore);
  const shop = new ShopSystem({ state, persist: (current) => stateStore.persist(current) });
  const missions = new MissionSystem();
  const ui = new UIManager({
    root: document.getElementById('ui'),
    stat: document.getElementById('stat'),
    modeButtons: [...document.querySelectorAll('[data-mode]')],
    weaponButtons: [...document.querySelectorAll('[data-w]')],
    resetButton: document.getElementById('resetBtn')
  });
  const weapons = new WeaponSystem({ scene: app.scene, eventBus });
  const options = {
    scene: app.scene, eventBus, getImpacts: () => state.session.recentImpacts,
    getSkin: () => shop.getEquippedSkin()
  };
  const modes = { planet: new PlanetMode(options), solar: new SolarMode(options) };
  let currentMode;
  let pendingCompletion = null;
  let gesture;
  let autoFire;

  const monetization = new MonetizationController({
    platform,
    state,
    stateStore,
    onStateChange() {
      if (!ui.isMonetizationBusy) return;
      onModalChange();
      if (ui.shopDialog.open) {
        ui.renderShopIAP(monetization.getShopSnapshot());
      }
      if (ui.resultDialog.open) {
        ui.updateMissionResultMonetization(monetization.getRewardOfferSnapshot());
      }
      if (ui.settingsDialog.open) {
        ui.updateSettingsStatus();
      }
    },
    onRewardClaimed() {
      syncUI();
    }
  });

  autoFire = new AutoFireController({ onChange(enabled) {
    ui.updateAutoFire(enabled);
    syncAimPoint();
  } });

  function getAimPoint() {
    const bounds = canvas.getBoundingClientRect();
    const x = bounds.left + bounds.width / 2;
    let top = bounds.top, bottom = bounds.bottom;
    for (const [selector, isTop] of [['.hud-panel', true], ['.weapon-panel', false]]) {
      const panel = document.querySelector(selector).getBoundingClientRect();
      if (x >= panel.left && x <= panel.right) {
        if (isTop) top = Math.max(top, panel.bottom + 16);
        else bottom = Math.min(bottom, panel.top - 16);
      }
    }
    return bottom - top >= 40 ? { clientX: x, clientY: (top + bottom) / 2 } : null;
  }

  function syncAimPoint() {
    ui.updateAimPoint(autoFire?.enabled ? getAimPoint() : null);
  }

  function syncMissionPause() {
    missions.setPaused('hidden', Boolean(document.hidden));
    missions.setPaused('modal', Boolean(ui.isDialogOpen()));
    missions.setPaused('monetization', Boolean(monetization.isBusy()));
  }

  function onModalChange() {
    gesture?.reset();
    if (document.hidden || ui.isDialogOpen() || monetization.isBusy()) autoFire?.stop();
    ui.root.inert = monetization.isBusy();
    syncMissionPause();
    audio.setPaused(document.hidden || ui.settingsDialog.open || ui.tutorialDialog.open || monetization.isBusy());
  }

  function hapticsEnabled() {
    return settingsStore.settings.hapticsEnabled && !document.hidden
      && !ui.settingsDialog.open && !ui.tutorialDialog.open && !monetization.isBusy();
  }

  function syncUI() {
    ui.syncSelection(state.mode, state.weapon);
    ui.updateStats(state, weapons.getProjectiles().length);
    ui.updateMissionHUD(missions.getSnapshot());
  }

  function activateMode(mode) {
    if (!modes[mode]) return;
    autoFire.stop();
    gesture?.reset();
    weapons.clear();
    currentMode?.cleanup();
    stateStore.setMode(state, mode);
    currentMode = modes[mode];
    currentMode.setup(state.session.recentImpacts);
    app.setMode(mode);
    syncUI();
  }

  function exitMission() {
    autoFire.stop();
    pendingCompletion = null;
    monetization.invalidateRewardOffer();
    monetization.closeShop();
    weapons.clear();
    missions.stopMission();
    ui.closeDialogs();
    syncUI();
  }

  function startMission(id) {
    exitMission();
    const mission = missions.startMission(id);
    if (!mission) return;
    syncMissionPause();
    stateStore.resetSession(state);
    if (mission.req.weapon) stateStore.setWeapon(state, mission.req.weapon);
    activateMode(mission.mode);
    syncUI();
  }

  function flushCompletion() {
    if (!pendingCompletion) return;
    autoFire.stop();
    const completion = pendingCompletion;
    pendingCompletion = null;
    const result = stateStore.claimMissionReward(state, completion);
    weapons.clear();
    missions.stopMission();
    syncUI();
    if (result) {
      monetization.recordMissionCompleted();
      audio.play('complete');
      platform.haptics.impact(hapticsEnabled);
      ui.showMissionResult(result, monetization.getRewardOfferSnapshot());
      monetization.prepareMissionResult(result);
    }
  }

  ui.init({
    hubGameActive: state.capabilities.hubGame,
    mode: state.mode,
    weapon: state.weapon,
    settingsStore,
    hapticsSupported: () => platform.haptics.supported,
    isMonetizationBusy: () => monetization.isBusy(),
    isPrivacyOptionsRequired: () => monetization.isPrivacyOptionsRequired(),
    onOpenPrivacyOptions() {
      monetization.openPrivacyOptions();
    },
    onModalChange,
    onAutoFireToggle() {
      if (!ui.isBlockingInput() && !document.hidden) autoFire.toggle();
    },
    onCameraReset() { gesture?.reset(); app.resetCamera(); },
    onSettingsChange(key, value) {
      settingsStore.set(key, value);
      audio.updateVolume();
    },
    onTutorialDismiss() {
      if (!settingsStore.settings.tutorialDismissed) settingsStore.set('tutorialDismissed', true);
    },
    onModeChange(mode) {
      exitMission();
      activateMode(mode);
    },
    onWeaponChange(weapon) {
      stateStore.setWeapon(state, weapon);
      syncUI();
    },
    onReset() {
      const id = missions.activeMission?.id;
      if (id) startMission(id);
      else {
        exitMission();
        stateStore.resetSession(state);
        currentMode.setup();
        gesture?.reset();
        app.resetCamera();
        syncUI();
      }
    },
    onMissionList() {
      exitMission();
      ui.showMissionList(state);
    },
    onMissionStart: startMission,
    onMissionExit: exitMission,
    onShopOpen() {
      exitMission();
      monetization.openShop();
      ui.showShop(shop.getShopData(), state, monetization.getShopSnapshot());
    },
    onShopClose() {
      monetization.closeShop();
    },
    onShopBuy(id) {
      const result = shop.buyItem(id);
      syncUI();
      ui.renderShop(shop.getShopData(), state, result, 'buy', monetization.getShopSnapshot());
    },
    onShopEquip(id) {
      const result = shop.equipItem(id);
      if (result.ok && result.changed) activateMode(state.mode);
      syncUI();
      ui.renderShop(shop.getShopData(), state, result, 'equip', monetization.getShopSnapshot());
    },
    onPurchaseRemoveAds() {
      monetization.purchaseRemoveAds();
    },
    onRestorePurchases() {
      monetization.restorePurchases();
    },
    onWatchRewardedAd() {
      monetization.watchRewardedBonus();
    },
    onResultNext(nextMissionId) {
      monetization.runResultExitTransition(() => startMission(nextMissionId));
    },
    onResultRetry(missionId) {
      monetization.runResultExitTransition(() => startMission(missionId), { allowInterstitial: false });
    },
    onResultSandbox() {
      monetization.runResultExitTransition(() => exitMission());
    }
  });

  monetization.refreshEntitlements();
  monetization.refreshAdConsent();

  const unsubscribe = eventBus.subscribe('impact', (impact) => {
    stateStore.recordImpact(state, impact);
    audio.play('impact');
    platform.haptics.impact(hapticsEnabled);
    const result = missions.recordImpact(impact);
    if (result?.status === 'completed') pendingCompletion = result;
    syncUI();
  });

  function fireAt(event) {
    if (!event || ui.isBlockingInput() || document.hidden) return false;
    const hit = app.pick(event, currentMode.getTargets());
    if (hit) {
      audio.play(state.weapon);
      weapons.fireWeapon({
        type: state.weapon, origin: app.camera.position, hit,
        runId: missions.status === 'active' ? missions.runId : null
      });
    }
    flushCompletion();
    syncUI();
    return Boolean(hit);
  }
  gesture = new GestureController(canvas, {
    isBlocked: () => document.hidden || ui.isBlockingInput(),
    onTap: fireAt,
    onRotate(dx, dy) {
      app.cameraController.rotate(dx, dy);
      app.cameraController.updateCamera(app.camera);
    },
    onZoom(factor) {
      app.cameraController.zoom(factor);
      app.cameraController.updateCamera(app.camera);
    }
  });
  function unlockAudio() { audio.unlock(); }
  document.addEventListener('pointerdown', unlockAudio, true);
  document.addEventListener('keydown', unlockAudio, true);

  const loop = new Loop({
    update(deltaSeconds) {
      if (!ui.isBlockingInput() && !document.hidden) {
        monetization.recordActiveTime(deltaSeconds);
        currentMode.update(deltaSeconds);
        app.scene.updateMatrixWorld(true);
        autoFire.update(WEAPONS[state.weapon].autoIntervalMs, () => {
          syncAimPoint();
          return fireAt(getAimPoint());
        });
        weapons.update(deltaSeconds);
        flushCompletion();
      }
      ui.updateStats(state, weapons.getProjectiles().length);
      ui.updateMissionHUD(missions.getSnapshot());
    },
    render() {
      app.render();
    }
  });
  function handleVisibility() {
    gesture.reset();
    onModalChange();
    if (document.hidden) {
      loop.stop();
    } else {
      monetization.refreshEntitlements();
      monetization.refreshAdConsent();
      loop.start();
    }
  }
  document.addEventListener('visibilitychange', handleVisibility);
  const stopAutoFire = () => autoFire.stop();
  window.addEventListener('blur', stopAutoFire);
  window.addEventListener('resize', syncAimPoint);
  const aimObserver = new ResizeObserver(syncAimPoint);
  aimObserver.observe(document.querySelector('.hud-panel'));
  aimObserver.observe(document.querySelector('.weapon-panel'));
  window.addEventListener('pagehide', (event) => {
    autoFire.stop();
    if (event.persisted) return;
    aimObserver.disconnect();
    window.removeEventListener('blur', stopAutoFire);
    window.removeEventListener('resize', syncAimPoint);
    loop.stop();
    document.removeEventListener('visibilitychange', handleVisibility);
    gesture.dispose();
    document.removeEventListener('pointerdown', unlockAudio, true);
    document.removeEventListener('keydown', unlockAudio, true);
    monetization.dispose();
    platform.payments.dispose?.();
    platform.ads.dispose?.();
    audio.dispose();
    platform.haptics.dispose();
    unsubscribe();
    weapons.dispose();
    Object.values(modes).forEach((mode) => mode.cleanup());
    app.dispose();
  });
  activateMode(state.mode);
  if (!settingsStore.settings.tutorialDismissed) ui.showTutorial();
  syncMissionPause();
  if (!document.hidden) loop.start();
}

startGame().catch((error) => {
  console.error(error);
  const notice = document.getElementById('error');
  notice.hidden = false;
  notice.textContent = '3D 화면을 시작하지 못했습니다. WebGL 지원과 개발 서버 실행 상태를 확인해주세요.';
});
