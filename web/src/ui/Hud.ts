export type HudSnapshot = {
  wave: number;
  maxWaves: number;
  soulsRemain: number;
  score: number;
  gold: number;
  hp: number;
  maxHp: number;
  armor: number;
  shells: number;
  maxShells: number;
  phase: string;
  multiplier: number;
  level: number;
  xp: number;
  xpMax: number;
  soulEnergy: number;
  banner: string;
};

export class Hud {
  constructor() {
    if (!document.querySelector('#bh-hud')) {
      throw new Error('Missing #bh-hud');
    }
  }

  set(s: HudSnapshot): void {
    this.setText('#hud-wave', `WAVE ${String(s.wave).padStart(2, '0')} / ${String(s.maxWaves).padStart(2, '0')}`);
    this.setText('#hud-souls', `${s.soulsRemain} SOULS REMAIN`);
    this.setText('#hud-score', `Score: ${s.score.toLocaleString('en-US')}`);
    this.setText('#hud-gold', `Gold: ${s.gold}`);
    this.setText('#hud-hp', `${Math.round(s.hp)} / ${s.maxHp} HP`);
    const hpFill = document.querySelector<HTMLElement>('#hud-hp-fill');
    if (hpFill) hpFill.style.height = `${Math.max(0, Math.min(100, (s.hp / s.maxHp) * 100))}%`;
    this.setText('#hud-shells', `${s.shells} / ${s.maxShells}`);
    this.setText('#hud-mult', `x${s.multiplier.toFixed(1)}`);
    this.setText('#hud-level', `Level ${s.level}`);
    this.setText('#hud-xp', `${s.xp} / ${s.xpMax} XP`);
    this.setText('#hud-soul-energy', `${Math.round(s.soulEnergy)}%`);
    const bar = document.querySelector<HTMLElement>('#hud-soul-bar');
    if (bar) bar.style.width = `${s.soulEnergy}%`;
    this.setText('#hud-banner', s.banner);
    this.setText('#hud-phase', s.phase);
    const armor = document.querySelector<HTMLElement>('#hud-armor');
    if (armor) armor.textContent = s.armor > 0 ? `Armor ${Math.round(s.armor)}` : '';
  }

  private setText(sel: string, value: string): void {
    const el = document.querySelector(sel);
    if (el) el.textContent = value;
  }
}
