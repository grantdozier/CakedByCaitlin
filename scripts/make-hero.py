"""
Builds the hero from Caitlin's editorial shot.

The hero is now FULL-BLEED: it fills the entire screen, edge to edge and top to bottom,
and the site begins below it.

That changes the crop. The source is 941x1672 — a ratio of 0.563, which is almost exactly
9:16 (0.5625). So on a phone the FULL frame fits the screen with essentially no crop at
all: hat at the top, boots at the bottom, her scattered CAKEDBYCAITLIN cards in between.
A square crop (what we had) would have been centre-cropped into a tall viewport and thrown
away both the hat and the boots — the two things that make the shot hers.

On a wide desktop viewport, object-fit: cover crops the sides instead. CSS pins
object-position so she stays in frame there too.

Also emits the 1200x630 og-image from the same frame, so a shared link shows her.

Run: py scripts/make-hero.py
"""

from PIL import Image
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = Path("C:/Users/gdozi/Downloads/caitlin_hero_photo.png")

im = Image.open(SRC).convert("RGB")
w, h = im.size
print(f"source: {w}x{h}  (ratio {w/h:.3f} — 9:16 is 0.563)")

# ---- full-bleed hero ---------------------------------------------------------
# No crop. Just scale the whole frame up for retina. 1080x1920 covers every phone
# at 2-3x and any desktop at full height.
hero = im.resize((1080, 1920), Image.LANCZOS)
hero.save(ROOT / "images" / "hero.webp", "WEBP", quality=84, method=6)
size_kb = (ROOT / "images" / "hero.webp").stat().st_size / 1024
print(f"images/hero.webp  1080x1920  {size_kb:.0f} KB")

# ---- og-image (1200x630) -----------------------------------------------------
# Landscape crop of the same frame, pulled from the upper-middle so she's actually in it.
target_ratio = 1200 / 630
crop_h = int(w / target_ratio)
og_top = min(int(h * 0.22), h - crop_h)
og = im.crop((0, og_top, w, og_top + crop_h)).resize((1200, 630), Image.LANCZOS)
og.save(ROOT / "og-image.jpg", "JPEG", quality=88, optimize=True)
print(f"og-image.jpg      1200x630   {(ROOT / 'og-image.jpg').stat().st_size / 1024:.0f} KB")
