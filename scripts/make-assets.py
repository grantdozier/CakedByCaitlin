"""
Generates the brand assets that don't exist yet:
  og-image.jpg        1200x630  — what shows when the link is shared to Instagram/iMessage
  apple-touch-icon.png 180x180  — home-screen icon

Deliberately typographic, not photographic. Caitlin's source photos are only ~280px wide,
so any crop of them at 1200x630 would be a 4x upscale and look soft — which is exactly the
wrong first impression for a beauty brand. A clean type card is honest and looks intentional.
Swap in a real photo here the moment she supplies high-resolution originals.

Run: py scripts/make-assets.py
"""

from PIL import Image, ImageDraw, ImageFont
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

BG = (247, 246, 243)
INK = (17, 17, 17)
SOFT = (110, 110, 110)


def font(names, size):
    """Pick the first serif that actually exists on this machine."""
    for name in names:
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()


SERIF = ["bodoni.ttf", "Didot.ttc", "georgia.ttf", "times.ttf"]
SANS = ["Jost-Regular.ttf", "segoeui.ttf", "arial.ttf"]


def centered(draw, y, text, f, fill):
    left, top, right, bottom = draw.textbbox((0, 0), text, font=f)
    draw.text(((1200 - (right - left)) / 2 - left, y), text, font=f, fill=fill)


# ---------- og-image.jpg ----------
og = Image.new("RGB", (1200, 630), BG)
d = ImageDraw.Draw(og)

d.rectangle([40, 40, 1160, 590], outline=(228, 226, 221), width=1)

centered(d, 215, "Curated by", font(SERIF, 34), SOFT)
centered(d, 265, "Caked by Caitlin", font(SERIF, 96), INK)
centered(d, 400, "THE PRODUCT EDIT", font(SANS, 26), INK)
centered(d, 455, "What a working wedding makeup artist actually uses on her brides.", font(SANS, 24), SOFT)

og.save(ROOT / "og-image.jpg", "JPEG", quality=90, optimize=True)
print("wrote og-image.jpg (1200x630)")

# ---------- apple-touch-icon.png ----------
icon = Image.new("RGB", (180, 180), INK)
di = ImageDraw.Draw(icon)
f = font(SERIF, 104)
left, top, right, bottom = di.textbbox((0, 0), "C", font=f)
di.text(((180 - (right - left)) / 2 - left, (180 - (bottom - top)) / 2 - top), "C", font=f, fill=BG)
icon.save(ROOT / "apple-touch-icon.png", "PNG", optimize=True)
print("wrote apple-touch-icon.png (180x180)")
