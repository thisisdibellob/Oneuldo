/* Crop and downsize the original transparent v2 furniture. Preserve generated alpha. */
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');
const root = path.resolve(__dirname, '../assets/images/game/library/v2');

async function prepare(name, size) {
  const input = path.join(root, 'source', `${name}.png`);
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let left = info.width, top = info.height, right = 0, bottom = 0;
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
    if (data[(y * info.width + x) * 4 + 3] > 8) {
      left = Math.min(left, x); top = Math.min(top, y);
      right = Math.max(right, x); bottom = Math.max(bottom, y);
    }
  }
  left = Math.max(0, left - 4); top = Math.max(0, top - 4);
  right = Math.min(info.width - 1, right + 4); bottom = Math.min(info.height - 1, bottom + 4);
  const crop = { left, top, width: right - left + 1, height: bottom - top + 1 };
  const output = path.join(root, `${name}.png`);
  await sharp(input).extract(crop).resize({ width: size, height: size, fit: 'inside', withoutEnlargement: true })
    .png({ compressionLevel: 9, adaptiveFiltering: true }).toFile(output);
  const metadata = await sharp(output).metadata();
  const raw = await sharp(output).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (!metadata.hasAlpha || raw.data[3] !== 0) throw new Error(`Transparent corner missing: ${name}`);
  return { name, source: `source/${name}.png`, sourceSize: { width: info.width, height: info.height }, crop,
    width: metadata.width, height: metadata.height, bytes: fs.statSync(output).size, alpha: true };
}

async function main() {
  const output = [];
  for (const [name, size] of [['shelf-tall', 512], ['shelf-low', 608], ['shelf-variant', 448], ['computer-desk', 480]]) {
    output.push(await prepare(name, size));
  }
  const images = [];
  for (const [index, item] of output.entries()) {
    const input = await sharp(path.join(root, `${item.name}.png`)).resize({ width: 390, height: 350, fit: 'inside' }).toBuffer();
    images.push({ input, left: 25 + (index % 2) * 440, top: 25 + Math.floor(index / 2) * 400 });
  }
  await sharp({ create: { width: 900, height: 810, channels: 4, background: '#F2EADB' } })
    .composite(images).png().toFile(path.join(root, 'source/qa-contact-sheet.png'));
  fs.writeFileSync(path.join(root, 'asset-manifest.json'), JSON.stringify(output, null, 2) + '\n');
  console.log(JSON.stringify(output, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
