// Build-time asset optimization only. The app has no dependency on Sharp.
// Supply an existing Sharp module with MARKET_ASSET_SHARP_MODULE when it is not installed locally.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const sharp = require(process.env.MARKET_ASSET_SHARP_MODULE || 'sharp');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const docs = join(root, 'docs/design-concepts');
const manifest = JSON.parse(await readFile(join(docs, '2026-09-11-market-catalog-prompts.json'), 'utf8'));
const assetDirectory = join(root, manifest.runtimeDirectory);
const qaDirectory = join(docs, '2026-09-11-market-catalog-qa');
await mkdir(qaDirectory, { recursive: true });

let originalBytes = 0;
let runtimeBytes = 0;
const optimized = [];
for (const asset of manifest.assets.filter(asset => asset.generated)) {
  const path = join(assetDirectory, `product_${asset.id}.png`);
  const input = await readFile(path);
  const before = await sharp(input).metadata();
  assert(before.hasAlpha, `${asset.id}: the source must preserve transparency`);
  const output = await sharp(input)
    .resize({ width: 512, height: 512, fit: 'inside', withoutEnlargement: true })
    .png({ compressionLevel: 9, palette: false })
    .toBuffer();
  const after = await sharp(output).metadata();
  assert(after.hasAlpha && after.width <= 512 && after.height <= 512, `${asset.id}: invalid runtime asset`);
  await writeFile(path, output);
  originalBytes += input.length;
  runtimeBytes += output.length;
  optimized.push({ id: asset.id, before: { bytes: input.length, width: before.width, height: before.height },
    after: { bytes: output.length, width: after.width, height: after.height } });
}

const files = [];
const hashes = new Set();
for (const asset of manifest.assets) {
  const buffer = await readFile(join(assetDirectory, `product_${asset.id}.png`));
  const metadata = await sharp(buffer).metadata();
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let transparentPixels = 0;
  let opaquePixels = 0;
  for (let offset = 3; offset < data.length; offset += info.channels) {
    if (data[offset] <= 2) transparentPixels++;
    if (data[offset] === 255) opaquePixels++;
  }
  assert(metadata.format === 'png' && metadata.hasAlpha, `${asset.id}: expected RGBA PNG`);
  assert(transparentPixels > 0 && opaquePixels > 0, `${asset.id}: empty image or missing alpha cutout`);
  const sha256 = createHash('sha256').update(buffer).digest('hex');
  assert(!hashes.has(sha256), `${asset.id}: duplicate image bytes`);
  hashes.add(sha256);
  files.push({ id: asset.id, categoryId: asset.categoryId, bytes: buffer.length,
    width: metadata.width, height: metadata.height, alpha: true,
    transparentFraction: Number((transparentPixels / (info.width * info.height)).toFixed(4)), sha256 });
}
assert.equal(files.length, 96);

const escapeXml = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
for (const category of ['fresh', 'produce', 'meal', 'drink']) {
  const assets = manifest.assets.filter(asset => asset.categoryId === category);
  assert.equal(assets.length, 24, `${category}: expected 24 products`);
  const layers = [];
  for (const [index, asset] of assets.entries()) {
    const left = (index % 6) * 220;
    const top = Math.floor(index / 6) * 260;
    const product = await sharp(join(assetDirectory, `product_${asset.id}.png`))
      .resize(200, 200, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
    const label = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="220" height="54"><text x="110" y="21" text-anchor="middle" font-family="Malgun Gothic, sans-serif" font-size="17" fill="#29342E">${escapeXml(asset.name)}</text><text x="110" y="44" text-anchor="middle" font-family="sans-serif" font-size="12" fill="#65736B">${escapeXml(asset.id)}</text></svg>`);
    layers.push({ input: product, left: left + 10, top: top + 5 });
    layers.push({ input: label, left, top: top + 203 });
  }
  await sharp({ create: { width: 1320, height: 1040, channels: 4, background: '#FFFBF5' } })
    .composite(layers).png({ compressionLevel: 9 }).toFile(join(qaDirectory, `${category}.png`));
}

const report = {
  checkedAt: new Date().toISOString(), generatedProducts: optimized.length, totalProducts: files.length,
  originalBytes, runtimeBytes, savedBytes: originalBytes - runtimeBytes,
  reductionPercent: Number(((1 - runtimeBytes / originalBytes) * 100).toFixed(2)),
  processing: 'Generated assets only: contain within 512px, preserve RGBA, PNG compression level 9. No semantic artwork edits. Original generator outputs preserved outside the runtime directory.',
  optimized, files,
};
await writeFile(join(qaDirectory, 'asset-validation.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ products: files.length, generated: optimized.length, originalBytes, runtimeBytes, reductionPercent: report.reductionPercent, qaDirectory }));
