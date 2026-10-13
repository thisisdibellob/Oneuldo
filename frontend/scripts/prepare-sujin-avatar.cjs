// Mechanical sprite import only: preserve generated RGBA art and align the feet.
// Run with the workspace's bundled sharp available through NODE_PATH.
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');

const destination = path.resolve(__dirname, '../assets/images/game/characters/village/sujin-v1');
async function main() {
  const source = path.join(destination, 'source/sujin-original.png');
  const { data, info } = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let left = info.width, top = info.height, right = -1, bottom = -1;
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
    if (data[(y * info.width + x) * 4 + 3] < 16) continue;
    left = Math.min(left, x); right = Math.max(right, x);
    top = Math.min(top, y); bottom = Math.max(bottom, y);
  }
  if (right < left || bottom < top) throw new Error('No visible sprite found');
  const crop = { left, top, width: right - left + 1, height: bottom - top + 1 };
  for (const density of [1, 2, 3]) {
    const height = 170 * density;
    const sprite = await sharp(source).extract(crop).resize({ height }).png().toBuffer();
    const meta = await sharp(sprite).metadata();
    if (meta.width > 128 * density) throw new Error('Sprite exceeds player canvas');
    const png = await sharp({ create: { width: 128 * density, height: 192 * density, channels: 4, background: '#00000000' } })
      .composite([{ input: sprite, left: Math.round((128 * density - meta.width) / 2), top: 16 * density }]).png().toBuffer();
    fs.writeFileSync(path.join(destination, `sujin-front${density === 1 ? '' : `@${density}x`}.png`), png);
    if (density === 3) fs.writeFileSync(path.join(destination, 'sujin-front-display.png'), png);
  }
  fs.writeFileSync(path.join(destination, 'geometry.json'), JSON.stringify({ crop, canvas: [128, 192], pivot: [64, 186], renderedHeight: 170, alphaPreserved: true }, null, 2) + '\n');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
