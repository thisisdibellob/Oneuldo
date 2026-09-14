// Package an image_gen interior variation with the existing fixture's alpha and
// antialiased outline. No app dependency or network call is introduced.
// node scripts/prepare-market-shelf-variant.cjs original.png generated.png output.png
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const modules = path.resolve(__dirname, '../node_modules/.pnpm');
const pngPackage = fs.readdirSync(modules).find(name => name.startsWith('pngjs@'));
assert(pngPackage, 'An installed pngjs build dependency is required.');
const { PNG } = require(path.join(modules, pngPackage, 'node_modules/pngjs'));
const [originalPath, generatedPath, outputPath] = process.argv.slice(2);
assert(originalPath && generatedPath && outputPath, 'Expected original, generated and output PNG paths.');
assert.notEqual(path.resolve(originalPath), path.resolve(outputPath), 'Keep the original asset.');
assert.notEqual(path.resolve(generatedPath), path.resolve(outputPath), 'Keep the image_gen output.');

const original = PNG.sync.read(fs.readFileSync(originalPath));
const generated = PNG.sync.read(fs.readFileSync(generatedPath));
const { width, height } = original;
assert.equal(generated.width, width, 'The source framing must match.');
assert.equal(generated.height, height, 'The source framing must match.');
const output = new PNG({ width, height });
original.data.copy(output.data);

// Only use generated colors safely inside the original opaque silhouette.
// Retain the original 6px outline and all shadow/transparent pixels so a model-
// rendered checkerboard can never become the fixture's exterior background.
const stride = width + 1;
const nonSolid = new Uint32Array(stride * (height + 1));
for (let y = 0; y < height; y++) {
  let row = 0;
  for (let x = 0; x < width; x++) {
    row += original.data[(y * width + x) * 4 + 3] < 250 ? 1 : 0;
    nonSolid[(y + 1) * stride + x + 1] = nonSolid[y * stride + x + 1] + row;
  }
}
let changedPixels = 0, transparentPixels = 0;
const edge = 6;
for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    const index = (y * width + x) * 4;
    if (original.data[index + 3] === 0) transparentPixels++;
    if (x < edge || y < edge || x >= width - edge || y >= height - edge) continue;
    const x0 = x - edge, x1 = x + edge + 1, y0 = y - edge, y1 = y + edge + 1;
    const count = nonSolid[y1 * stride + x1] - nonSolid[y0 * stride + x1]
      - nonSolid[y1 * stride + x0] + nonSolid[y0 * stride + x0];
    if (count !== 0) continue;
    generated.data.copy(output.data, index, index, index + 3);
    changedPixels++;
  }
}
assert(transparentPixels > 10000, 'The existing silhouette must contain real transparency.');
assert(changedPixels > width * height * 0.2, 'The generated interior must be visible.');
fs.writeFileSync(outputPath, PNG.sync.write(output, { colorType: 6, inputColorType: 6, deflateLevel: 9 }));
const saved = PNG.sync.read(fs.readFileSync(outputPath));
for (let index = 3; index < original.data.length; index += 4) {
  assert.equal(saved.data[index], original.data[index], 'Preserve the source alpha exactly.');
}
console.log(JSON.stringify({ outputPath, width, height, transparentPixels, generatedInteriorPixels: changedPixels, alphaMatchesOriginal: true }));
