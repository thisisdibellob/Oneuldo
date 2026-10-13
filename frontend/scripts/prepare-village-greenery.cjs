// Deterministic import only: alpha extraction, transparent-margin crop and runtime downscale.
// Creative sprite artwork is generated with built-in image_gen; prompts live next to the assets.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const fromExpo = createRequire(require.resolve('@expo/image-utils', {
  paths: [path.dirname(require.resolve('expo/package.json'))],
}));
const Jimp = fromExpo('jimp-compact');
const out = path.resolve(__dirname, '../assets/images/game/environment/village/cozy-v2');

async function prepare(id, source, size) {
  const image = await Jimp.read(path.join(out, 'source', source));
  const { width, height, data } = image.bitmap;
  if (source.endsWith('-magenta.png')) {
    // No sprite colors contain saturated magenta. Recover only the separation background/edge.
    for (let offset = 0; offset < data.length; offset += 4) {
      const excess = Math.min(data[offset], data[offset + 2]) - data[offset + 1];
      if (excess <= 16) continue;
      const coverage = 1 - Math.min(1, (excess - 16) / 54);
      data[offset + 3] = Math.round(data[offset + 3] * coverage);
      data[offset] = Math.max(0, data[offset] - excess);
      data[offset + 2] = Math.max(0, data[offset + 2] - excess);
      if (!data[offset + 3]) data[offset] = data[offset + 1] = data[offset + 2] = 0;
    }
  }
  let clear = 0, left = width, right = -1, top = height, bottom = -1;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const alpha = data[(y * width + x) * 4 + 3];
    if (!alpha) clear++;
    if (alpha < 8) continue;
    left = Math.min(left, x); right = Math.max(right, x);
    top = Math.min(top, y); bottom = Math.max(bottom, y);
  }
  assert(clear > width * height * 0.25, `${id}: expected real transparent background`);
  assert(left > 1 && top > 1 && right < width - 2 && bottom < height - 2,
    `${id}: sprite must not be clipped`);
  const sprite = image.crop(left - 2, top - 2, right - left + 5, bottom - top + 5);
  await sprite.clone().writeAsync(path.join(out, `${id}-full.png`));
  const runtime = sprite.clone().resize(size.width || Jimp.AUTO, size.height || Jimp.AUTO, Jimp.RESIZE_BICUBIC);
  await runtime.writeAsync(path.join(out, `${id}.png`));
  return { id, source: [width, height], sourceBounds: [left, top, right, bottom],
    transparentFraction: clear / (width * height),
    runtime: [runtime.bitmap.width, runtime.bitmap.height],
    footAnchor: [0.5, 1] };
}

(async () => {
  const geometry = [];
  geometry.push(await prepare('tree', 'tree.png', { height: 320 }));
  geometry.push(await prepare('flowerbed', 'flowerbed-magenta.png', { width: 320 }));
  geometry.push(await prepare('shrub', 'shrub.png', { width: 256 }));
  geometry.push(await prepare('bench', 'bench.png', { width: 320 }));
  geometry.push(await prepare('streetlamp', 'streetlamp-magenta.png', { height: 256 }));
  fs.writeFileSync(path.join(out, 'geometry.json'), JSON.stringify(geometry, null, 2) + '\n');
  console.log(JSON.stringify(geometry, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
