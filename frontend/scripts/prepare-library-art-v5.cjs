// Mechanical alpha-bound crop and runtime resizing; original art is in v5/source.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const sharp = require('sharp');
const root = path.resolve(__dirname, '../assets/images/game/library/v5');
const specs = { window: 512, display: 640, plants: 384 };

(async () => {
  const assets = [];
  for (const [name, width] of Object.entries(specs)) {
    const source = path.join(root, 'source', `${name}.png`);
    const { data, info } = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let left = info.width, top = info.height, right = 0, bottom = 0;
    for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
      if (data[(y * info.width + x) * 4 + 3] < 16) continue;
      left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y);
    }
    if (right <= left) throw new Error(`Empty sprite: ${name}`);
    const crop = { left, top, width: right - left + 1, height: bottom - top + 1 };
    const output = await sharp(source).extract(crop).resize({ width: width - 6 }).extend({ top: 3, bottom: 3, left: 3, right: 3, background: '#00000000' }).png({ compressionLevel: 9 }).toBuffer();
    fs.writeFileSync(path.join(root, `${name}.png`), output);
    const meta = await sharp(output).metadata();
    const rgba = await sharp(output).raw().toBuffer();
    let transparent = 0, outerEdgeNonzero = 0;
    for (let y = 0; y < meta.height; y++) for (let x = 0; x < meta.width; x++) {
      const a = rgba[(y * meta.width + x) * 4 + 3];
      if (a === 0) transparent++;
      if ((x === 0 || y === 0 || x === meta.width - 1 || y === meta.height - 1) && a !== 0) outerEdgeNonzero++;
    }
    assets.push({ name, file: `${name}.png`, width: meta.width, height: meta.height, bytes: output.length, crop, alpha: { transparent, outerEdgeNonzero }, sha256: crypto.createHash('sha256').update(output).digest('hex') });
  }
  fs.writeFileSync(path.join(root, 'asset-manifest.json'), JSON.stringify({ generator: 'built-in image_gen', assets }, null, 2));
  console.log(JSON.stringify(assets, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
