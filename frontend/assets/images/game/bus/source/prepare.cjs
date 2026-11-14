/* Resize generated art for the bus game; never synthesize or remove alpha. */
const fs = require('node:fs');
const path = require('node:path');
const sharp = require(process.env.BUS_ART_SHARP_MODULE || 'sharp');
const root = path.resolve(__dirname, '..');
const input = [
  {
    "name": "bus-right",
    "file": "exec-4b5015ad-a50c-4add-9d08-f9b2c19dc039.png",
    "maxSize": 1280,
    "transparent": true
  },
  {
    "name": "bus-left",
    "file": "exec-85842b86-ac96-433b-ba32-4ebd8e27b09a.png",
    "maxSize": 1280,
    "transparent": true
  },
  {
    "name": "interior",
    "file": "exec-d5c07114-bf17-400b-9e0c-391b7921342c.png",
    "maxSize": 1790,
    "transparent": false
  },
  {
    "name": "library-exterior",
    "file": "exec-d763497d-5c49-4a48-ae9b-0d5dd72401be.png",
    "maxSize": 1080,
    "transparent": true
  },
  {
    "name": "shelter",
    "file": "exec-81c23549-cc57-4dbb-a526-d831357a2490.png",
    "maxSize": 768,
    "transparent": true
  },
  {
    "name": "driver",
    "file": "exec-39372351-be99-48f8-9ddb-91b9e2260a0b.png",
    "maxSize": 424,
    "transparent": true
  }
];
async function main() {
  const report = [];
  for (const item of input) {
    const source = path.join(__dirname, item.name + '.png');
    const before = await sharp(source).metadata();
    let pipeline = sharp(source);
    let crop = null;
    if (item.transparent) {
      if (!before.hasAlpha) throw new Error('Expected generated alpha: ' + item.name);
      const { data, info } = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      let left = info.width, top = info.height, right = -1, bottom = -1;
      for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
        if (data[(y * info.width + x) * 4 + 3] > 8) {
          left = Math.min(left, x); top = Math.min(top, y);
          right = Math.max(right, x); bottom = Math.max(bottom, y);
        }
      }
      if (right < left) throw new Error('Empty alpha: ' + item.name);
      left = Math.max(0, left - 4); top = Math.max(0, top - 4);
      right = Math.min(info.width - 1, right + 4); bottom = Math.min(info.height - 1, bottom + 4);
      crop = { left, top, width: right - left + 1, height: bottom - top + 1 };
      pipeline = pipeline.extract(crop);
    }
    const output = path.join(root, item.name + '.png');
    await pipeline.resize({ width: item.maxSize, height: item.maxSize, fit: 'inside', withoutEnlargement: true })
      .png({ compressionLevel: 9, adaptiveFiltering: true }).toFile(output);
    const after = await sharp(output).metadata();
    if (item.transparent && !after.hasAlpha) throw new Error('Lost alpha: ' + item.name);
    report.push({ name: item.name, source: 'source/' + item.name + '.png', sourceWidth: before.width, sourceHeight: before.height,
      crop, width: after.width, height: after.height, bytes: fs.statSync(output).size, hasAlpha: after.hasAlpha, builtInOriginal: item.file });
  }
  fs.writeFileSync(path.join(root, 'asset-manifest.json'), JSON.stringify(report, null, 2) + '\n');
  const layers = [];
  for (let i = 0; i < input.length; i++) {
    const asset = input[i];
    const buffer = await sharp(path.join(root, asset.name + '.png')).resize({ width: 430, height: 410, fit: 'inside' }).png().toBuffer();
    const meta = await sharp(buffer).metadata();
    layers.push({ input: buffer, left: 20 + (i % 3) * 460 + Math.floor((430 - meta.width) / 2), top: 20 + Math.floor(i / 3) * 450 + Math.floor((410 - meta.height) / 2) });
  }
  await sharp({ create: { width: 1380, height: 900, channels: 4, background: '#F2EADB' } }).composite(layers).png().toFile(path.join(__dirname, 'qa-contact-sheet.png'));
  console.log(JSON.stringify(report, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
