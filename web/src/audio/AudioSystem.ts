const BASE = import.meta.env.BASE_URL || '/';

type LoopId = 'rain' | 'wind' | 'fire' | 'drone';

const ONE_SHOTS = {
  shotgun: ['shotgun_1.wav', 'shotgun_2.wav', 'shotgun_3.wav', 'shotgun_4.wav'],
  reload: ['shotgun_reload.wav'],
  dryFire: ['dry_fire.wav'],
  boneHit: ['bone_hit_1.wav', 'bone_hit_2.wav', 'bone_hit_3.wav'],
  boneCollapse: ['bone_collapse_1.wav', 'bone_collapse_2.wav'],
  hurt: ['player_hurt_1.wav', 'player_hurt_2.wav'],
  undeadHurt: ['undead_hurt_1.wav', 'undead_hurt_2.wav', 'undead_hurt_3.wav'],
  undeadDeath: ['undead_death_1.wav', 'undead_death_2.wav'],
  undeadAttack: ['undead_attack_1.wav', 'undead_attack_2.wav'],
  thunder: ['thunder_1.wav', 'thunder_2.wav', 'thunder_3.wav'],
  waveStart: ['wave_start.wav'],
  waveClear: ['wave_clear.wav'],
  pickup: ['pickup.wav'],
  step: ['step_mud_1.wav', 'step_mud_2.wav', 'step_mud_3.wav', 'step_mud_4.wav'],
} as const;

type ShotKind = keyof typeof ONE_SHOTS;

const LOOPS: Record<LoopId, { file: string; volume: number }> = {
  rain: { file: 'rain_loop.wav', volume: 0.28 },
  wind: { file: 'wind_loop.wav', volume: 0.18 },
  fire: { file: 'fire_loop.wav', volume: 0.22 },
  drone: { file: 'drone_loop.wav', volume: 0.12 },
};

/**
 * Web Audio runtime — reutiliza os WAV do kit Battle Hell.
 * Unlock no primeiro gesto; falhas de decode não quebram o jogo.
 */
export class AudioSystem {
  private ctx: AudioContext | null = null;
  private readonly buffers = new Map<string, AudioBuffer>();
  private readonly loopNodes = new Map<LoopId, { source: AudioBufferSourceNode; gain: GainNode }>();
  private master: GainNode | null = null;
  private unlocked = false;
  private muted = false;
  private stepCd = 0;
  private loadPromise: Promise<void> | null = null;

  async ensureLoaded(): Promise<void> {
    if (!this.loadPromise) this.loadPromise = this.preload();
    await this.loadPromise;
  }

  unlock = async (): Promise<void> => {
    await this.ensureLoaded();
    const ctx = this.getCtx();
    if (ctx.state === 'suspended') await ctx.resume();
    this.unlocked = true;
    this.startAmbience();
  };

  dispose(): void {
    for (const id of [...this.loopNodes.keys()]) this.stopLoop(id);
    void this.ctx?.close();
    this.ctx = null;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.master) this.master.gain.value = muted ? 0 : 1;
  }

  toggleMute(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  play(kind: ShotKind, opts?: { volume?: number; playbackRate?: number }): void {
    if (!this.unlocked || this.muted) return;
    const files = ONE_SHOTS[kind];
    const file = files[Math.floor(Math.random() * files.length)];
    this.playBuffer(file, opts?.volume ?? 1, opts?.playbackRate ?? 1);
  }

  playAt(kind: ShotKind, distance: number, opts?: { volume?: number }): void {
    const atten = 1 / (1 + distance * distance * 0.035);
    this.play(kind, { volume: (opts?.volume ?? 1) * Math.min(1, atten) });
  }

  updateSteps(dt: number, moving: boolean, running: boolean): void {
    if (!moving) {
      this.stepCd = Math.min(this.stepCd, 0.05);
      return;
    }
    this.stepCd -= dt;
    if (this.stepCd > 0) return;
    this.stepCd = running ? 0.32 : 0.48;
    this.play('step', { volume: running ? 0.45 : 0.32 });
  }

  setDroneTension(amount01: number): void {
    const node = this.loopNodes.get('drone');
    if (!node) return;
    const t = this.getCtx().currentTime;
    node.gain.gain.cancelScheduledValues(t);
    node.gain.gain.linearRampToValueAtTime(0.05 + amount01 * 0.35, t + 0.25);
  }

  private getCtx(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
    }
    return this.ctx;
  }

  private async preload(): Promise<void> {
    const names = new Set<string>();
    for (const list of Object.values(ONE_SHOTS)) for (const f of list) names.add(f);
    for (const loop of Object.values(LOOPS)) names.add(loop.file);

    await Promise.all(
      [...names].map(async (file) => {
        try {
          const res = await fetch(`${BASE}audio/${file}`);
          if (!res.ok) return;
          const raw = await res.arrayBuffer();
          const ctx = this.getCtx();
          const buf = await ctx.decodeAudioData(raw.slice(0));
          this.buffers.set(file, buf);
        } catch {
          // asset optional in some environments
        }
      }),
    );
  }

  private playBuffer(file: string, volume: number, rate: number): void {
    const buf = this.buffers.get(file);
    if (!buf || !this.master) return;
    const ctx = this.getCtx();
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const gain = ctx.createGain();
    gain.gain.value = volume;
    src.connect(gain);
    gain.connect(this.master);
    src.start();
  }

  private startAmbience(): void {
    (['rain', 'wind', 'fire', 'drone'] as LoopId[]).forEach((id) => this.startLoop(id));
  }

  private startLoop(id: LoopId): void {
    if (this.loopNodes.has(id) || !this.master) return;
    const spec = LOOPS[id];
    const buf = this.buffers.get(spec.file);
    if (!buf) return;
    const ctx = this.getCtx();
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const gain = ctx.createGain();
    gain.gain.value = spec.volume;
    src.connect(gain);
    gain.connect(this.master);
    src.start();
    this.loopNodes.set(id, { source: src, gain });
  }

  private stopLoop(id: LoopId): void {
    const node = this.loopNodes.get(id);
    if (!node) return;
    try {
      node.source.stop();
    } catch {
      /* already stopped */
    }
    this.loopNodes.delete(id);
  }
}
