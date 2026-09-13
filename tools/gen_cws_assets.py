#!/usr/bin/env python3
"""
gen_cws_assets.py — generate Chrome Web Store graphic assets from the
project's own sprite data (reuses tools/gen_icons.py style PNG writer).

Outputs (in assets/):
  store-icon-128.png   128x128  store icon (required)
  promo-tile-440.png   440x280  small promo tile (required for new items)
"""
import os
import struct
import zlib

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'assets')


# ----------------------------------------------------------------------
# tiny pure-Python PNG writer (RGB, 8-bit, non-interlaced)
# ----------------------------------------------------------------------
def png_chunk(tag: bytes, data: bytes) -> bytes:
    return (
        struct.pack(">I", len(data))
        + tag
        + data
        + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
    )


def write_png(path: str, w: int, h: int, pix) -> None:
    """pix(x, y) -> (r, g, b)"""
    rows = []
    for y in range(h):
        row = bytearray(b"\x00")
        for x in range(w):
            row += bytes(pix(x, y))
        rows.append(bytes(row))
    raw = b"".join(rows)
    hdr = struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)
    data = (
        b"\x89PNG\r\n\x1a\n"
        + png_chunk(b"IHDR", hdr)
        + png_chunk(b"IDAT", zlib.compress(raw, 9))
        + png_chunk(b"IEND", b"")
    )
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f:
        f.write(data)
    print(path, f"{w}x{h}", os.path.getsize(path), "bytes")


# ----------------------------------------------------------------------
# helpers
# ----------------------------------------------------------------------
def hx(s):
    return (int(s[1:3], 16), int(s[3:5], 16), int(s[5:7], 16))


def in_rounded(x, y, rx, ry, rw, rh, r):
    """True if (x,y) is inside a rounded rect."""
    if not (rx <= x < rx + rw and ry <= y < ry + rh):
        return False
    # corner circles
    for cx, cy in ((rx + r, ry + r), (rx + rw - r, ry + r),
                   (rx + r, ry + rh - r), (rx + rw - r, ry + rh - r)):
        dx, dy = x - cx, y - cy
        in_corner_zone = ((x < rx + r or x >= rx + rw - r) and
                          (y < ry + r or y >= ry + rh - r))
        if in_corner_zone and dx * dx + dy * dy > r * r:
            return False
    return True


# ----------------------------------------------------------------------
# A mini renderer for the Beep Bot sprite (mirrors content/art.js geometry)
# ----------------------------------------------------------------------
GRID = 64
G = dict(bodyX=8, bodyY=12, bodyW=48, bodyH=38, corner=6,
         feetY=50, feetH=6, footLX=16, footRX=42, footW=6,
         armY=24, panelX=20, panelY=20, panelW=24, panelH=19,
         eyeY=24, eye1X=24, eye2X=38, mouthX=29, mouthY=35,
         antX=30, antTop=3, antStemH=9, orbX=27, orbY=0, orbW=9, orbH=6)

EYES = {
    "happy": [(2,0),(3,0),(1,1),(4,1),(0,2),(5,2),(0,3),(5,3)],
}
MOUTH_SMILE = [(0,0),(1,0),(4,0),(5,0),(1,1),(2,1),(3,1),(4,1)]

AQUA = hx("#3ec1d3"); AQUA_D = hx("#2a9db0"); PANEL = hx("#fffdf2")
EYEC = hx("#16213b"); FOOT = hx("#ffd166"); FOOT_D = hx("#c78f2e")
ORB = hx("#ff6b6b"); ORB_GLOW_ = hx("#ffb3b3"); CHEEK = hx("#ffb3a0")


def bot_pixel(x, y):
    """Return color of grid pixel (x, y) for the Beep Bot, or None."""
    g = G
    # antenna orb + stem
    if g["orbX"] - 1 <= x < g["orbX"] + g["orbW"] + 1 and g["orbY"] <= y < g["orbH"]:
        return ORB_GLOW_ if (x == g["orbX"] - 1 or x == g["orbX"] + g["orbW"] or
                            y == g["orbY"]) else ORB
    if g["antX"] <= x < g["antX"] + 3 and g["antTop"] + 2 <= y < g["antTop"] + 2 + g["antStemH"]:
        return AQUA if x == g["antX"] + 1 else AQUA_D
    # feet
    swing = 1
    if g["footLX"] <= x < g["footLX"] + g["footW"] or g["footRX"] <= x < g["footRX"] + g["footW"]:
        if g["feetY"] <= y < g["feetY"] + g["feetH"]:
            return FOOT_D if y >= g["feetY"] + g["feetH"] - 2 else FOOT
    # body capsule
    if in_rounded(x, y, g["bodyX"], g["bodyY"], g["bodyW"], g["bodyH"], g["corner"]):
        # side/bottom shading
        if (g["bodyX"] <= x < g["bodyX"] + 2 or
                x >= g["bodyX"] + g["bodyW"] - 2) and g["bodyY"] + 4 <= y < g["bodyY"] + g["bodyH"] - 6:
            return AQUA_D
        if y >= g["bodyY"] + g["bodyH"] - 3:
            return AQUA_D
        # face panel
        if (g["panelX"] <= x < g["panelX"] + g["panelW"] and
                g["panelY"] <= y < g["panelY"] + g["panelH"]):
            if y == g["panelY"]:
                return (255, 255, 255)
            ex, ey = x - g["eye1X"], y - g["eyeY"]
            ex2 = x - g["eye2X"]
            for dx, dy in EYES["happy"]:
                if (dx, dy) == (ex, ey) or (dx, dy) == (ex2, ey):
                    return EYE_C
            for dx, dy in MOUTH_SMILE:
                if (dx, dy) == (x - g["mouthX"], y - g["mouthY"]):
                    return EYE_C
            return PANEL
        return AQUA
    # arms (down)
    if (g["bodyX"] - 2 <= x < g["bodyX"] + 2 or
            g["bodyX"] + g["bodyW"] - 2 <= x < g["bodyX"] + g["bodyW"] + 2) and \
            g["armY"] <= y < g["armY"] + 10:
        return AQUA
    return None


EYE_C = hx("#16213b")


def render_scaled(pix, scale, ox, oy):
    """Wrap a grid-lookup into a scaled pixel lookup with offset."""
    def out(x, y):
        gx, gy = (x - ox) // scale, (y - oy) // scale
        if 0 <= gx < GRID and 0 <= gy < GRID:
            c = pix(gx, gy)
            if c:
                return c
        return None
    return out


# ----------------------------------------------------------------------
# asset 1: store icon 128x128 — bot face on rounded dark-blue tile
# ----------------------------------------------------------------------
def store_icon():
    W = H = 128
    R = 22
    tile_a, tile_b = hx("#1d2547"), hx("#141a36")

    def pix(x, y):
        if not in_rounded(x, y, 0, 0, W, H, R):
            return (255, 255, 255)  # will be cropped by CWS circle mask
        # subtle diagonal gradient
        t = (x + y) / (W + H)
        base = tuple(int(a + (b - a) * t) for a, b in zip(tile_a, tile_b))
        s = render_scaled(bot_pixel, 2, 0, 6)  # 64*2 = 128 fills the tile
        c = s(x, y)
        return c if c else base

    write_png(os.path.join(OUT, 'store-icon-128.png'), W, H, pix)


# ----------------------------------------------------------------------
# asset 2: small promo tile 440x280
# ----------------------------------------------------------------------
def promo_tile():
    W, H = 440, 280
    bg1, bg2 = hx("#1d2547"), hx("#2a3560")
    accent = hx("#3ec1d3")

    # character lineup: bot, snowman, shark, capy, panda, koala (simplified:
    # we render the bot; other pals are represented by colored tiles)
    colors = [hx("#3ec1d3"), hx("#fdfdf7"), hx("#a9dff2"), hx("#b5793c"),
              hx("#f5f7fa"), hx("#9fb0c0")]

    def pix(x, y):
        t = (x + y) / (W + H)
        base = tuple(int(a + (b - a) * t) for a, b in zip(bg1, bg2))
        # bot sprite on the left
        s = render_scaled(bot_pixel, 2, 20, 60)
        c = s(x, y)
        if c:
            return c
        # character swatch dots
        for i, col in enumerate(colors):
            cx = 40 + i * 24
            cy = 232
            if in_rounded(x, y, cx, cy, 18, 18, 6):
                return col
        return base

    write_png(os.path.join(OUT, 'promo-tile-440x280.png'), W, H, pix)


# ----------------------------------------------------------------------
# asset 3: marquee promo tile 1400x560
# ----------------------------------------------------------------------
def marquee_tile():
    W, H = 1400, 560
    bg1, bg2 = hx("#1d2547"), hx("#2a3560")
    colors = [hx("#3ec1d3"), hx("#fdfdf7"), hx("#a9dff2"), hx("#b5793c"),
              hx("#f5f7fa"), hx("#9fb0c0")]

    def pix(x, y):
        t = (x + y) / (W + H)
        base = tuple(int(a + (b - a) * t) for a, b in zip(bg1, bg2))
        # big bot on the left
        s = render_scaled(bot_pixel, 4, 90, 90)   # 64*4 = 256 tall
        c = s(x, y)
        if c:
            return c
        # swatch dots bottom-left under the bot
        for i, col in enumerate(colors):
            if in_rounded(x, y, 100 + i * 40, 420, 30, 30, 10):
                return col
        return base

    write_png(os.path.join(OUT, 'marquee-tile-1400x560.png'), W, H, pix)


if __name__ == '__main__':
    store_icon()
    promo_tile()
    marquee_tile()
