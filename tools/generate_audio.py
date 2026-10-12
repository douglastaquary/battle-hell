"""Original procedural sound design for Battle Hell (Python 3 stdlib only, fixed seeds).

Physically inspired synthesis, calibrated against the reference gameplay captures supplied by the
owner (measured: shotgun energy concentrated at 30-300 Hz with ~300 ms body and ~1 s outdoor tail,
mechanical action ~0.4 s after the shot, rain bed dominated by low rumble plus high hiss, near-silent
gaps between waves). These are synthesized, not field recordings; replace with licensed recordings
when available and register them in docs/AUDIO_ASSETS.csv.

Run from the project root: python3 tools/generate_audio.py [name-filter]
"""
import math
import random
import struct
import sys
import wave
from pathlib import Path

SR = 44100
ROOT = Path(__file__).resolve().parents[1] / "assets" / "audio"
ROOT.mkdir(parents=True, exist_ok=True)
TAU = 2 * math.pi


# ------------------------------------------------------------------ primitives
def zeros(seconds, sr=SR):
    return [0.0] * int(seconds * sr)


def noise(n, rng):
    return [rng.uniform(-1.0, 1.0) for _ in range(n)]


def brown(n, rng, leak=0.995):
    out, y = [0.0] * n, 0.0
    for i in range(n):
        y = y * leak + rng.uniform(-1, 1) * 0.06
        out[i] = y
    return out


def lowpass(x, fc, sr=SR):
    a = math.exp(-TAU * fc / sr)
    b = 1.0 - a
    y, out = 0.0, [0.0] * len(x)
    for i, v in enumerate(x):
        y = b * v + a * y
        out[i] = y
    return out


def highpass(x, fc, sr=SR):
    lp = lowpass(x, fc, sr)
    return [a - b for a, b in zip(x, lp)]


def biquad_coeffs(kind, f0, q, sr):
    f0 = max(10.0, min(f0, sr * 0.45))
    w = TAU * f0 / sr
    cw, alpha = math.cos(w), math.sin(w) / (2 * q)
    if kind == "lp":
        b0, b1, b2 = (1 - cw) / 2, 1 - cw, (1 - cw) / 2
    elif kind == "hp":
        b0, b1, b2 = (1 + cw) / 2, -(1 + cw), (1 + cw) / 2
    else:  # constant 0 dB peak band-pass
        b0, b1, b2 = alpha, 0.0, -alpha
    a0, a1, a2 = 1 + alpha, -2 * cw, 1 - alpha
    return b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0


def biquad(x, kind, f0, q=0.707, sr=SR):
    """f0 may be a number or a function of time in seconds (coefficients updated every 32 samples)."""
    sweep = callable(f0)
    b0, b1, b2, a1, a2 = biquad_coeffs(kind, f0(0.0) if sweep else f0, q, sr)
    x1 = x2 = y1 = y2 = 0.0
    out = [0.0] * len(x)
    for i, v in enumerate(x):
        if sweep and i % 32 == 0:
            b0, b1, b2, a1, a2 = biquad_coeffs(kind, f0(i / sr), q, sr)
        y = b0 * v + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2
        x2, x1, y2, y1 = x1, v, y1, y
        out[i] = y
    return out


def reverb(x, room=0.82, damp=0.35, wet=0.3, tail=1.5, sr=SR, seed=0):
    """Freeverb-style network (8 combs + 4 all-passes): diffuse outdoor/forest reflections."""
    x = x + [0.0] * int(tail * sr)
    scale = sr / 44100.0
    spread = random.Random(seed).randint(0, 23)
    combs = [int((n + spread) * scale) for n in (1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617)]
    alls = [int(n * scale) for n in (556, 441, 341, 225)]
    acc = [0.0] * len(x)
    for length in combs:
        buf, idx, store = [0.0] * length, 0, 0.0
        for i, v in enumerate(x):
            out = buf[idx]
            store = out * (1 - damp) + store * damp
            buf[idx] = v * 0.015 + store * room
            idx = idx + 1 if idx + 1 < length else 0
            acc[i] += out
    for length in alls:
        buf, idx = [0.0] * length, 0
        for i, v in enumerate(acc):
            b = buf[idx]
            buf[idx] = v + b * 0.5
            acc[i] = b - v
            idx = idx + 1 if idx + 1 < length else 0
    return [d * (1 - wet) + w * wet * 3.0 for d, w in zip(x, acc)]


def echoes(x, taps, sr=SR):
    """Discrete reflections: (delay seconds, gain, low-pass Hz)."""
    longest = max(t[0] for t in taps)
    out = x + [0.0] * int(longest * sr + 1)
    for delay, gain, fc in taps:
        filtered = lowpass(lowpass(x, fc, sr), fc, sr)
        d = int(delay * sr)
        for i, v in enumerate(filtered):
            out[i + d] += v * gain
    return out


def add(dst, src, at=0.0, gain=1.0, sr=SR):
    o = int(at * sr)
    if o + len(src) > len(dst):
        dst.extend([0.0] * (o + len(src) - len(dst)))
    for i, v in enumerate(src):
        dst[o + i] += v * gain
    return dst


def env_exp(n, tau, attack=0.0, sr=SR):
    a = max(1, int(attack * sr))
    return [min(1.0, i / a) * math.exp(-(i / sr) / tau) for i in range(n)]


def mul(x, e):
    return [a * b for a, b in zip(x, e)]


def softclip(x, drive=1.0):
    k = math.tanh(drive)
    return [math.tanh(v * drive) / k for v in x]


def normalize(x, peak=0.89):
    m = max(1e-9, max(abs(v) for v in x))
    return [v * peak / m for v in x]


def fade(x, fin=0.002, fout=0.02, sr=SR):
    n, a, b = len(x), int(fin * sr), int(fout * sr)
    for i in range(min(a, n)):
        x[i] *= i / a
    for i in range(min(b, n)):
        x[n - 1 - i] *= i / b
    return x


def loop(x, seconds, xfade, sr=SR):
    """x must hold seconds + xfade; the tail is cross-faded into the head for a seamless loop."""
    n, f = int(seconds * sr), int(xfade * sr)
    y = x[:n]
    for i in range(f):
        t = i / f
        y[i] = x[i] * math.sin(t * math.pi / 2) + x[n + i] * math.cos(t * math.pi / 2)
    return y


def write(name, data, sr=SR):
    stereo = isinstance(data, tuple)
    with wave.open(str(ROOT / name), "wb") as f:
        f.setparams((2 if stereo else 1, 2, sr, 0, "NONE", "not compressed"))
        frames = bytearray()
        if stereo:
            for l, r in zip(*data):
                frames += struct.pack("<hh", int(max(-1, min(1, l)) * 32767), int(max(-1, min(1, r)) * 32767))
        else:
            for v in data:
                frames += struct.pack("<h", int(max(-1, min(1, v)) * 32767))
        f.writeframes(bytes(frames))
    print("  wrote", name)


# ------------------------------------------------------------------ voice (formant synthesis)
VOWELS = {
    "a": (730, 1090, 2440), "o": (570, 840, 2410), "u": (300, 870, 2240),
    "uh": (640, 1190, 2390), "e": (530, 1840, 2480), "aw": (600, 950, 2500),
}


def glottal(n, f0_fn, rng, jitter, shimmer, rough, sr=SR):
    """Differentiated Rosenberg pulse train with per-cycle jitter/shimmer and subharmonic roughness."""
    out, phase, f, amp, cycle = [0.0] * n, 0.0, f0_fn(0), 1.0, 0
    prev = 0.0
    for i in range(n):
        phase += f / sr
        if phase >= 1.0:
            phase -= 1.0
            cycle += 1
            f = f0_fn(i / sr) * (1 + rng.gauss(0, jitter))
            amp = (1 + rng.gauss(0, shimmer)) * (1 - rough * 0.6 * (cycle % 2))
        p = phase
        if p < 0.4:
            g = 0.5 * (1 - math.cos(math.pi * p / 0.4))
        elif p < 0.6:
            g = math.cos(math.pi * (p - 0.4) / 0.4)
        else:
            g = 0.0
        out[i] = (g - prev) * amp * 8
        prev = g
    return out


def voice(seconds, f0_fn, vowel_fn, seed, breath=0.3, rough=0.3, jitter=0.03, shimmer=0.1, tract=1.0,
          drive=1.5, am=0.0, attack=0.12, release=0.35):
    rng = random.Random(seed)
    n = int(seconds * SR)
    src = glottal(n, f0_fn, rng, jitter, shimmer, rough)
    air = highpass(noise(n, rng), 400)
    src = [s + a * breath for s, a in zip(src, air)]
    out = [0.0] * n
    for k, gain, q in ((0, 1.0, 6.0), (1, 0.7, 8.0), (2, 0.35, 10.0)):
        band = biquad(src, "bp", lambda t, k=k: vowel_fn(t)[k] * tract, q)
        out = [o + b * gain for o, b in zip(out, band)]
    low = lowpass(src, 250)
    out = [o + l * 0.25 for o, l in zip(out, low)]
    if am:
        out = [v * (0.65 + 0.35 * math.sin(TAU * am * i / SR)) for i, v in enumerate(out)]
    a, r = int(attack * SR), int(release * SR)
    for i in range(n):
        e = min(1.0, i / max(1, a)) * min(1.0, (n - i) / max(1, r))
        out[i] *= e
    return softclip(normalize(out, 0.9), drive)


def vowel_path(*steps):
    """Piecewise-linear vowel morph: steps = (time, vowel)."""
    def fn(t):
        for (t0, v0), (t1, v1) in zip(steps, steps[1:]):
            if t <= t1:
                k = (t - t0) / max(1e-6, t1 - t0)
                return tuple(a + (b - a) * max(0, min(1, k)) for a, b in zip(VOWELS[v0], VOWELS[v1]))
        return VOWELS[steps[-1][1]]
    return fn


def glide(*points):
    def fn(t):
        for (t0, f0), (t1, f1) in zip(points, points[1:]):
            if t <= t1:
                k = max(0.0, min(1.0, (t - t0) / max(1e-6, t1 - t0)))
                return f0 + (f1 - f0) * k
        return points[-1][1]
    return fn


def distant(x, seed):
    """Prefiltered far variant: air absorption and stronger diffuse field."""
    return normalize(reverb(lowpass(lowpass(x, 900), 1400), 0.88, 0.5, 0.55, 1.2, seed=seed), 0.8)


# ------------------------------------------------------------------ effects
def thud(seconds, f_start, f_end, tau, rng, noise_mix=0.5, noise_fc=500):
    n = int(seconds * SR)
    out, ph = [0.0] * n, 0.0
    for i in range(n):
        t = i / SR
        f = f_end + (f_start - f_end) * math.exp(-t / (tau * 0.5))
        ph += TAU * f / SR
        out[i] = math.sin(ph)
    body = mul(out, env_exp(n, tau, 0.001))
    grit = mul(lowpass(noise(n, rng), noise_fc), env_exp(n, tau * 0.6, 0.0005))
    return [b + g * noise_mix * 3 for b, g in zip(body, grit)]


def ping(seconds, partials, tau, rng, sr=SR):
    """Struck metal: inharmonic partials (freq, gain, decay multiplier)."""
    n = int(seconds * sr)
    out = [0.0] * n
    for f, g, d in partials:
        f *= 1 + rng.uniform(-0.02, 0.02)
        ph = rng.uniform(0, TAU)
        for i in range(n):
            out[i] += math.sin(ph + TAU * f * i / sr) * g * math.exp(-(i / sr) / (tau * d))
    return out


def click(rng, fc=3500, tau=0.004, seconds=0.05):
    n = int(seconds * SR)
    return mul(biquad(noise(n, rng), "bp", fc, 2.0), env_exp(n, tau))


def shotgun(seed):
    rng = random.Random(seed)
    pitch = 1 + rng.uniform(-0.04, 0.04)
    n = int(0.6 * SR)
    crack = mul(highpass(noise(n, rng), 1200), env_exp(n, 0.0035))
    blast = mul(lowpass(noise(n, rng), 2200), env_exp(n, 0.045, 0.0004))
    sub = thud(0.6, 140 * pitch, 42 * pitch, 0.16, rng, 0.0)
    body = [c * 1.3 + b * 1.6 + s * 1.1 for c, b, s in zip(crack, blast, sub)]
    body = softclip(normalize(body, 1.0), 2.4)
    tail = mul(lowpass(brown(int(1.6 * SR), rng), 260), env_exp(int(1.6 * SR), 0.42, 0.02))
    out = echoes(body, [(0.085 + rng.uniform(0, 0.02), 0.35, 1800), (0.21 + rng.uniform(0, 0.04), 0.22, 1100),
                        (0.42 + rng.uniform(0, 0.06), 0.12, 700)])
    out = reverb(out, 0.86, 0.45, 0.22, 1.0, seed=seed)
    add(out, normalize(tail, 0.35), 0.01)
    return fade(normalize(out[: int(1.9 * SR)], 0.95), 0.0005, 0.3)


def reload_sound():
    rng = random.Random("reload")
    out = zeros(1.7)
    # Break open: lever click + hinge clack.
    add(out, click(rng, 4200, 0.003), 0.02, 0.6)
    add(out, ping(0.25, [(1850, 1.0, 1), (3120, 0.5, 0.6), (4700, 0.3, 0.4)], 0.05, rng), 0.08, 0.5)
    add(out, mul(biquad(noise(int(0.08 * SR), rng), "bp", 900, 1.2), env_exp(int(0.08 * SR), 0.02)), 0.08, 0.5)
    # Spent shells pulled and dropped on wet ground.
    for t in (0.32, 0.38):
        add(out, ping(0.15, [(3400, 1.0, 1), (5200, 0.6, 0.6)], 0.03, rng), t, 0.25)
    for t in (0.62, 0.71, 0.76):
        add(out, mul(lowpass(noise(int(0.06 * SR), rng), 700), env_exp(int(0.06 * SR), 0.015)), t, 0.35)
    # Two fresh shells slide in: friction then seat.
    for t in (0.86, 1.06):
        n = int(0.07 * SR)
        add(out, mul(biquad(noise(n, rng), "bp", 2200, 1.5), [min(1, i / n * 3) * (1 - i / n) for i in range(n)]),
            t, 0.35)
        add(out, click(rng, 1600, 0.006, 0.06), t + 0.07, 0.8)
    # Snap closed: heavy clack with low thump.
    add(out, ping(0.3, [(1450, 1.0, 1), (2650, 0.6, 0.7), (3900, 0.3, 0.5)], 0.06, rng), 1.36, 0.6)
    add(out, thud(0.2, 220, 90, 0.04, rng, 0.6, 900), 1.36, 0.6)
    add(out, click(rng, 5000, 0.002), 1.36, 0.8)
    return fade(normalize(reverb(out, 0.6, 0.6, 0.12, 0.3), 0.85))


def footstep(seed, heavy=False):
    rng = random.Random(seed)
    n = int(0.45 * SR)
    out = thud(0.45, 160 if heavy else 120, 55, 0.05 if heavy else 0.03, rng, 0.8, 600)
    # Mud squelch: band-pass noise sweeping upward with bubbly modulation.
    sq = biquad(noise(n, rng), "bp", lambda t: 350 + t * 2600, 3.0)
    bub = [0.6 + 0.4 * math.sin(TAU * (28 + 10 * rng.random()) * i / SR) for i in range(n)]
    sq = mul(mul(sq, bub), [math.exp(-max(0, i / SR - 0.03) / 0.07) * min(1, i / (0.02 * SR)) for i in range(n)])
    add(out, sq, 0.02, 1.4 if heavy else 1.0)
    for _ in range(rng.randint(3, 6)):  # splash droplets
        add(out, click(rng, rng.uniform(2500, 6000), 0.004, 0.03), rng.uniform(0.02, 0.15), 0.25)
    if heavy:  # dragging foot scrape
        m = int(0.25 * SR)
        scrape = mul(biquad(noise(m, rng), "bp", 1300, 1.0), [math.sin(math.pi * i / m) for i in range(m)])
        add(out, scrape, 0.12, 0.6)
    return fade(normalize(out, 0.8))


def flesh_hit(seed):
    rng = random.Random(seed)
    out = thud(0.35, 180, 70, 0.04, rng, 1.2, 900)
    n = int(0.12 * SR)
    add(out, mul(biquad(noise(n, rng), "bp", 1100, 1.0), env_exp(n, 0.03)), 0.0, 1.5)
    for _ in range(14):  # splatter grains
        add(out, mul(highpass(noise(int(0.012 * SR), rng), 1500), env_exp(int(0.012 * SR), 0.003)),
            rng.uniform(0.02, 0.2), rng.uniform(0.2, 0.5))
    return fade(normalize(out, 0.85))


def body_fall(rng):
    out = thud(0.6, 110, 45, 0.09, rng, 1.0, 400)
    add(out, mul(highpass(noise(int(0.2 * SR), rng), 900), env_exp(int(0.2 * SR), 0.05)), 0.01, 0.4)
    return out


def rain_loop():
    rng = random.Random("rain")
    secs, xf = 12.0, 1.0
    n = int((secs + xf) * SR)
    chans = []
    for ch in range(2):
        hiss = biquad(highpass(noise(n, rng), 1800), "lp", 9000)
        wash = lowpass(brown(n, rng, 0.998), 320)
        swell = [0.8 + 0.2 * math.sin(TAU * (0.07 + ch * 0.013) * i / SR + ch) for i in range(n)]
        x = [h * 0.22 * s + w * 1.1 for h, w, s in zip(hiss, wash, swell)]
        chans.append(x)
    # Individual drops: puddle plinks and hard-surface ticks, randomly panned.
    for _ in range(int(secs + xf) * 260):
        t = rng.uniform(0, secs + xf - 0.05)
        pan = rng.random()
        if rng.random() < 0.35:
            f = rng.uniform(1800, 4200)
            m = int(0.03 * SR)
            drop = [math.sin(TAU * f * (1 + 0.6 * i / m) * i / SR) * math.exp(-i / (0.006 * SR)) for i in range(m)]
            g = rng.uniform(0.02, 0.07)
        else:
            m = int(0.01 * SR)
            drop = mul(highpass(noise(m, rng), 3000), env_exp(m, 0.0015))
            g = rng.uniform(0.03, 0.12)
        o = int(t * SR)
        for i, v in enumerate(drop):
            chans[0][o + i] += v * g * (1 - pan)
            chans[1][o + i] += v * g * pan
    left, right = (loop(c, secs, xf) for c in chans)
    peak = max(max(abs(v) for v in left), max(abs(v) for v in right))
    return [v * 0.8 / peak for v in left], [v * 0.8 / peak for v in right]


def wind_loop():
    rng = random.Random("wind")
    sr, secs, xf = 22050, 16.0, 2.0
    n = int((secs + xf) * sr)
    chans = []
    for ch in range(2):
        base = noise(n, rng)
        gust = [0.45 + 0.55 * (0.5 + 0.5 * math.sin(TAU * 0.05 * i / sr + ch * 1.7)) *
                (0.6 + 0.4 * math.sin(TAU * 0.13 * i / sr + ch)) for i in range(n)]
        band = biquad(base, "bp", lambda t, ch=ch: 260 + 220 * math.sin(TAU * 0.04 * t + ch) + 90 * math.sin(TAU * 0.17 * t),
                      2.5, sr)
        howl = biquad(base, "bp", lambda t, ch=ch: 520 + 160 * math.sin(TAU * 0.06 * t + ch * 2), 18.0, sr)
        low = lowpass(brown(n, rng), 120, sr)
        chans.append([(b * 0.9 + h * 0.5) * g + l * 0.8 for b, h, g, l in zip(band, howl, gust, low)])
    left, right = (loop(c, secs, xf, sr) for c in chans)
    peak = max(max(abs(v) for v in left), max(abs(v) for v in right))
    return [v * 0.7 / peak for v in left], [v * 0.7 / peak for v in right]


def drone_loop():
    rng = random.Random("drone")
    sr, secs, xf = 22050, 16.0, 2.0
    n = int((secs + xf) * sr)
    chans = []
    for ch in range(2):
        x = [0.0] * n
        for f, g in ((36.7, 1.0), (36.7 * 1.006, 0.8), (55.0 * (1.003 if ch else 0.997), 0.5), (77.8, 0.18)):
            ph = rng.uniform(0, 1)
            for i in range(n):
                p = (ph + f * i / sr) % 1.0
                x[i] += (2 * p - 1) * g
        x = biquad(x, "lp", lambda t: 150 + 70 * math.sin(TAU * 0.05 * t + ch), 1.2, sr)
        air = biquad(noise(n, rng), "bp", lambda t: 420 + 120 * math.sin(TAU * 0.03 * t), 4.0, sr)
        chans.append([a * 0.4 + b * 0.25 * (0.5 + 0.5 * math.sin(TAU * 0.021 * i / sr + ch)) for i, (a, b) in
                      enumerate(zip(x, air))])
    left, right = (loop(c, secs, xf, sr) for c in chans)
    peak = max(max(abs(v) for v in left), max(abs(v) for v in right))
    return [v * 0.7 / peak for v in left], [v * 0.7 / peak for v in right]


def fire_loop():
    rng = random.Random("fire")
    secs, xf = 6.0, 0.5
    n = int((secs + xf) * SR)
    roar = mul(lowpass(brown(n, rng), 180), [0.7 + 0.3 * math.sin(TAU * 0.4 * i / SR) for i in range(n)])
    hiss = lowpass(highpass(noise(n, rng), 1500), 4500)
    x = [r * 1.5 + h * 0.05 for r, h in zip(roar, hiss)]
    for _ in range(int((secs + xf) * 38)):
        t = rng.uniform(0, secs + xf - 0.03)
        m = int(rng.uniform(0.002, 0.012) * SR)
        pop = mul(biquad(noise(m, rng), "bp", rng.uniform(1500, 6000), 1.5), env_exp(m, m / SR / 4))
        add(x, pop, t, rng.uniform(0.1, 0.9) ** 2)
    return normalize(loop(x, secs, xf), 0.8)


def thunder(seed):
    rng = random.Random(seed)
    secs = 7.0
    n = int(secs * SR)
    x = [0.0] * n
    for _ in range(rng.randint(5, 9)):  # rolling peaks from different path lengths
        t = rng.uniform(0.0, 3.0) ** 1.3
        dur = rng.uniform(0.8, 2.5)
        m = int(dur * SR)
        burst = mul(brown(m, rng), [math.sin(math.pi * i / m) ** 2 for i in range(m)])
        add(x, burst, t, rng.uniform(0.4, 1.0))
    x = biquad(x, "lp", lambda t: 450 * math.exp(-t / 2.5) + 90, 0.8)
    x = reverb(x, 0.9, 0.6, 0.35, 1.0, seed=seed)
    return fade(normalize(x[:n], 0.9), 0.05, 1.0)


def explosion():
    rng = random.Random("burst")
    n = int(3.0 * SR)
    boom = thud(3.0, 90, 28, 0.5, rng, 0.0)
    roar = mul(lowpass(brown(n, rng), 400), env_exp(n, 0.7, 0.01))
    x = [b * 0.8 + r * 2.0 for b, r in zip(boom, roar)]
    for _ in range(80):  # burning debris crackle
        t = rng.uniform(0.1, 2.5)
        m = int(0.006 * SR)
        add(x, mul(highpass(noise(m, rng), 2000), env_exp(m, 0.0015)), t, rng.uniform(0.05, 0.3) * math.exp(-t))
    x = softclip(normalize(x, 1.0), 1.8)
    return fade(normalize(reverb(x, 0.85, 0.5, 0.25, 0.8), 0.92), 0.001, 0.8)


def heartbeat():
    rng = random.Random("heart")
    x = zeros(0.85)
    add(x, thud(0.25, 75, 48, 0.05, rng, 0.2, 200), 0.0, 1.0)
    add(x, thud(0.25, 65, 42, 0.06, rng, 0.2, 200), 0.27, 0.7)
    return fade(normalize(lowpass(x, 300), 0.9))


def gong(seconds, base, seed):
    rng = random.Random(seed)
    parts = [(base, 1.0, 1.0), (base * 1.004, 0.7, 1.0), (base * 2.0, 0.5, 0.6), (base * 2.76, 0.45, 0.5),
             (base * 4.07, 0.25, 0.35), (base * 5.4, 0.15, 0.25)]
    return ping(seconds, parts, seconds / 3.5, rng)


def wave_start():
    rng = random.Random("wave_start")
    x = gong(5.0, 49.0, "w")
    n = int(1.2 * SR)
    swell = mul(biquad(noise(n, rng), "bp", lambda t: 200 + t * 900, 1.5), [(i / n) ** 3 for i in range(n)])
    out = zeros(1.2)
    add(out, swell, 0.0, 0.5)
    add(out, x, 1.15, 1.0)
    add(out, thud(1.5, 80, 30, 0.35, rng, 0.3, 200), 1.15, 0.8)
    return fade(normalize(reverb(out, 0.92, 0.4, 0.35, 2.0), 0.8), 0.01, 1.5)


def wave_clear():
    rng = random.Random("wave_clear")
    n = int(5.0 * SR)
    x = [0.0] * n
    for f in (110.0, 130.81, 164.81, 220.0, 329.63):
        for det in (0.997, 1.003):
            ph = rng.random()
            for i in range(n):
                x[i] += (2 * ((ph + f * det * i / SR) % 1.0) - 1) * 0.1
    choir = [0.0] * n
    for k, g in ((0, 1.0), (1, 0.6), (2, 0.3)):
        band = biquad(x, "bp", VOWELS["a"][k], 5.0)
        choir = [c + b * g for c, b in zip(choir, band)]
    e = [min(1, i / (1.6 * SR)) * min(1, (n - i) / (2.6 * SR)) for i in range(n)]
    return fade(normalize(reverb(mul(choir, e), 0.9, 0.3, 0.4, 2.0), 0.6))


def pickup():
    rng = random.Random("pickup")
    x = ping(1.2, [(880, 1.0, 1), (1318.5, 0.6, 0.8), (1760, 0.4, 0.6), (2637, 0.2, 0.4)], 0.35, rng)
    return fade(normalize(reverb(x, 0.8, 0.3, 0.3, 0.6), 0.6))


def dry_fire():
    rng = random.Random("dry")
    x = click(rng, 3000, 0.004, 0.12)
    add(x, ping(0.1, [(2300, 1.0, 1)], 0.02, rng), 0.0, 0.3)
    return fade(normalize(x, 0.6))


# ------------------------------------------------------------------ bones
def bone_clack(rng, gain=1.0):
    """Dry bone-on-bone knock: short noise transient plus a hollow, quickly damped resonance."""
    f = rng.uniform(700, 2100)
    x = mul(biquad(noise(int(0.05 * SR), rng), "bp", f * 1.8, 2.5), env_exp(int(0.05 * SR), 0.004))
    add(x, ping(0.08, [(f, 1.0, 1), (f * 2.3, 0.4, 0.5), (f * 3.9, 0.2, 0.3)], 0.012, rng), 0.0, 0.5)
    return [v * gain for v in x]


def bone_rattle(seed):
    rng = random.Random(seed)
    out = zeros(0.7)
    t = 0.0
    while t < 0.5:
        add(out, bone_clack(rng, rng.uniform(0.3, 1.0)), t)
        t += rng.uniform(0.008, 0.06) * (1 + t * 2)
    return fade(normalize(reverb(out, 0.55, 0.5, 0.12, 0.3, seed=1), 0.8))


def bone_step(seed):
    rng = random.Random(seed)
    out = footstep(seed + "mud")
    out = [v * 0.5 for v in out]
    add(out, bone_clack(rng, 1.0), 0.0)
    add(out, bone_clack(rng, 0.5), rng.uniform(0.03, 0.07))
    for _ in range(3):
        add(out, bone_clack(rng, 0.25), rng.uniform(0.05, 0.2))
    return fade(normalize(out, 0.8))


def bone_hit(seed):
    rng = random.Random(seed)
    out = zeros(0.6)
    n = int(0.03 * SR)
    add(out, mul(highpass(noise(n, rng), 1500), env_exp(n, 0.004)), 0.0, 1.4)  # crack
    add(out, bone_clack(rng, 1.0), 0.0)
    for _ in range(10):  # splinters
        add(out, bone_clack(rng, rng.uniform(0.1, 0.4)), rng.uniform(0.01, 0.25))
    add(out, thud(0.3, 160, 70, 0.03, rng, 0.6, 700), 0.0, 0.5)
    return fade(normalize(out, 0.85))


def bone_collapse(seed):
    rng = random.Random(seed)
    out = zeros(1.8)
    t = 0.0
    while t < 1.1:  # cascade accelerating as the frame gives way
        add(out, bone_clack(rng, rng.uniform(0.3, 1.0) * (1.2 - t * 0.5)), t)
        t += rng.uniform(0.005, 0.05)
    for tt in (0.35, 0.6, 0.85):
        add(out, thud(0.3, 120, 50, 0.05, rng, 1.0, 500), tt + rng.uniform(-0.04, 0.04), 0.5)
    for k, tt in enumerate((1.0, 1.22, 1.36, 1.44)):  # skull bounces
        add(out, bone_clack(rng, 0.9 / (k + 1)), tt)
    return fade(normalize(reverb(out, 0.7, 0.5, 0.15, 0.5, seed=2), 0.9))


def skull_wail():
    snd = voice(2.6, glide((0, 62), (1.2, 74), (2.6, 55)), vowel_path((0, "u"), (1.2, "o"), (2.6, "u")), "wail",
                breath=1.6, rough=0.3, jitter=0.03, tract=0.8, drive=1.6, am=5.5, attack=0.6, release=0.9)
    return fade(normalize(reverb(snd, 0.9, 0.4, 0.4, 1.2), 0.8))


def bone_sounds():
    items = []
    for i in range(3):
        items.append(("bone_rattle_%d.wav" % (i + 1), bone_rattle("rattle%d" % i)))
        items.append(("bone_step_%d.wav" % (i + 1), bone_step("bstep%d" % i)))
        items.append(("bone_hit_%d.wav" % (i + 1), bone_hit("bhit%d" % i)))
    for i in range(2):
        items.append(("bone_collapse_%d.wav" % (i + 1), bone_collapse("collapse%d" % i)))
    items.append(("skull_wail.wav", skull_wail()))
    return items


# ------------------------------------------------------------------ catalogue
def undead_sounds():
    items = []
    for i, (f0, vow, dur, tract) in enumerate([
        (glide((0, 92), (1.0, 84), (2.2, 70)), vowel_path((0, "uh"), (1.0, "o"), (2.2, "u")), 2.3, 0.9),
        (glide((0, 80), (0.7, 96), (1.9, 66)), vowel_path((0, "aw"), (0.8, "a"), (1.9, "o")), 2.0, 0.88),
        (glide((0, 105), (0.5, 88), (1.6, 72)), vowel_path((0, "o"), (0.6, "uh"), (1.6, "u")), 1.7, 0.92),
        (glide((0, 70), (1.2, 78), (2.6, 58)), vowel_path((0, "u"), (1.0, "aw"), (2.6, "u")), 2.7, 0.85),
    ]):
        snd = voice(dur, f0, vow, "groan%d" % i, breath=0.35, rough=0.45, jitter=0.045, tract=tract, drive=2.0,
                    am=0.0, attack=0.3, release=0.7)
        snd = fade(normalize(reverb(snd, 0.6, 0.5, 0.1, 0.4), 0.85))
        items.append(("undead_groan_%d.wav" % (i + 1), snd))
        items.append(("undead_groan_far_%d.wav" % (i + 1), distant(snd, i)))
    for i in range(2):
        snd = voice(0.9, glide((0, 120 + i * 15), (0.3, 165), (0.9, 105)), vowel_path((0, "a"), (0.9, "e")),
                    "snarl%d" % i, breath=0.6, rough=0.7, jitter=0.06, tract=0.88, drive=2.8, am=31 + i * 6,
                    attack=0.04, release=0.25)
        items.append(("undead_snarl_%d.wav" % (i + 1), fade(normalize(snd, 0.85))))
    for i in range(2):
        snd = voice(0.85, glide((0, 170), (0.25, 310 + i * 30), (0.85, 190)), vowel_path((0, "a"), (0.85, "aw")),
                    "attack%d" % i, breath=0.55, rough=0.6, jitter=0.07, tract=0.9, drive=3.2, am=38,
                    attack=0.03, release=0.3)
        items.append(("undead_attack_%d.wav" % (i + 1), fade(normalize(snd, 0.9))))
    for i in range(3):
        snd = voice(0.45, glide((0, 160 - i * 12), (0.45, 95)), vowel_path((0, "uh"), (0.45, "u")), "hurt%d" % i,
                    breath=0.45, rough=0.5, jitter=0.05, tract=0.9, drive=2.4, attack=0.01, release=0.2)
        items.append(("undead_hurt_%d.wav" % (i + 1), fade(normalize(snd, 0.85))))
    for i in range(2):
        rng = random.Random("death%d" % i)
        snd = voice(1.9, glide((0, 115), (0.6, 90), (1.9, 48)), vowel_path((0, "o"), (1.0, "uh"), (1.9, "u")),
                    "death%d" % i, breath=0.5, rough=0.65, jitter=0.08, tract=0.88, drive=2.2, attack=0.02,
                    release=0.6)
        gurgle = [0.55 + 0.45 * math.sin(TAU * (9 + 4 * math.sin(TAU * 0.7 * k / SR)) * k / SR) for k in
                  range(len(snd))]
        snd = mul(snd, gurgle)
        add(snd, body_fall(rng), 1.55 + i * 0.1, 1.4)
        items.append(("undead_death_%d.wav" % (i + 1), fade(normalize(reverb(snd, 0.7, 0.5, 0.15, 0.6), 0.9))))
    for i in range(3):
        items.append(("ghoul_step_%d.wav" % (i + 1), footstep("zstep%d" % i, heavy=True)))
    return items


def player_sounds():
    items = []
    for i in range(4):
        items.append(("shotgun_%d.wav" % (i + 1), shotgun("shot%d" % i)))
    items.append(("shotgun_reload.wav", reload_sound()))
    items.append(("dry_fire.wav", dry_fire()))
    for i in range(4):
        items.append(("step_mud_%d.wav" % (i + 1), footstep("pstep%d" % i)))
    for i in range(2):
        snd = voice(0.38, glide((0, 135 - i * 10), (0.38, 98)), vowel_path((0, "uh"), (0.38, "u")), "phurt%d" % i,
                    breath=0.5, rough=0.12, jitter=0.02, tract=1.0, drive=1.4, attack=0.01, release=0.18)
        items.append(("player_hurt_%d.wav" % (i + 1), fade(normalize(snd, 0.8))))
    items.append(("heartbeat.wav", heartbeat()))
    for i in range(3):
        items.append(("flesh_hit_%d.wav" % (i + 1), flesh_hit("hit%d" % i)))
    return items


def world_sounds():
    items = [("rain_loop.wav", rain_loop()), ("wind_loop.wav", (wind_loop(), 22050)),
             ("drone_loop.wav", (drone_loop(), 22050)), ("fire_loop.wav", fire_loop())]
    for i in range(3):
        items.append(("thunder_%d.wav" % (i + 1), thunder("thunder%d" % i)))
    items += [("burst.wav", explosion()), ("wave_start.wav", wave_start()), ("wave_clear.wav", wave_clear()),
              ("pickup.wav", pickup())]
    return items


def main():
    flt = sys.argv[1] if len(sys.argv) > 1 else ""
    groups = [player_sounds, undead_sounds, bone_sounds, world_sounds]
    count = 0
    for group in groups:
        print(group.__name__)
        for name, data in group():
            if flt and flt not in name:
                continue
            if isinstance(data, tuple) and len(data) == 2 and isinstance(data[1], int):
                write(name, data[0], data[1])
            else:
                write(name, data)
            count += 1
    print("Generated %d original procedural WAV files in %s" % (count, ROOT))


if __name__ == "__main__":
    main()
