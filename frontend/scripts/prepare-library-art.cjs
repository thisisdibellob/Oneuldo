/* Asset packaging only: preserve generated RGBA; crop and resize to runtime PNGs. */
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');

const root = path.resolve(__dirname, '../assets/images/game/library');
const source = path.join(root, 'source');

async function alphaBounds(input, initial) {
  let instance = sharp(input);
  if (initial) instance = instance.extract(initial);
  const { data, info } = await instance.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let left = info.width, top = info.height, right = -1, bottom = -1;
  for (let y = 0; y < info.height; y += 1) for (let x = 0; x < info.width; x += 1) {
    // Ignore near-invisible generator matte when deciding the crop, without changing alpha.
    if (data[(y * info.width + x) * 4 + 3] > 8) {
      left = Math.min(left, x); top = Math.min(top, y);
      right = Math.max(right, x); bottom = Math.max(bottom, y);
    }
  }
  if (right < left) throw new Error(`No visible sprite: ${input}`);
  const padding = 3;
  left = Math.max(0, left - padding); top = Math.max(0, top - padding);
  right = Math.min(info.width - 1, right + padding); bottom = Math.min(info.height - 1, bottom + padding);
  return {
    left: left + (initial?.left ?? 0), top: top + (initial?.top ?? 0),
    width: right - left + 1, height: bottom - top + 1,
  };
}

async function prepare(name, sourceName, initial, maxSize) {
  const input = path.join(source, sourceName);
  const crop = await alphaBounds(input, initial);
  const out = path.join(root, `${name}.png`);
  await sharp(input).extract(crop)
    .resize({ width: maxSize, height: maxSize, fit: 'inside', withoutEnlargement: true })
    .png({ compressionLevel: 9, adaptiveFiltering: true }).toFile(out);
  const meta = await sharp(out).metadata();
  return { name, source: sourceName, crop, width: meta.width, height: meta.height, alpha: meta.hasAlpha };
}

async function main() {
  const results = [];
  const furniture = [
    ['shelf', { left: 0, top: 0, width: 565, height: 515 }, 768],
    ['desk', { left: 565, top: 0, width: 575, height: 515 }, 768],
    ['cart', { left: 1140, top: 0, width: 396, height: 515 }, 512],
    ['table', { left: 0, top: 515, width: 610, height: 509 }, 768],
    ['plant', { left: 610, top: 515, width: 405, height: 509 }, 512],
    ['return-box', { left: 1015, top: 515, width: 521, height: 509 }, 512],
  ];
  for (const [name, rect, size] of furniture) results.push(await prepare(name, 'furniture-atlas.png', rect, size));
  results.push(await prepare('librarian', 'librarian.png', null, 768));
  // Cover objects are offset slightly inside the atlas; boundaries fall in transparent gutters.
  const xs = [0, 390, 724, 1058, 1448];
  const ys = [0, 365, 715, 1086];
  for (let row = 0; row < 3; row += 1) for (let col = 0; col < 4; col += 1) {
    const index = row * 4 + col + 1;
    results.push(await prepare(`book-${String(index).padStart(2, '0')}`, 'book-atlas.png', {
      left: xs[col], top: ys[row], width: xs[col + 1] - xs[col], height: ys[row + 1] - ys[row],
    }, 384));
  }
  fs.writeFileSync(path.join(root, 'asset-manifest.json'), JSON.stringify(results, null, 2) + '\n');
  console.log(JSON.stringify(results, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
