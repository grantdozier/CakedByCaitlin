"""
Converts Caitlin's photos to WebP.

The originals are PNGs saved as 8-bit RGBA at ~280x347 — about 2.9 bytes per pixel, where raw
uncompressed RGBA is 4.0. In other words they are barely compressed at all, and the alpha channel
is fully opaque in every one of them: an entire wasted plane. 2.1 MB of it, eagerly loaded, on a
site whose traffic arrives from Instagram over mobile data.

Run: py scripts/optimize-images.py

NOTE: this cannot fix the real problem, which is that the source images are only ~280px wide.
The hero-sized uses are 5-10x upscales. Caitlin needs to supply high-resolution originals;
no amount of encoding recovers detail that was never captured.
"""

from PIL import Image
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
IMAGES = ROOT / "images"

total_before = 0
total_after = 0

for png in sorted(IMAGES.glob("*.png")):
    webp = png.with_suffix(".webp")

    im = Image.open(png)
    before = png.stat().st_size
    total_before += before

    # Drop the alpha channel — it's 100% opaque in all nine, so it's pure waste.
    if im.mode in ("RGBA", "LA", "P"):
        im = im.convert("RGBA")
        bg = Image.new("RGB", im.size, (255, 255, 255))
        bg.paste(im, mask=im.split()[-1])
        im = bg
    else:
        im = im.convert("RGB")

    im.save(webp, "WEBP", quality=82, method=6)
    after = webp.stat().st_size
    total_after += after

    print(f"  {png.name:12s} {im.size[0]}x{im.size[1]}  {before/1024:7.1f} KB -> {after/1024:6.1f} KB  ({100 - after/before*100:.0f}% smaller)")

print()
print(f"  TOTAL  {total_before/1024:.0f} KB -> {total_after/1024:.0f} KB  ({100 - total_after/total_before*100:.0f}% smaller)")
