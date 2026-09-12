#!/usr/bin/env python3
from pathlib import Path
import struct
import zlib


def png(width: int, height: int, rgba_rows: list[bytes]) -> bytes:
    def chunk(tag: bytes, data: bytes) -> bytes:
        return (
            struct.pack(">I", len(data))
            + tag
            + data
            + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    raw = b"".join(b"\x00" + row for row in rgba_rows)
    return b"".join(
        [
            b"\x89PNG\r\n\x1a\n",
            chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)),
            chunk(b"IDAT", zlib.compress(raw, 9)),
            chunk(b"IEND", b""),
        ]
    )


def clamp(value: int) -> int:
    return max(0, min(255, value))


def draw_icon(size: int) -> bytes:
    rows = []
    for y in range(size):
        row = bytearray()
        for x in range(size):
            nx = x / (size - 1)
            ny = y / (size - 1)
            margin = 0.08
            inside = margin <= nx <= 1 - margin and margin <= ny <= 1 - margin
            if not inside:
                row.extend((0, 0, 0, 0))
                continue
            r = clamp(int(15 + 20 * nx))
            g = clamp(int(23 + 18 * ny))
            b = clamp(int(42 + 16 * nx))
            # document body
            doc_l, doc_r = 0.22, 0.78
            doc_t, doc_b = 0.18, 0.82
            if doc_l <= nx <= doc_r and doc_t <= ny <= doc_b:
                r, g, b = 248, 250, 252
            # folded corner
            if nx > 0.62 and ny < 0.32 and (nx + ny) > 1.02:
                r, g, b = 226, 232, 240
            # Hebrew-ish text lines
            for top, bottom in ((0.38, 0.44), (0.50, 0.56), (0.62, 0.68)):
                if 0.30 <= nx <= 0.70 and top <= ny <= bottom:
                    r, g, b = 15, 23, 42
            row.extend((r, g, b, 255))
        rows.append(bytes(row))
    return png(size, size, rows)


def main() -> None:
    out = Path(__file__).resolve().parents[1] / "icons"
    out.mkdir(parents=True, exist_ok=True)
    for size in (16, 32, 48, 128):
        (out / f"icon{size}.png").write_bytes(draw_icon(size))


if __name__ == "__main__":
    main()
