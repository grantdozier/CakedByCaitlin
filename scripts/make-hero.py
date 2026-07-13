"""
Builds the hero from Caitlin's square editorial shot.

THE HERO IS NOT FULL-SCREEN. It's a square image that sits at the top, sized so that
"SHOP MY FAVS" and the start of the category rail are visible without scrolling.

The source is already square (1:1) and already framed the way she wants it — hat at the top,
the @cakedbycaitlin cards across the floor, boots at the bottom. So there is NO CROP HERE AT
ALL. We resize and nothing else.

That's the whole point of using a pre-squared source: no object-fit guesswork, no focal
point to choose, nothing to amputate at any breakpoint. Earlier attempts cropped a 9:16
frame into a square and lost the hat. Cropping was always the wrong move — the right move
was a square source.

Run: py scripts/make-hero.py
"""

from PIL import Image
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = Path("C:/Users/gdozi/Downloads/caitlin_hero_square_image_.png")

im = Image.open(SRC).convert("RGB")
w, h = im.size
print(f"source: {w}x{h}  (ratio {w/h:.3f})")

if abs(w / h - 1.0) > 0.02:
    print("  ! source is not square — cropping to centre square")
    side = min(w, h)
    im = im.crop(((w - side) // 2, 0, (w - side) // 2 + side, side))

# ---- hero: square, 2x for retina. Displayed at ~600px max, so 1200 is plenty. ----
hero = im.resize((1200, 1200), Image.LANCZOS)
hero.save(ROOT / "images" / "hero.webp", "WEBP", quality=86, method=6)
print(f"images/hero.webp  1200x1200 (1:1, no crop)  {(ROOT / 'images' / 'hero.webp').stat().st_size / 1024:.0f} KB")

# ---- og-image (1200x630) -----------------------------------------------------
# The share card has to be landscape, so this one DOES crop. Pull from the upper-middle so
# she's actually in frame rather than a rectangle of floor.
og_ratio = 1200 / 630
sq = im.size[0]
og_h = int(sq / og_ratio)
og_top = min(int(sq * 0.16), sq - og_h)
og = im.crop((0, og_top, sq, og_top + og_h)).resize((1200, 630), Image.LANCZOS)
og.save(ROOT / "og-image.jpg", "JPEG", quality=88, optimize=True)
print(f"og-image.jpg      1200x630   {(ROOT / 'og-image.jpg').stat().st_size / 1024:.0f} KB")
