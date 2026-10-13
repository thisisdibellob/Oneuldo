'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const sharp = require('sharp');
const root = __dirname;
const prompts = JSON.parse(fs.readFileSync(path.join(root, 'prompts-main.json'), 'utf8'));
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function alphaInfo(data, width, height, boundsThreshold = 0) {
  let left = width, top = height, right = -1, bottom = -1, transparent = 0, partial = 0, opaque = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const alpha = data[(y * width + x) * 4 + 3];
    if (alpha === 0) transparent++; else {
      if (alpha === 255) opaque++; else partial++;
      if (alpha > boundsThreshold) { left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y); }
    }
  }
  return { transparent, partial, opaque, bounds: { left, top, width: right - left + 1, height: bottom - top + 1 } };
}
(async () => {
  fs.mkdirSync(path.join(root, 'source'), { recursive: true });
  const records = [];
  for (const entry of prompts.entries) {
    const sourcePath = path.join(root, entry.source), runtimePath = path.join(root, entry.runtime);
    if (!fs.existsSync(sourcePath)) fs.copyFileSync(entry.generatedPath, sourcePath, fs.constants.COPYFILE_EXCL);
    const source = fs.readFileSync(sourcePath), decoded = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const alpha = alphaInfo(decoded.data, decoded.info.width, decoded.info.height);
    if (alpha.transparent === 0 || alpha.opaque === 0) throw new Error('Missing transparent book silhouette: ' + entry.id);
    const visible = alphaInfo(decoded.data, decoded.info.width, decoded.info.height, 16).bounds;
    const crop = { left: Math.max(0, visible.left - 8), top: Math.max(0, visible.top - 8), width: 0, height: 0 };
    crop.width = Math.min(decoded.info.width, visible.left + visible.width + 8) - crop.left;
    crop.height = Math.min(decoded.info.height, visible.top + visible.height + 8) - crop.top;
    await sharp(source).extract(crop).resize({ height: 252, kernel: 'lanczos3' })
      .extend({ top: 2, bottom: 2, left: 2, right: 2, background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png({ compressionLevel: 9, palette: false }).toFile(runtimePath);
    const runtime = fs.readFileSync(runtimePath), output = await sharp(runtime).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    records.push({ ...entry, tool: prompts.tool, transparent_background: true, source: { path: entry.source, sha256: sha(source), bytes: source.length, width: decoded.info.width, height: decoded.info.height, alpha }, crop, runtime: { path: entry.runtime, sha256: sha(runtime), bytes: runtime.length, width: output.info.width, height: output.info.height, alpha: alphaInfo(output.data, output.info.width, output.info.height) }, processing: 'Find visible book bounds using alpha>16 and add 8 source pixels of padding; crop rectangle only, preserving all original alpha inside it. Resize uniformly with Lanczos3 to 252px height, add 2px transparent padding. No painting, recoloring, compositing or per-pixel alpha thresholding.' });
  }
  fs.writeFileSync(path.join(root, 'provenance-main.json'), JSON.stringify({ tool: prompts.tool, created: prompts.created, records }, null, 2) + '\n');
  console.log(JSON.stringify(records.map(r => ({ id: r.id, width: r.runtime.width, height: r.runtime.height, bytes: r.runtime.bytes, alpha: r.runtime.alpha.transparent > 0 }))));
})().catch(error => { console.error(error); process.exitCode = 1; });
