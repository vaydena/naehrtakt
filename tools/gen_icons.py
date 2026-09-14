#!/usr/bin/env python3
"""Erzeugt die PWA-Icons für Nährtakt (Pulse/Takt-Motiv, Petrol + Amber)."""
import os
from PIL import Image, ImageDraw

OUT = os.path.join(os.path.dirname(__file__), "..", "naehrtakt-web", "assets", "img")
OUT = os.path.abspath(OUT)
os.makedirs(OUT, exist_ok=True)

TEAL_TOP = (18, 133, 122)
TEAL_BOT = (10, 80, 73)
WHITE = (255, 255, 255)
AMBER = (240, 165, 63)

# Pulse-Polyline in 64er-Koordinaten (identisch zu favicon.svg)
PTS64 = [(10, 38), (19, 38), (23, 22), (31, 48), (36, 28), (40, 38), (51, 38)]
DOT64 = (46, 22, 4.4)

def vgradient(size, top, bot):
    img = Image.new("RGB", (1, size))
    for y in range(size):
        f = y / max(1, size - 1)
        img.putpixel((0, y), tuple(int(top[i] + (bot[i] - top[i]) * f) for i in range(3)))
    return img.resize((size, size))

def rounded_mask(size, radius):
    m = Image.new("L", (size, size), 0)
    d = ImageDraw.Draw(m)
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=255)
    return m

def draw_motif(draw, size, scale, cx_off=0.0, cy_off=0.0):
    """Zeichnet Pulse + Dot. scale bezogen auf 64er-Raster, zentriert."""
    # Zentrum des 64er-Motivs ~ (30.5, 35); wir skalieren um Bildmitte
    u = size / 64.0 * scale
    ox = size / 2 - 30.5 * u + cx_off * size
    oy = size / 2 - 35.0 * u + cy_off * size
    def T(p): return (ox + p[0] * u, oy + p[1] * u)
    w = max(3, int(4.2 * u))
    pts = [T(p) for p in PTS64]
    # Linien
    draw.line(pts, fill=WHITE, width=w, joint="curve")
    # runde Kappen/Joints
    r = w / 2
    for (x, y) in pts:
        draw.ellipse([x - r, y - r, x + r, y + r], fill=WHITE)
    # Amber-Dot
    dx, dy = T((DOT64[0], DOT64[1])); dr = DOT64[2] * u
    draw.ellipse([dx - dr, dy - dr, dx + dr, dy + dr], fill=AMBER)

def make_any(size):
    base = vgradient(size, TEAL_TOP, TEAL_BOT).convert("RGBA")
    d = ImageDraw.Draw(base)
    draw_motif(d, size, scale=1.0)
    # runde Ecken (transparent außen)
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.paste(base, (0, 0), rounded_mask(size, int(size * 15 / 64)))
    return out

def make_maskable(size):
    base = vgradient(size, TEAL_TOP, TEAL_BOT).convert("RGBA")
    d = ImageDraw.Draw(base)
    draw_motif(d, size, scale=1.28)  # größer, innerhalb Safe-Zone
    return base  # full-bleed

def make_apple(size):
    base = vgradient(size, TEAL_TOP, TEAL_BOT).convert("RGBA")
    d = ImageDraw.Draw(base)
    draw_motif(d, size, scale=1.0)
    return base  # iOS maskt selbst -> voll

def save(img, name):
    p = os.path.join(OUT, name)
    img.save(p)
    print("->", p, img.size)

if __name__ == "__main__":
    save(make_any(192), "icon-192.png")
    save(make_any(512), "icon-512.png")
    save(make_maskable(512), "icon-maskable-512.png")
    save(make_apple(180), "icon-180.png")
    save(make_any(32), "favicon-32.png")
    print("Fertig.")
