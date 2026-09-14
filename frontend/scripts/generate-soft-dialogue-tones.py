"""Deterministic soft dialogue feedback: sine only, smooth attack/release, no hard transients."""
from pathlib import Path
import math
import struct
import wave

OUTPUT = Path(__file__).resolve().parents[1] / 'assets' / 'audio'
RATE = 44100
DURATION = 0.072
ATTACK = 0.012
AMPLITUDE = 0.32
FREQUENCIES = (293.66, 329.63, 369.99)

for index, frequency in enumerate(FREQUENCIES, 1):
    count = round(RATE * DURATION)
    values = []
    for sample in range(count):
        time = sample / RATE
        if time < ATTACK:
            envelope = math.sin(math.pi * time / (2 * ATTACK)) ** 2
        else:
            decay = (time - ATTACK) / ((count - 1) / RATE - ATTACK)
            envelope = math.cos(math.pi * decay / 2) ** 2
        values.append(round(32767 * AMPLITUDE * envelope * math.sin(2 * math.pi * frequency * time)))
    values[0] = values[-1] = 0
    path = OUTPUT / f'dialogue-soft-{index}.wav'
    with wave.open(str(path), 'wb') as clip:
        clip.setnchannels(1)
        clip.setsampwidth(2)
        clip.setframerate(RATE)
        clip.writeframes(struct.pack('<' + 'h' * len(values), *values))
    print(f'{path.name}: {path.stat().st_size} bytes, {len(values) / RATE * 1000:.3f}ms, peak={max(map(abs, values)) / 32768:.4f}, first/last={values[0]}/{values[-1]}')