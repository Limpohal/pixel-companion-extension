#!/usr/bin/env python3
"""
gen_icons.py — generate Pixel Bot Companion icons (16/48/128) as PNGs
using only the standard library (pure-Python PNG writer, chunky pixel
art drawn on a 16x16 grid and scaled up with nearest-neighbour).

Usage:  python3 tools/gen_icons.py
Output: icons/icon16.png icon48.png icon128.png
"""
import os
import struct
import zlib

# ----------------------------------------------------------------------
# tiny pure-Python PNG writer (RGBA, 8-bit, non-interlaced)
# ----------------------------------------------------------------------
def png_chunk(tag: bytes, data: bytes) -> bytes:
    return (
        struct.pack(">I", len(data))
        + tag
        + data
        + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
    )


def write_png(path: str, w: int, h: int, rows) -> None:
    raw = bytearray()
    for row in rows:
        raw.append(0)  # filter: none
        for r, g, b, a in row:
            raw += bytes((r, g, b, a))
    ihdr = struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0)
    with open(path, "wb") as f:
        f.write(b"\x89PNG\r\n\x1a\n")
        f.write(png_chunk(b"IHDR", ihdr))
        f.write(png_chunk(b"IDAT", zlib.compress(bytes(raw), 9)))
        f.write(png_chunk(b"IEND", b""))


# ----------------------------------------------------------------------
# 16x16 pixel-bot design
# ----------------------------------------------------------------------
PALETTE = {
    ".": (0, 0, 0, 0),           # transparent
    "B": (62, 193, 211, 255),    # body aqua
    "D": (42, 157, 176, 255),    # body shade
    "P": (255, 253, 242, 255),   # face panel
    "E": (22, 33, 59, 255),      # eye / stem
    "S": (22, 33, 59, 255),      # stem
    "F": (255, 209, 102, 255),   # feet
    "K": (199, 143, 46, 255),    # feet sole
    "R": (255, 107, 107, 255),   # orb
    "H": (255, 179, 179, 255),   # orb highlight
}

GRID_W, GRID_H = 16, 16


def build_grid():
    grid = [["." for _ in range(GRID_W)] for _ in range(GRID_H)]

    def fill(x, y, w, h, c):
        for yy in range(y, y + h):
            for xx in range(x, x + w):
                if 0 <= yy < GRID_H and 0 <= xx < GRID_W:
                    grid[yy][xx] = c

    # antenna: glowing orb + stem
    fill(6, 0, 3, 2, "R")      # orb
    fill(7, 0, 1, 1, "H")      # highlight
    fill(7, 2, 2, 3, "S")      # stem

    # body capsule
    fill(2, 5, 12, 7, "B")     # x2..13, y5..11
    # rounded corners (2x2 cut at each corner)
    for cx, cy in [(2, 5), (3, 5), (12, 5), (13, 5),
                   (2, 11), (3, 11), (12, 11), (13, 11)]:
        grid[cy][cx] = "."
    # left shade strip
    fill(2, 6, 1, 5, "D")

    # face panel
    fill(4, 7, 8, 3, "P")
    # eyes (2x2)
    fill(5, 8, 2, 2, "E")
    fill(9, 8, 2, 2, "E")
    # smile (mouth line)
    fill(7, 9, 2, 1, "E")

    # feet
    fill(4, 12, 3, 2, "F")
    fill(9, 12, 3, 2, "F")
    fill(4, 13, 3, 1, "K")
    fill(9, 13, 3, 1, "K")

    return grid


def upscale(grid, factor):
    """Nearest-neighbour upscale of the char grid to RGBA rows."""
    h = GRID_H * factor
    w = GRID_W * factor
    rows = []
    for yy in range(h):
        row = []
        for xx in range(w):
            row.append(PALETTE[grid[yy // factor][xx // factor]])
        rows.append(row)
    return rows


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    out = os.path.join(here, "..", "icons")
    os.makedirs(out, exist_ok=True)
    grid = build_grid()

    for size in (16, 32, 48, 128):
        factor = size // GRID_W
        assert factor * GRID_W == size
        path = os.path.join(out, f"icon{size}.png")
        write_png(path, size, size, upscale(grid, factor))
        print(f"wrote {os.path.relpath(path, os.path.join(here, '..'))} "
              f"({size}x{size})")

    # quick sanity: print a small ASCII rendition of the grid
    print("\n16x16 design:")
    for row in grid:
        print("".join(row))


if __name__ == "__main__":
    main()