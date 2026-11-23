// Package image_gen edits: trim transparent margins, uniformly downscale, align feet.
// Never repaint or stretch the character. Existing v1 art remains intact.
// Usage: node scripts/prepare-market-chibi-people.cjs ../output/.../generation-manifest.json
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const Jimp = require('jimp-compact');
const root = path.resolve(__dirname, '..');
const manifestPath = path.resolve(process.argv[2]);
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const reportDir = path.dirname(manifestPath);
const rawDir = path.join(reportDir, 'source-raw');
const outputDir = path.join(root, 'assets/images/game/market/people');
const WIDTH = 256, HEIGHT = 384, VISIBLE_HEIGHT = 344;
function bounds(image, threshold = 32) {
  let left = image.bitmap.width, top = image.bitmap.height, right = -1, bottom = -1;
  image.scan(0, 0, image.bitmap.width, image.bitmap.height, (x, y, i) => {
    if (image.bitmap.data[i + 3] >= threshold) {
      left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y);
    }
  });
  assert(right >= left && bottom >= top, 'Missing opaque character');
  return { left, top, width: right - left + 1, height: bottom - top + 1 };
}
(async () => {
  fs.mkdirSync(outputDir, { recursive: true }); fs.mkdirSync(rawDir, { recursive: true });
  assert(manifest.entries.length === 16 && new Set(manifest.entries.map(e => e.id)).size === 16);
  const results = [];
  const sheet = new Jimp(256 * 5, 420 * 4, '#F7F5ED');
  for (let i = 0; i < manifest.entries.length; i++) {
    const entry = manifest.entries[i];
    const original = await Jimp.read(entry.source);
    assert(original.getPixelColor(0, 0) % 256 === 0, entry.id + ' must have alpha');
    fs.copyFileSync(entry.source, path.join(rawDir, entry.id + '-generated.png'));
    const b = bounds(original);
    const character = original.clone().crop(b.left, b.top, b.width, b.height)
      .resize(Jimp.AUTO, VISIBLE_HEIGHT, Jimp.RESIZE_BICUBIC);
    assert(character.bitmap.width <= WIDTH - 8, entry.id + ' exceeds frame width');
    const sprite = new Jimp(WIDTH, HEIGHT, 0x00000000);
    sprite.composite(character, Math.round((WIDTH - character.bitmap.width) / 2), HEIGHT - VISIBLE_HEIGHT);
    const file = entry.id + '-chibi-v2.png';
    await sprite.writeAsync(path.join(outputDir, file));
    const finalBounds = bounds(sprite);
    assert(finalBounds.top >= 38 && finalBounds.top <= 42 && finalBounds.top + finalBounds.height >= 382);
    const child = entry.id.includes('-child-');
    const preview = sprite.clone().resize(Jimp.AUTO, child ? 292 : 384);
    const x = (i % 4 + 1) * 256 + Math.round((256 - preview.bitmap.width) / 2);
    sheet.composite(preview, x, Math.floor(i / 4) * 420 + 400 - preview.bitmap.height);
    results.push({ id: entry.id, file, width: WIDTH, height: HEIGHT, bounds: finalBounds,
      bytes: fs.statSync(path.join(outputDir, file)).size });
  }
  const player = await Jimp.read(path.join(root, 'assets/images/game/characters/player/chibi-user-v3/chr_player_chibi_front_idle_f00.png'));
  const playerPreview = player.clone().resize(256, 384);
  for (let row = 0; row < 4; row++) sheet.composite(playerPreview, 0, row * 420 + 400 - 384);
  await sheet.writeAsync(path.join(reportDir, 'player-npc-style-comparison.png'));
  fs.writeFileSync(path.join(reportDir, 'runtime-art-report.json'), JSON.stringify(results, null, 2));
  console.log(JSON.stringify({ count: results.length, runtimeBytes: results.reduce((n, r) => n + r.bytes, 0), comparison: 'player-npc-style-comparison.png' }));
})().catch(error => { console.error(error); process.exit(1); });
