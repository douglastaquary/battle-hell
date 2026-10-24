import { WEAPON_ORDER, WEAPONS, type WeaponId } from '../game/Weapons';

/**
 * Tela inicial estilo mesa de cartas (template do anexo):
 * título + fan de 3 cartas + confirmar para entrar na arena.
 */
export class WeaponSelect {
  private readonly root: HTMLElement;
  private selected: WeaponId = 'double_barrel';
  private onPick: ((id: WeaponId) => void) | null = null;

  constructor() {
    const el = document.querySelector<HTMLElement>('#weapon-select');
    if (!el) throw new Error('Missing #weapon-select');
    this.root = el;
    this.renderCards();
    this.root.querySelector('#weapon-confirm')?.addEventListener('click', () => {
      this.onPick?.(this.selected);
    });
    window.addEventListener('keydown', this.onKey);
  }

  onConfirm(cb: (id: WeaponId) => void): void {
    this.onPick = cb;
  }

  show(): void {
    this.root.hidden = false;
    this.root.setAttribute('aria-hidden', 'false');
    document.body.classList.add('in-loadout');
  }

  hide(): void {
    this.root.hidden = true;
    this.root.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('in-loadout');
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKey);
  }

  private readonly onKey = (e: KeyboardEvent): void => {
    if (this.root.hidden) return;
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') this.nudge(-1);
    if (e.code === 'ArrowRight' || e.code === 'KeyD') this.nudge(1);
    if (e.code === 'Enter' || e.code === 'Space') this.onPick?.(this.selected);
  };

  private nudge(dir: number): void {
    const i = WEAPON_ORDER.indexOf(this.selected);
    const next = WEAPON_ORDER[(i + dir + WEAPON_ORDER.length) % WEAPON_ORDER.length];
    this.select(next);
  }

  private select(id: WeaponId): void {
    this.selected = id;
    this.root.querySelectorAll('.wcard').forEach((node) => {
      const card = node as HTMLElement;
      const active = card.dataset.weapon === id;
      card.classList.toggle('is-selected', active);
      card.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    const hint = this.root.querySelector('#weapon-hint');
    if (hint) hint.textContent = WEAPONS[id].damageLabel;
  }

  private renderCards(): void {
    const fan = this.root.querySelector('#weapon-fan');
    if (!fan) return;
    fan.innerHTML = '';
    for (const id of WEAPON_ORDER) {
      const w = WEAPONS[id];
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `wcard wcard--${w.foil} wcard--${id}`;
      btn.dataset.weapon = id;
      btn.setAttribute('role', 'option');
      btn.innerHTML = `
        <div class="wcard-count">0/1</div>
        <div class="wcard-art" aria-hidden="true"></div>
        <div class="wcard-name">${w.name}</div>
        <div class="wcard-tags">${w.tags.join(' · ')}</div>
        <div class="wcard-rarity">${w.blurb}</div>
        <div class="wcard-stats">${w.damageLabel}</div>
        <div class="wcard-stats wcard-stats--sub">${w.rateLabel}</div>
      `;
      btn.addEventListener('click', () => this.select(id));
      fan.appendChild(btn);
    }
    this.select(this.selected);
  }
}
