#!/usr/bin/env python3
"""Gera ícones PNG mínimos para o bundle Tauri (sem dependências externas)."""

from __future__ import annotations

import struct
import zlib
from pathlib import Path


def png_rgba(size: int, rgba_fn) -> bytes:
    raw = bytearray()
    for y in range(size):
        raw.append(0)  # filter none
        for x in range(size):
            raw.extend(rgba_fn(x, y, size))
    compressed = zlib.compress(bytes(raw), 9)

    def chunk(tag: bytes, data: bytes) -> bytes:
        return struct.pack('>I', len(data)) + tag + data + struct.pack(
            '>I', zlib.crc32(tag + data) & 0xFFFFFFFF
        )

    ihdr = struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0)
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', ihdr) + chunk(b'IDAT', compressed) + chunk(b'IEND', b'')


def color(x: int, y: int, size: int) -> bytes:
    cx = cy = size / 2
    dx = x - cx
    dy = y - cy
    r = (dx * dx + dy * dy) ** 0.5 / (size * 0.48)
    # fundo quase preto
    if r > 1:
        return bytes((10, 12, 16, 0 if r > 1.05 else 255))
    # orbe de sangue + aro dourado
    t = max(0.0, 1.0 - r)
    if 0.82 < r < 0.95:
        return bytes((212, 181, 106, 255))
    cr = int(40 + 160 * t)
    cg = int(12 + 30 * t)
    cb = int(18 + 20 * t)
    return bytes((cr, cg, cb, 255))


def main() -> None:
    out = Path(__file__).resolve().parents[1] / 'src-tauri' / 'icons'
    out.mkdir(parents=True, exist_ok=True)
    for name, size in [('32x32.png', 32), ('128x128.png', 128), ('henry.icns-placeholder.png', 256)]:
        (out / name).write_bytes(png_rgba(size, color))
    # Tauri defaults
    (out / 'icon.png').write_bytes(png_rgba(512, color))
    (out / '128x128@2x.png').write_bytes(png_rgba(256, color))
    print(f'Wrote icons to {out}')


if __name__ == '__main__':
    main()
