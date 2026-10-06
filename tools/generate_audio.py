"""Original synthetic placeholder effects, not recorded realistic final audio."""
import math, random, struct, wave
from pathlib import Path
RATE = 22050
ROOT = Path(__file__).resolve().parents[1] / 'assets' / 'audio'
ROOT.mkdir(parents=True, exist_ok=True)
def create(name, seconds, effect):
    rng = random.Random(name)
    pcm = bytearray()
    last = 0.0
    for i in range(int(seconds * RATE)):
        t = i / RATE
        n = rng.uniform(-1, 1)
        last = 0.93 * last + 0.07 * n
        if effect == 'rain':
            # periodic envelope makes loop boundary continuous.
            fade = min(1, t / .08, (seconds - t) / .08)
            v = (n * .22 + last * .65) * fade
        elif effect == 'shot':
            v = n * .70 * math.exp(-t * 28) + math.sin(t * 2 * math.pi * 85) * .25 * math.exp(-t * 13)
        elif effect == 'explosion':
            v = last * 2.1 * math.exp(-t * 2.5) + math.sin(t * 2 * math.pi * 48) * .3 * math.exp(-t * 3)
        elif effect == 'step':
            v = last * 1.8 * math.exp(-t * 22) + n * .15 * math.exp(-t * 40)
        elif effect == 'cue':
            envelope = math.sin(math.pi * t / seconds) ** 2
            v = (last * .8 + math.sin(2 * math.pi * (110*t + 12*t*t)) * .10) * envelope
        else:
            v = math.sin(2 * math.pi * 58*t) * (math.exp(-t*18) + .55*math.exp(-abs(t-.24)*28)) * .3
        pcm.extend(struct.pack('<h', round(max(-.9, min(.9, v)) * 32767)))
    with wave.open(str(ROOT / name), 'wb') as f:
        f.setparams((1, 2, RATE, 0, 'NONE', 'not compressed'))
        f.writeframes(pcm)
for name, seconds, kind in [('rain.wav',12,'rain'),('shot.wav',.8,'shot'),('step.wav',.3,'step'),('cue.wav',1.8,'cue'),('explosion.wav',2.5,'explosion'),('pulse.wav',.7,'pulse')]:
    create(name, seconds, kind)
print('Generated six original prototype WAV files.')
