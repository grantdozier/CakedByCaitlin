#!/usr/bin/env node
/**
 * images.mjs — convert scraped product images to WebP and repoint data/products.json at them.
 * Plain Node 20 ESM. ZERO npm dependencies.
 *
 * TOOL CHOICE: cwebp (the `webp` apt package), NOT sharp-cli.
 *   Why: `npx --yes sharp-cli` pulls ~40MB of native binaries on every CI run, is slow, and
 *   introduces an npm supply-chain surface into a repo that deliberately has no node_modules.
 *   `sudo apt-get install -y webp` on ubuntu-latest is ~2s, cached in the image, and cwebp is
 *   a single stable binary. The workflow installs it; see .github/workflows/enrich.yml.
 *
 * BEHAVIOUR:
 *   - Converts images/products/*.{png,jpg,jpeg} -> .webp (quality 82, max width 1000).
 *   - Rewrites each product's `image` field to the .webp path.
 *   - Deletes the source raster only after a successful conversion.
 *   - If cwebp is NOT installed (e.g. running locally on Windows), it does NOT fail the build:
 *     it warns, leaves the PNG/JPG in place, and exits 0. Pretty images are a nice-to-have;
 *     blocking Caitlin's product from shipping over a codec is not acceptable.
 *
 * USAGE:  node scripts/images.mjs [--dry-run]
 */

import { readFile, writeFile, readdir, unlink, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PRODUCTS_JSON = path.join(ROOT, 'data', 'products.json');
const IMAGE_DIR = path.join(ROOT, 'images', 'products');
const IMAGE_DIR_REL = 'images/products';

const DRY_RUN = process.argv.includes('--dry-run');

const SOURCE_EXTS = ['.png', '.jpg', '.jpeg'];
const QUALITY = 82;
const MAX_WIDTH = 1000;

/**
 * Pixel width of a PNG/JPEG, straight from the file header. No dependency, no decode.
 * Needed because `cwebp -resize 1000 0` is NOT "shrink to fit" — it is "make it exactly
 * 1000 wide", so a 400px retailer thumbnail got UPSCALED: blurrier than the source and
 * often a bigger file than the JPEG we started with. We only resize when it's too wide.
 * Returns 0 if we can't tell, in which case we don't resize (safe default).
 */
function imageWidth(buf) {
  // PNG: 8-byte signature, then IHDR whose width is a big-endian uint32 at offset 16.
  if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47) return buf.readUInt32BE(16);

  // JPEG: walk the marker segments to the Start-Of-Frame (SOFn), width is at +7 in that segment.
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) { i++; continue; }
      const marker = buf[i + 1];
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
      const len = buf.readUInt16BE(i + 2);
      // SOF0..SOF15, excluding the DHT/JPG/DAC markers c4/c8/cc which share the range.
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return buf.readUInt16BE(i + 7);
      }
      if (len < 2) break;
      i += 2 + len;
    }
  }
  return 0;
}

async function hasCwebp() {
  try {
    await execFileAsync('cwebp', ['-version']);
    return true;
  } catch {
    return false;
  }
}

/** Same serializer as enrich.mjs: preserve $comment, key order, one product per line. */
function serializeProducts(doc) {
  const lines = ['{'];
  if (doc['$comment']) {
    lines.push(`  "$comment": ${JSON.stringify(doc['$comment'], null, 2).split('\n').join('\n  ')},`);
  }
  lines.push('  "products": [');
  const items = doc.products || [];
  let prevCategory = null;
  items.forEach((p, i) => {
    if (prevCategory !== null && p.category !== prevCategory) lines.push('');
    prevCategory = p.category;
    const body = Object.entries(p)
      .map(([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`)
      .join(', ');
    lines.push(`    { ${body} }${i === items.length - 1 ? '' : ','}`);
  });
  lines.push('  ]', '}');
  return lines.join('\n') + '\n';
}

async function main() {
  if (!existsSync(IMAGE_DIR)) {
    console.log('images.mjs: no images/products/ directory yet — nothing to convert.');
    return;
  }

  const files = (await readdir(IMAGE_DIR)).filter((f) => SOURCE_EXTS.includes(path.extname(f).toLowerCase()));
  if (files.length === 0) {
    console.log('images.mjs: no PNG/JPG product images to convert.');
    return;
  }

  if (!(await hasCwebp())) {
    console.warn(
      'images.mjs: cwebp not found on PATH — skipping WebP conversion (exit 0, not a failure).\n' +
        '            CI installs it with: sudo apt-get install -y webp\n' +
        `            Leaving ${files.length} raster image(s) as-is; the shop still renders.`
    );
    return;
  }

  const renames = new Map(); // old repo-relative path -> new repo-relative path
  for (const file of files) {
    const src = path.join(IMAGE_DIR, file);
    const base = path.basename(file, path.extname(file));
    const dest = path.join(IMAGE_DIR, `${base}.webp`);
    try {
      const before = (await stat(src)).size;
      const width = imageWidth(await readFile(src));
      // Shrink-only. Never upscale a small retailer thumbnail.
      const resizeArgs = width > MAX_WIDTH ? ['-resize', String(MAX_WIDTH), '0'] : [];
      if (!DRY_RUN) {
        await execFileAsync('cwebp', ['-q', String(QUALITY), ...resizeArgs, src, '-o', dest]);
        await unlink(src);
      }
      const after = DRY_RUN ? before : (await stat(dest)).size;
      const saved = before ? Math.round((1 - after / before) * 100) : 0;
      console.log(`  ${file} -> ${base}.webp   ${(before / 1024).toFixed(0)}KB -> ${(after / 1024).toFixed(0)}KB (-${saved}%)`);
      renames.set(`${IMAGE_DIR_REL}/${file}`, `${IMAGE_DIR_REL}/${base}.webp`);
    } catch (err) {
      // A failed conversion must not block the product. Keep the original.
      console.warn(`  ${file}: conversion failed (${err.message}) — keeping original.`);
    }
  }

  if (renames.size === 0 || !existsSync(PRODUCTS_JSON)) return;

  const doc = JSON.parse(await readFile(PRODUCTS_JSON, 'utf8'));
  let rewritten = 0;
  for (const p of doc.products || []) {
    if (p.image && renames.has(p.image)) {
      p.image = renames.get(p.image);
      rewritten++;
    }
  }
  if (!DRY_RUN && rewritten) await writeFile(PRODUCTS_JSON, serializeProducts(doc), 'utf8');
  console.log(`images.mjs: converted ${renames.size} image(s), repointed ${rewritten} product path(s).`);
}

main().catch((err) => {
  // Never fail the pipeline over image cosmetics.
  console.error('images.mjs error (non-fatal):', err.message);
});
