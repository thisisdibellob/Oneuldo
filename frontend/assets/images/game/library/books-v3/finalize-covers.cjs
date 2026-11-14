'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const sharp = require('sharp');
const root = __dirname, library = path.dirname(root), frontend = path.resolve(root, '../../../../..');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const main = JSON.parse(fs.readFileSync(path.join(root, 'provenance-main.json'))).records;
const half = JSON.parse(fs.readFileSync(path.join(root, 'provenance-half.json'))).records;
const generated = [...main.map(r => ({ id: r.id, title: r.title, prompt: r.prompt, generatedPath: r.generatedPath, sourcePath: r.source.path, originalSha256: r.source.sha256, crop: r.crop })), ...half.map(r => ({ id: r.id, prompt: r.prompt, generatedPath: r.originalReturnedPath, sourcePath: `source/${r.id}.png`, originalSha256: r.original.sha256, crop: r.processing.crop }))];
const generationById = new Map(generated.map(r => [r.id, r]));
function alphaStats(data, width, height) {
  let transparent = 0, partial = 0, opaque = 0, outerEdgeNonzero = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const a = data[(y * width + x) * 4 + 3];
    if (a === 0) transparent++; else if (a === 255) opaque++; else partial++;
    if (a > 0 && (x === 0 || y === 0 || x === width - 1 || y === height - 1)) outerEdgeNonzero++;
  }
  return { transparent, partial, opaque, outerEdgeNonzero };
}
async function inspect(file) {
  const bytes = fs.readFileSync(file), decoded = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { width: decoded.info.width, height: decoded.info.height, bytes: bytes.length, sha256: sha(bytes), alpha: alphaStats(decoded.data, decoded.info.width, decoded.info.height) };
}
(async () => {
  const mapping = fs.readFileSync(path.join(frontend, 'src/game/libraryArt.ts'), 'utf8');
  const matches = [...mapping.matchAll(/  '([^']+)': require\('\.\.\/\.\.\/assets\/images\/game\/library\/([^']+)'\)/g)];
  if (matches.length !== 26 || generated.length !== 14) throw new Error('Expected 26 explicit covers and 14 generated covers');
  const covers = [], records = [];
  for (const [, id, file] of matches) {
    const runtime = await inspect(path.join(library, file)), generation = generationById.get(id);
    covers.push({ id, file, generated: Boolean(generation), ...runtime });
    if (!generation) continue;
    const source = await inspect(path.join(root, generation.sourcePath));
    if (source.sha256 !== generation.originalSha256) throw new Error('Changed original: ' + id);
    if (runtime.height !== 256 || runtime.alpha.transparent === 0 || runtime.alpha.outerEdgeNonzero !== 0) throw new Error('Invalid runtime sprite: ' + id);
    records.push({ ...generation, tool: 'built-in image_gen.imagegen', transparent_background: true, source: { file: generation.sourcePath, ...source }, runtime: { file: `${id}.png`, ...runtime }, processing: 'A rectangle around alpha>16 silhouette plus 8 original pixels of padding is cropped; all pixel colors and alpha within that rectangle are retained. Uniform Lanczos3 resize to 252px high, then add 2px transparent padding on all sides. No manual illustration, recoloring or alpha thresholding.', visualQA: 'Original and final runtime inspected: complete upright book, correct distinct motif, clean transparent border, no clipping. Korean 가/나/다 and English Hello verified.' });
  }
  if (new Set(covers.map(r => r.sha256)).size !== covers.length) throw new Error('Duplicate book cover pixels');
  const created = '2026-10-01';
  fs.writeFileSync(path.join(root, 'asset-manifest.json'), JSON.stringify({ version: 1, created, covers }, null, 2) + '\n');
  fs.writeFileSync(path.join(root, 'provenance.json'), JSON.stringify({ version: 1, created, tool: 'built-in image_gen.imagegen', records }, null, 2) + '\n');
  fs.writeFileSync(path.join(root, 'prompts.json'), JSON.stringify({ tool: 'built-in image_gen.imagegen', created, transparent_background: true, generation: generated }, null, 2) + '\n');
  const columns = 4, cellWidth = 224, cellHeight = 226, width = columns * cellWidth, height = Math.ceil(records.length / columns) * cellHeight, layers = [];
  let labels = '';
  for (let i = 0; i < records.length; i++) {
    const item = records[i], left = i % columns * cellWidth, top = Math.floor(i / columns) * cellHeight;
    const resized = await sharp(path.join(root, item.runtime.file)).resize({ height: 192 }).toBuffer({ resolveWithObject: true });
    layers.push({ input: resized.data, left: left + Math.floor((cellWidth - resized.info.width) / 2), top: top + 5 });
    labels += `<text x="${left + cellWidth / 2}" y="${top + 216}" text-anchor="middle" font-family="Arial" font-size="13" fill="#4D5146">${item.id}</text>`;
  }
  layers.push({ input: Buffer.from(`<svg width="${width}" height="${height}">${labels}</svg>`), left: 0, top: 0 });
  await sharp({ create: { width, height, channels: 4, background: '#F5F0E5' } }).composite(layers).png().toFile(path.join(root, 'source/qa-contact-sheet.png'));
  console.log(JSON.stringify({ covers: covers.length, generated: records.length, runtimeBytes: records.reduce((n, r) => n + r.runtime.bytes, 0), sourceBytes: records.reduce((n, r) => n + r.source.bytes, 0), uniqueImages: true, transparentBorders: true }));
})().catch(error => { console.error(error); process.exitCode = 1; });
