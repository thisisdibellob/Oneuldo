// Preserve image_gen cutouts, validate alpha, and package appropriately sized PNGs.
// node scripts/prepare-market-layout-assets.cjs manifest.json /path/to/sharp
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const [manifestPath, sharpModule] = process.argv.slice(2);
const sharp = require(sharpModule || 'sharp');
const root = path.resolve(__dirname, '..');
const assetsRoot = path.join(root, 'assets/images/game/market');

(async () => {
  const entries = JSON.parse(fs.readFileSync(manifestPath, 'utf8').replace(/^\uFEFF/, ''));
  const results = [];
  for (const entry of entries) {
    const destination = path.resolve(entry.destination);
    assert(destination.startsWith(assetsRoot + path.sep), 'Destination must be a market project asset.');
    assert.notEqual(path.resolve(entry.rawPath), destination, 'Preserve the generated source.');
    const source = fs.readFileSync(entry.rawPath);
    const metadata = await sharp(source).metadata();
    assert(metadata.hasAlpha, entry.key + ': real alpha is required; do not ship a painted checkerboard.');
    const { data, info } = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let transparent = 0, solid = 0;
    for (let i = 3; i < data.length; i += info.channels) {
      transparent += data[i] <= 2 ? 1 : 0;
      solid += data[i] >= 240 ? 1 : 0;
    }
    assert(transparent > info.width * info.height * 0.05 && solid > info.width * info.height * 0.05,
      entry.key + ': empty or nontransparent image.');
    const size = entry.size ?? 512;
    const output = await sharp(source).resize({ width: size, height: size, fit: 'inside', withoutEnlargement: true })
      .png({ compressionLevel: 9, palette: false }).toBuffer();
    fs.writeFileSync(destination, output);
    const final = await sharp(output).metadata();
    results.push({ key: entry.key, rawPath: entry.rawPath, destination, width: final.width, height: final.height,
      alpha: final.hasAlpha, sourceTransparentPixels: transparent, sourceSolidPixels: solid,
      bytes: output.length, sha256: createHash('sha256').update(output).digest('hex') });
  }
  fs.writeFileSync(manifestPath.replace(/\.json$/, '-qa.json'), JSON.stringify(results, null, 2) + '\n');
  console.log(JSON.stringify(results, null, 2));
})().catch(error => { console.error(error.message); process.exitCode = 1; });
