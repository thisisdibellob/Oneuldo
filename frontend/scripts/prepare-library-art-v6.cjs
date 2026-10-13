// Crop alpha bounds and normalize matching furniture elevations, without repainting.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), sharp = require('sharp');
const root = path.resolve(__dirname, '../assets/images/game/library/v6');
const specs = { 'wall-left': [1200, 368], 'wall-right': [1200, 368], 'island-arts': [800, 248], 'island-story': [800, 248] };
(async () => {
  const assets = [];
  for (const [name, [width, height]] of Object.entries(specs)) {
    const source = path.join(root, 'source', name + '.png');
    const { data, info } = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let left = info.width, top = info.height, right = 0, bottom = 0;
    for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) if (data[(y * info.width + x) * 4 + 3] > 24) {
      left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y);
    }
    const crop = { left, top, width: right - left + 1, height: bottom - top + 1 };
    const output = await sharp(source).extract(crop).resize(width - 4, height - 4, { fit: 'fill' }).extend({ top: 2, left: 2, right: 2, bottom: 2, background: '#00000000' }).png({ compressionLevel: 9 }).toBuffer();
    fs.writeFileSync(path.join(root, name + '.png'), output);
    const rgba = await sharp(output).raw().toBuffer();
    let transparent = 0, outerEdgeNonzero = 0;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const a = rgba[(y * width + x) * 4 + 3];
      if (a === 0) transparent++;
      if ((x === 0 || y === 0 || x === width - 1 || y === height - 1) && a !== 0) outerEdgeNonzero++;
    }
    assets.push({ name, file: name + '.png', width, height, bytes: output.length, crop, alpha: { transparent, outerEdgeNonzero }, sha256: crypto.createHash('sha256').update(output).digest('hex') });
  }
  fs.writeFileSync(path.join(root, 'asset-manifest.json'), JSON.stringify({ generator: 'built-in image_gen', assets }, null, 2));
  console.log(JSON.stringify(assets, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
