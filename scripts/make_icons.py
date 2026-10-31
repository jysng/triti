#!/usr/bin/env python3
"""Render Triti's PNG app icons using only the standard library.

Mirrors icons/icon.svg: a purple→coral gradient tile with a rising sun over a
horizon. Run after changing the design:  python3 scripts/make_icons.py
"""
from __future__ import annotations

import struct
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
A = (0x6D, 0x5E, 0xFC)
B = (0xE0, 0x7A, 0x5F)
SS = 3  # supersampling per axis


def rounded_rect(x: float, y: float, x0: float, y0: float, x1: float, y1: float, r: float) -> bool:
    if not (x0 <= x <= x1 and y0 <= y <= y1):
        return False
    cx = min(max(x, x0 + r), x1 - r)
    cy = min(max(y, y0 + r), y1 - r)
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r


def shade(x: float, y: float, maskable: bool) -> tuple[float, float, float, float]:
    """Colour at a point in 0..100 design space -> (r, g, b, alpha)."""
    if not maskable and not rounded_rect(x, y, 0, 0, 100, 100, 22):
        return (0, 0, 0, 0)
    t = min(max((x + y) / 200, 0), 1)
    bg = tuple(a + (b - a) * t for a, b in zip(A, B))
    # Maskable icons keep artwork inside the central 80% safe zone.
    if maskable:
        x = 50 + (x - 50) / 0.8
        y = 50 + (y - 50) / 0.8
    white = 0.0
    if y <= 58 and (x - 50) ** 2 + (y - 58) ** 2 <= 400:
        white = 1.0
    elif rounded_rect(x, y, 22, 62, 78, 66, 2):
        white = 1.0
    elif rounded_rect(x, y, 32, 71, 68, 74.5, 1.75):
        white = 0.7
    r, g, b = (c + (255 - c) * white for c in bg)
    return (r, g, b, 255)


def render(size: int, maskable: bool = False) -> bytes:
    rows = bytearray()
    n = SS * SS
    for py in range(size):
        rows.append(0)  # filter: none
        for px in range(size):
            acc = [0.0, 0.0, 0.0, 0.0]
            for sy in range(SS):
                for sx in range(SS):
                    x = (px + (sx + 0.5) / SS) * 100 / size
                    y = (py + (sy + 0.5) / SS) * 100 / size
                    r, g, b, a = shade(x, y, maskable)
                    acc[0] += r * a
                    acc[1] += g * a
                    acc[2] += b * a
                    acc[3] += a
            alpha = acc[3] / n
            if acc[3]:
                rows += bytes((round(acc[0] / acc[3]), round(acc[1] / acc[3]), round(acc[2] / acc[3]), round(alpha)))
            else:
                rows += b"\0\0\0\0"
    return png(size, size, bytes(rows))


def png(w: int, h: int, raw: bytes) -> bytes:
    def chunk(kind: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)

    header = struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0)  # 8-bit RGBA
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", header) + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")


def main() -> None:
    out = ROOT / "icons"
    out.mkdir(exist_ok=True)
    targets = {
        "icon-192.png": (192, False),
        "icon-512.png": (512, False),
        "icon-maskable-512.png": (512, True),
        "apple-touch-icon.png": (180, True),
    }
    for name, (size, maskable) in targets.items():
        (out / name).write_bytes(render(size, maskable))
        print(f"wrote icons/{name}")


if __name__ == "__main__":
    main()
