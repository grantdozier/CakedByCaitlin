"""
Builds the hero image from Caitlin's editorial shot.

The source is 941x1672 portrait. The hero is a SQUARE at the top of the page, so this
crops rather than squashes — and it crops from the TOP, not the centre. A centre crop of
this frame would cut her head off and leave a square of boots and concrete: the subject
sits in the upper two-thirds, with her scattered CAKEDBYCAITLIN cards around her.

Also emits a 1200x630 og-image from the same frame, so a link shared to Instagram finally
shows her instead of a type card.

Run: py scripts/make-hero.py
"""

from PIL import Image
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = Path("C:/Users/gdozi/Downloads/caitlin_hero_photo.png")

im = Image.open(SRC).convert("RGB")
w, h = im.size

# ---- square hero -------------------------------------------------------------
# Crop from the top. She and the cards live in the upper portion of the frame;
# a centred square would be mostly floor.
side = w
top = int(h * 0.13)          # nudge down slightly off the very top edge
top = min(top, h - side)     # never run past the bottom
square = im.crop((0, top, w, top + side))

# 2x for retina. The square renders ~560px at most, so 1120 is plenty and keeps it light.
square = square.resize((1120, 1120), Image.LANCZOS)
square.save(ROOT / "images" / "hero.webp", "WEBP", quality=86, method=6)
print(f"images/hero.webp  1120x1120  {(ROOT / 'images' / 'hero.webp').stat().st_size / 1024:.0f} KB")

# ---- og-image (1200x630) -----------------------------------------------------
# Landscape crop of the same frame. Pull from the upper-middle so she's in it.
target_ratio = 1200 / 630
crop_h = int(w / target_ratio)
og_top = int(h * 0.22)
og_top = min(og_top, h - crop_h)
og = im.crop((0, og_top, w, og_top + crop_h)).resize((1200, 630), Image.LANCZOS)
og.save(ROOT / "og-image.jpg", "JPEG", quality=88, optimize=True)
print(f"og-image.jpg      1200x630   {(ROOT / 'og-image.jpg').stat().st_size / 1024:.0f} KB")
