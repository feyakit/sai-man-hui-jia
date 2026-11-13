"""Builds the poster home-screen art straight from the approved mockup.

Every piece is cut out of tools/home-poster-src/home-mockup.jpg (scaled to the 750x1334 design frame) so the
in-game home screen reproduces the mockup; text that must change at runtime (province seal, progress tag,
start button, coin labels) is painted out, and the couplets are re-lettered with the chosen lines.
The background is a clean copy of the mockup scene (tools/home-poster-src/bg-clean.jpg) with the UI removed.

Requires: python3, numpy, pillow, opencv-python-headless, rembg (isnet-general-use).
Font: Ma Shan Zheng (OFL) at $HOME_POSTER_FONT (default /workspace/fonts/MaShanZheng.ttf).
Run from the repo root: python3 tools/home-poster-art.py
"""
import os
import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont
from rembg import new_session, remove

SRC = 'tools/home-poster-src'
OUT = 'client/assets/resources/art/ui'
FONT = os.environ.get('HOME_POSTER_FONT', '/workspace/fonts/MaShanZheng.ttf')
W, H = 750, 1334

mock = Image.open(f'{SRC}/home-mockup.jpg').convert('RGB').resize((W, H), Image.LANCZOS)
M = np.array(mock)
session = new_session('isnet-general-use')


def matte(box, pad=20):
    """rembg alpha for a design-space box, returned as a full-frame uint8 mask."""
    x0, y0, x1, y1 = box
    cx0, cy0, cx1, cy1 = max(0, x0 - pad), max(0, y0 - pad), min(W, x1 + pad), min(H, y1 + pad)
    cut = np.array(remove(mock.crop((cx0, cy0, cx1, cy1)), session=session))[:, :, 3]
    full = np.zeros((H, W), np.uint8)
    full[cy0:cy1, cx0:cx1] = cut
    keep = np.zeros_like(full)
    keep[y0:y1, x0:x1] = 255
    return np.minimum(full, keep)


def grabcut(box):
    x0, y0, x1, y1 = box
    mask = np.zeros((H, W), np.uint8)
    bgd = np.zeros((1, 65)); fgd = np.zeros((1, 65))
    cv2.grabCut(cv2.cvtColor(M, cv2.COLOR_RGB2BGR), mask, (x0, y0, x1 - x0, y1 - y0), bgd, fgd, 6, cv2.GC_INIT_WITH_RECT)
    a = np.where((mask == 1) | (mask == 3), 255, 0).astype(np.uint8)
    return cv2.GaussianBlur(cv2.morphologyEx(a, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8)), (3, 3), 0)


def inpaint(rgb, box, select, radius=5, grow=2):
    """Paint out pixels inside box chosen by select(r,g,b) -> bool mask."""
    x0, y0, x1, y1 = box
    r, g, b = [rgb[y0:y1, x0:x1, i].astype(int) for i in range(3)]
    m = np.zeros(rgb.shape[:2], np.uint8)
    m[y0:y1, x0:x1] = select(r, g, b).astype(np.uint8) * 255
    m = cv2.dilate(m, np.ones((grow * 2 + 1, grow * 2 + 1), np.uint8))
    return cv2.inpaint(rgb, m, radius, cv2.INPAINT_TELEA)


def save(rgb, alpha, box, name):
    x0, y0, x1, y1 = box
    img = np.dstack([rgb[y0:y1, x0:x1], alpha[y0:y1, x0:x1]])
    Image.fromarray(img, 'RGBA').save(f'{OUT}/{name}.png', optimize=True)
    print(name, x1 - x0, y1 - y0, 'at', x0, y0)


cream = lambda r, g, b: (r > 170) & (g > 140) & (b > 100)

# Background: clean scene, extended downward with the dark street so tall phones never show an edge.
bg = np.array(Image.open(f'{SRC}/bg-clean.jpg').convert('RGB').resize((W, H), Image.LANCZOS))
tail = bg[H - 366:][::-1]
tail = cv2.GaussianBlur(tail, (0, 0), 6)
fade = np.linspace(1, .55, tail.shape[0])[:, None, None]
Image.fromarray(np.vstack([bg, (tail * fade).astype(np.uint8)])).save(f'{OUT}/bg_poster.png', optimize=True)

# Plaque with both lanterns and the blank province seal.
PLAQUE = (0, 40, 750, 345)
a = np.maximum(matte((14, 66, 740, 338)), grabcut((18, 70, 735, 335)))
r, g, b = [M[:, :, i].astype(int) for i in range(3)]
tassel = np.zeros((H, W), bool)
for x0, x1 in ((40, 85), (668, 712)):
    tassel[240:335, x0:x1] = True
a = np.maximum(a, ((tassel & (r > 110) & (r > g + 45)) * 255).astype(np.uint8))
a = cv2.GaussianBlur(a, (3, 3), 0)
rgb = inpaint(M.copy(), (334, 262, 418, 300), cream, radius=6)
save(rgb, a, PLAQUE, 'plaque_poster')

# Couplets: blank scroll from the mockup, re-lettered top-to-bottom.
font = ImageFont.truetype(FONT, 66)
def couplet(box, text, name):
    a = matte(box)
    x0, y0, x1, y1 = box
    rgb = M.copy()
    rgb = inpaint(rgb, (x0 + 12, y0 + 22, x1 - 12, y1 - 22), lambda r, g, b: (g > 120) & (r > 170), radius=9, grow=3)
    piece = Image.fromarray(np.dstack([rgb[y0:y1, x0:x1], a[y0:y1, x0:x1]]), 'RGBA')
    pw, ph = piece.size
    # Find the paper band (rows that are mostly red) and stretch it to fit seven characters.
    top_cap, bottom_cap = 26, 26
    cap_t = piece.crop((0, 0, pw, top_cap)); cap_b = piece.crop((0, ph - bottom_cap, pw, ph))
    paper = piece.crop((0, top_cap, pw, ph - bottom_cap))
    line = 70
    body_h = line * len(text) + 34
    paper = paper.resize((pw, body_h), Image.BICUBIC)
    out = Image.new('RGBA', (pw, body_h + top_cap + bottom_cap))
    out.alpha_composite(paper, (0, top_cap)); out.alpha_composite(cap_t, (0, 0)); out.alpha_composite(cap_b, (0, top_cap + body_h))
    glyphs = Image.new('L', out.size); d = ImageDraw.Draw(glyphs)
    for i, ch in enumerate(text):
        d.text((pw / 2, top_cap + 17 + line * i + line / 2), ch, font=font, fill=255, anchor='mm')
    shadow = glyphs.filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.GaussianBlur(1.2))
    dark = Image.new('RGBA', out.size, (88, 16, 18, 255)); dark.putalpha(shadow)
    out.alpha_composite(dark, (1, 2))
    grad = np.zeros((out.size[1], out.size[0], 4), np.uint8)
    t = np.linspace(0, 1, out.size[1])[:, None]
    grad[:, :, 0] = 255; grad[:, :, 1] = (226 - 40 * t).astype(np.uint8); grad[:, :, 2] = (150 - 70 * t).astype(np.uint8)
    grad[:, :, 3] = np.array(glyphs)
    out.alpha_composite(Image.fromarray(grad, 'RGBA'))
    out.save(f'{OUT}/{name}.png', optimize=True)
    print(name, out.size)
couplet((10, 326, 100, 553), '千里归途车满福', 'couplet_left')
couplet((650, 326, 742, 553), '万家团圆岁添春', 'couplet_right')

# Road: dashed country road with 9 gold milestones (re-spaced from the mockup's 8) and the lantern house.
ROAD = (55, 820, 712, 990)
a = matte((55, 835, 712, 1000))
lum = M.astype(float) @ np.array([.3, .59, .11])
surface = np.clip((lum - 52) / 22, 0, 1)
band = np.zeros((H, W)); band[850:985, 105:600] = 1
surface = cv2.morphologyEx((surface * band * 255).astype(np.uint8), cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
a = cv2.GaussianBlur(np.maximum(a, surface), (3, 3), 0)
a[945:1000, 530:712] = 0           # progress tag is drawn at runtime
a[:, :55] = 0
a[820:915, 55:112] = 0             # the small car on the start pin is its own sprite
a[820:893, 112:126] = 0
rgb = M.copy()
# Give the empty pin a clean cup rim where the car's wheels were.
yy, xx = np.mgrid[0:H, 0:W]
red_bits = (yy < 916) & (xx >= 100) & (xx < 128) & (M[:, :, 0].astype(int) > M[:, :, 1].astype(int) + 50)
a[red_bits] = 0
outer = ((xx - 93) / 24.0) ** 2 + ((yy - 919) / 6.5) ** 2 <= 1
inner = ((xx - 93) / 19.0) ** 2 + ((yy - 919.5) / 4.0) ** 2 <= 1
rgb[outer] = (232, 196, 132); rgb[inner] = (196, 140, 80)
a[outer] = 255
a[(yy < 919) & (xx >= 60) & (xx < 112) & ~outer] = 0
dots_old = [(153.8, 905.0), (207.3, 883.8), (265.8, 884.8), (318.8, 920.1), (369.8, 945.9), (431.8, 943.9), (486.0, 918.8), (541.2, 909.8)]
for cx, cy in dots_old:
    rgb = inpaint(rgb, (int(cx) - 10, int(cy) - 10, int(cx) + 11, int(cy) + 11), lambda r, g, b: (r > 200) & (g > 120) & (b < 170), radius=4, grow=2)
path = [(122.0, 917.0)] + dots_old + [(568.0, 906.0)]
px_ = np.array([p[0] for p in path]); py_ = np.array([p[1] for p in path])
seg = np.hypot(np.diff(px_), np.diff(py_)); arc = np.concatenate([[0], np.cumsum(seg)])
start = arc[1] - 12; end = arc[-2] + 14
targets = np.linspace(start, end, 9)
dots = [(float(np.interp(t, arc, px_)), float(np.interp(t, arc, py_))) for t in targets]
patch = M[876:894, 257:275].copy()          # one gold dot from the mockup
yy, xx = np.mgrid[0:18, 0:18]; disc = np.clip(9.5 - np.hypot(xx - 8.5, yy - 8.5), 0, 1)[:, :, None]
for cx, cy in dots:
    px, py = int(round(cx - 8.5)), int(round(cy - 8.5))
    rgb[py:py + 18, px:px + 18] = (patch * disc + rgb[py:py + 18, px:px + 18] * (1 - disc)).astype(np.uint8)
    a[py:py + 18, px:px + 18] = np.maximum(a[py:py + 18, px:px + 18], (disc[:, :, 0] * 255).astype(np.uint8))
save(rgb, a, ROAD, 'road_home')
print('DOTS', [(round(x - ROAD[0], 1), round(y - ROAD[1], 1)) for x, y in dots])

# Small red car that starts on the gold pin and walks along the milestones.
PIN = (62, 878, 124, 922)
a = matte((58, 870, 128, 922), pad=14)
save(M.copy(), a, PIN, 'car_marker')

# Start button with bows, text painted out.
BTN = (105, 995, 650, 1125)
a = matte(BTN)
rgb = inpaint(M.copy(), (255, 1030, 500, 1090), lambda r, g, b: (r < 150) & (g < 110), radius=7, grow=3)
save(rgb, a, BTN, 'btn_start_poster')

# Three coin badges with blank red labels.
for name, x0 in (('coin_rank', 90), ('coin_daily', 298), ('coin_classic', 508)):
    box = (x0, 1130, x0 + 158, 1292)
    a = matte(box)
    rgb = inpaint(M.copy(), (x0 + 12, 1243, x0 + 146, 1282), cream, radius=6)
    save(rgb, a, box, name)

# Help button.
HELP = (672, 24, 738, 90)
save(M.copy(), matte(HELP, pad=10), HELP, 'help_poster')

# The packed red hatchback (open trunk full of New Year goods); the plate badge is drawn over it at runtime.
CAR = (52, 372, 708, 856)
a = matte(CAR, pad=16)
save(M.copy(), a, CAR, 'car_poster')

# Keep the download small: 256-colour palettes (with alpha) like the other UI art.
for name in ('bg_poster', 'plaque_poster', 'car_poster', 'road_home', 'btn_start_poster', 'couplet_left', 'couplet_right',
             'coin_rank', 'coin_daily', 'coin_classic', 'car_marker', 'help_poster'):
    path = f'{OUT}/{name}.png'
    img = Image.open(path)
    q = img.convert('RGBA').quantize(256, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.FLOYDSTEINBERG) \
        if img.mode == 'RGBA' else img.convert('RGB').quantize(256, dither=Image.Dither.FLOYDSTEINBERG)
    q.save(path, optimize=True)
