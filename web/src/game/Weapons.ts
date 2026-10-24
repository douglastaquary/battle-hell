/** Loadouts da tela inicial (template de cartas). */

export type WeaponId = 'longsword' | 'double_barrel' | 'relic_lantern';

export type WeaponDef = {
  id: WeaponId;
  name: string;
  rarity: 'COMMON' | 'RARE' | 'RELIC';
  foil: 'none' | 'foil' | 'holofoil';
  tags: string[];
  blurb: string;
  damageLabel: string;
  rateLabel: string;
  shells: number;
  /** Multiplicador de dano dos pellets / golpe */
  damageMul: number;
  /** Pellets por tiro (1 = melee/lantern pulse) */
  pellets: number;
  fireCooldown: number;
  reloadTime: number;
  spread: number;
  range: number;
  /** Viewmodel style key */
  view: 'blade' | 'shotgun' | 'lantern';
};

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  longsword: {
    id: 'longsword',
    name: 'LONGSWORD',
    rarity: 'COMMON',
    foil: 'none',
    tags: ['Weapon', 'Melee', 'Slash'],
    blurb: 'COMMON',
    damageLabel: '28–34 DAMAGE · REACH 2.4 m',
    rateLabel: '0.55 swings/s · no reload',
    shells: 0,
    damageMul: 1.35,
    pellets: 1,
    fireCooldown: 0.55,
    reloadTime: 0,
    spread: 0,
    range: 2.6,
    view: 'blade',
  },
  double_barrel: {
    id: 'double_barrel',
    name: 'ABYSS LONGWATCH',
    rarity: 'RARE',
    foil: 'holofoil',
    tags: ['Weapon', 'Gun', 'Ranged', 'Rifle', 'Projectile', 'Ammo', 'Reload'],
    blurb: 'RARE · HOLOFOIL',
    damageLabel: '12–15 × 9 DMG · 2 SHELLS',
    rateLabel: '1.4 shots/s · 1.55s reload',
    shells: 2,
    damageMul: 1,
    pellets: 9,
    fireCooldown: 0.35,
    reloadTime: 1.55,
    spread: 0.065,
    range: 28,
    view: 'shotgun',
  },
  relic_lantern: {
    id: 'relic_lantern',
    name: 'SOUL LANTERN',
    rarity: 'RELIC',
    foil: 'foil',
    tags: ['Weapon', 'Relic', 'Ranged', 'Burn', 'Soul'],
    blurb: 'RELIC · FOIL',
    damageLabel: '18–22 BURN · INFINITE',
    rateLabel: '0.85 pulses/s · no shells',
    shells: 0,
    damageMul: 1.15,
    pellets: 1,
    fireCooldown: 0.85,
    reloadTime: 0,
    spread: 0.02,
    range: 14,
    view: 'lantern',
  },
};

export const WEAPON_ORDER: WeaponId[] = ['longsword', 'double_barrel', 'relic_lantern'];
