import { DEFAULT_SKIN, SHOP_ITEMS, getSkin } from './definitions.js';

export class ShopSystem {
  constructor({ state, persist }) {
    this.state = state;
    this.persist = persist;
  }

  getShopData() {
    const { coins, ownedSkins, equippedSkin } = this.state.progression;
    return SHOP_ITEMS.map((item) => ({
      ...item,
      isOwned: ownedSkins.includes(item.id),
      isEquipped: equippedSkin === item.id,
      canAfford: coins >= item.price
    }));
  }

  buyItem(id) {
    const item = getSkin(id);
    if (!item) return { ok: false, reason: 'invalid-item' };
    const progress = this.state.progression;
    if (progress.ownedSkins.includes(id)) return { ok: false, reason: 'already-owned' };
    if (!Number.isSafeInteger(progress.coins) || progress.coins < item.price) {
      return { ok: false, reason: 'insufficient-coins' };
    }
    progress.coins -= item.price;
    progress.ownedSkins.push(id);
    return { ok: true, item, whenSaved: this.persist(this.state) };
  }

  equipItem(id) {
    const item = getSkin(id);
    if (!item) return { ok: false, reason: 'invalid-item' };
    if (!this.state.progression.ownedSkins.includes(id)) return { ok: false, reason: 'not-owned' };
    if (this.state.progression.equippedSkin === id) {
      return { ok: true, item, changed: false };
    }
    this.state.progression.equippedSkin = id;
    return { ok: true, item, changed: true, whenSaved: this.persist(this.state) };
  }

  getEquippedSkin() {
    const progress = this.state.progression;
    return getSkin(progress.ownedSkins.includes(progress.equippedSkin) ? progress.equippedSkin : DEFAULT_SKIN)
      || getSkin(DEFAULT_SKIN);
  }
}
