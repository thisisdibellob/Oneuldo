// Package image_gen illustrations without repainting the characters.
// Usage: node scripts/prepare-market-people.cjs input-manifest.json /path/to/sharp
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const [manifestFile, sharpModule = 'sharp'] = process.argv.slice(2);
const sharp = require(sharpModule);
const root = path.resolve(__dirname, '..');
const outputDir = path.join(root, 'assets/images/game/market/people');
const reportDir = path.join(root, '../docs/design-concepts/2026-09-11-market-people');
const entries = JSON.parse(fs.readFileSync(manifestFile, 'utf8').replace(/^\uFEFF/, ''));
const escapeXml = text => text.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character]);

async function packagePerson(entry) {
  assert(/^(employee-(male|female)|customer-(adult|senior|child)-(male|female))-0[12]$/.test(entry.id), 'Unknown NPC ID.');
  const source = fs.readFileSync(entry.rawPath);
  const { data, info } = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let originalTransparent = 0;
  let magentaBackground = 0;
  for (let p = 0; p < data.length; p += 4) {
    if (data[p + 3] < 8) originalTransparent += 1;
    if (Math.min(data[p], data[p + 2]) - data[p + 1] > 190) magentaBackground += 1;
  }
  const area = info.width * info.height;
  const hasRealAlpha = originalTransparent > area * 0.1;
  assert(hasRealAlpha || magentaBackground > area * 0.35,
    entry.id + ': background must be real alpha or the requested uniform magenta; reject painted checkerboards.');
  // The generation tool can return RGB despite an alpha request. Key only its
  // explicitly requested magenta separation color, keeping all other paint intact.
  if (!hasRealAlpha) {
    for (let p = 0; p < data.length; p += 4) {
      const difference = Math.min(data[p], data[p + 2]) - data[p + 1];
      if (difference <= 20) continue;
      const backgroundFraction = Math.min(1, difference / 255);
      if (backgroundFraction >= 0.7) {
        data[p] = data[p + 1] = data[p + 2] = data[p + 3] = 0;
      } else {
        const foregroundFraction = 1 - backgroundFraction;
        data[p] = Math.max(0, Math.round((data[p] - 255 * backgroundFraction) / foregroundFraction));
        data[p + 1] = Math.min(255, Math.round(data[p + 1] / foregroundFraction));
        data[p + 2] = Math.max(0, Math.round((data[p + 2] - 255 * backgroundFraction) / foregroundFraction));
        data[p + 3] = Math.round(data[p + 3] * foregroundFraction);
      }
    }
  }
  let left = info.width, right = 0, top = info.height, bottom = 0, opaque = 0, transparent = 0;
  for (let y = 0; y < info.height; y += 1) for (let x = 0; x < info.width; x += 1) {
    const alpha = data[(y * info.width + x) * 4 + 3];
    transparent += alpha <= 8 ? 1 : 0;
    opaque += alpha >= 240 ? 1 : 0;
    if (alpha > 8) { left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y); }
  }
  assert(opaque > area * 0.08 && transparent > area * 0.35, entry.id + ': missing figure or background.');
  assert(left > 0 && top > 0 && right < info.width - 1 && bottom < info.height - 1, entry.id + ': cropped figure at the edge.');
  const cutout = await sharp(data, { raw: info }).png({ compressionLevel: 9 }).toBuffer();
  const illustration = path.join(outputDir, 'illustrations', entry.id + '-v1.png');
  fs.writeFileSync(illustration, cutout);
  const body = await sharp(cutout).extract({ left, top, width: right - left + 1, height: bottom - top + 1 })
    .resize({ width: 244, height: 504, fit: 'inside' }).png().toBuffer();
  const bodyInfo = await sharp(body).metadata();
  const runtime = await sharp({ create: { width: 256, height: 512, channels: 4, background: '#00000000' } })
    .composite([{ input: body, left: Math.round((256 - bodyInfo.width) / 2), top: 512 - bodyInfo.height }])
    .png({ compressionLevel: 9 }).toBuffer();
  const destination = path.join(outputDir, entry.id + '-v1.png');
  fs.writeFileSync(destination, runtime);
  return { ...entry, illustration: path.relative(root, illustration).replaceAll('\\', '/'),
    destination: path.relative(root, destination).replaceAll('\\', '/'),
    sourceWidth: info.width, sourceHeight: info.height, width: 256, height: 512,
    alpha: true, backgroundProcessing: hasRealAlpha ? 'preserved-generated-alpha' : 'magenta-key',
    bounds: { left, top, right, bottom }, transparentPixels: transparent, opaquePixels: opaque,
    bytes: runtime.length, sha256: createHash('sha256').update(runtime).digest('hex') };
}

async function createContactSheet(results) {
  const width = 1200, header = 180, rowHeight = 380, height = header + Math.ceil(results.length / 4) * rowHeight;
  const title = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#F6F2E9"/><g font-family="Malgun Gothic, sans-serif" fill="#3E4E43"><text x="36" y="65" font-size="32" font-weight="bold">오늘도 · 마트 NPC 16종</text><text x="36" y="109" font-size="18">종업원 4명 / 성인 · 노인 · 어린이 손님 각 4명</text><text x="940" y="150" font-size="15">그림체 기준: 플레이어</text>${results.map((entry, index) => { const x = index % 4 * 300, y = header + Math.floor(index / 4) * rowHeight; return `<rect x="${x + 10}" y="${y + 6}" width="280" height="366" rx="14" fill="${index < 4 ? '#E9EFE5' : '#FFFCF5'}"/><text x="${x + 150}" y="${y + 345}" text-anchor="middle" font-size="18">${escapeXml(entry.label)}</text>`; }).join('')}</g></svg>`;
  const layers = [];
  const playerPath = path.join(root, 'assets/images/game/characters/player/fresh-v1/chr_player_fresh_front_idle_f00_v2@2x.png');
  layers.push({ input: await sharp(playerPath).resize({ height: 134 }).png().toBuffer(), left: 1000, top: 0 });
  for (let i = 0; i < results.length; i += 1) {
    const displayHeight = results[i].age === 'child' ? 228 : 300;
    const sprite = await sharp(path.join(root, results[i].destination)).resize({ height: displayHeight }).png().toBuffer();
    const size = await sharp(sprite).metadata();
    layers.push({ input: sprite, left: i % 4 * 300 + Math.round((300 - size.width) / 2), top: header + Math.floor(i / 4) * rowHeight + 314 - displayHeight });
  }
  await sharp(Buffer.from(title)).composite(layers).png().toFile(path.join(reportDir, 'contact-sheet.png'));
}

(async () => {
  fs.mkdirSync(path.join(outputDir, 'illustrations'), { recursive: true });
  fs.mkdirSync(reportDir, { recursive: true });
  const results = [];
  for (const entry of entries) results.push(await packagePerson(entry));
  fs.writeFileSync(path.join(reportDir, 'asset-qa.json'), JSON.stringify(results, null, 2) + '\n');
  await createContactSheet(results);
  console.log(JSON.stringify(results.map(({ id, width, height, alpha, bytes }) => ({ id, width, height, alpha, bytes })), null, 2));
})().catch(error => { console.error(error.message); process.exitCode = 1; });
