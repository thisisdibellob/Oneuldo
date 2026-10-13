// Import image_gen chroma-key turnarounds without repainting the character art.
// Run from frontend: node scripts/prepare-village-friends.cjs <minsu.png> <jiyoung.png>
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const fromExpo = createRequire(require.resolve('@expo/image-utils', {
  paths: [path.dirname(require.resolve('expo/package.json'))],
}));
const Jimp = fromExpo('jimp-compact');
const out = path.resolve(__dirname, '../assets/images/game/characters/village/chibi-v1');

async function importCharacter(id, source) {
  assert(source, 'Provide both generated chroma-key sheets.');
  const sheet = await Jimp.read(source);
  const { width, height, data } = sheet.bitmap;
  let keyed = 0;
  for (let i = 0; i < data.length; i += 4) {
    const excess = data[i + 1] - Math.max(data[i], data[i + 2]);
    if (excess <= 12) continue;
    const alpha = 1 - Math.min(1, (excess - 12) / 33);
    data[i + 3] = Math.round(data[i + 3] * alpha);
    data[i + 1] = Math.min(data[i + 1], Math.max(data[i], data[i + 2]));
    if (!data[i + 3]) { data[i] = data[i + 1] = data[i + 2] = 0; keyed++; }
  }
  assert(keyed > width * height * 0.3, 'Expected a uniform green separation background.');
  await sheet.writeAsync(path.join(out, `${id}-turnaround.png`));

  // Only the leftmost figure is placed in the world. Keep all five views above.
  let left = width, right = -1, top = height, bottom = -1;
  const firstViewBoundary = Math.floor(width * 0.21);
  for (let y = 0; y < height; y++) for (let x = 0; x < firstViewBoundary; x++) {
    if (data[(y * width + x) * 4 + 3] < 128) continue;
    left = Math.min(left, x); right = Math.max(right, x);
    top = Math.min(top, y); bottom = Math.max(bottom, y);
  }
  assert(left > 0 && top > 0 && bottom < height - 1 && right < firstViewBoundary - 1,
    'Front view must be fully inside its own cell.');
  const body = sheet.clone().crop(left - 1, top - 1, right - left + 3, bottom - top + 3);
  const renderedHeight = 170;
  for (const density of [1, 2, 3]) {
    // Player idle varies from 170–172px. Both friends use its lower bound, with feet fixed.
    const resized = body.clone().resize(Jimp.AUTO, renderedHeight * density, Jimp.RESIZE_BICUBIC);
    assert(resized.bitmap.width < 128 * density, 'Figure too wide for the player canvas.');
    const canvas = new Jimp(128 * density, 192 * density, 0x00000000);
    canvas.composite(resized, Math.round((128 * density - resized.bitmap.width) / 2), (186 - renderedHeight) * density);
    await canvas.writeAsync(path.join(out, `${id}-front${density > 1 ? `@${density}x` : ''}.png`));
    // Web's static image import can resolve to 1x despite a zoomed game canvas.
    // Keep an explicit high-resolution source; ModularCharacter still sets world size.
    if (density === 3) await canvas.writeAsync(path.join(out, `${id}-front-display.png`));
  }
  return { id, sheet: [width, height], frontSourceBounds: [left, top, right, bottom],
    canvas: [128, 192], pivot: [64, 186], renderedHeight };
}

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const reports = [];
  for (const [index, id] of ['minsu', 'jiyoung'].entries()) reports.push(await importCharacter(id, process.argv[index + 2]));
  fs.writeFileSync(path.join(out, 'geometry.json'), JSON.stringify(reports, null, 2) + '\n');
  console.log(JSON.stringify(reports, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
