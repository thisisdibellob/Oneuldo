// Runtime packaging only: keep the generated canvas, alpha, art and floor anchors.
// Run with NODE_PATH pointing at a runtime with sharp installed.
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');
const root = path.resolve(__dirname, '../assets/images/game/market/interior/cozy-v1');
const entries = ['gondola-empty', 'fridge-empty', 'produce-empty', 'checkout'];
(async () => {
  for (const name of entries) {
    const input = path.join(root, name + '.png');
    if (!fs.existsSync(input)) continue;
    const source = await sharp(input).metadata();
    const width = name === 'checkout' ? 420 : 750;
    const output = path.join(root, name + '.runtime.png');
    await sharp(input).resize({ width, withoutEnlargement: true }).png({ compressionLevel: 9 }).toFile(output);
    console.log(JSON.stringify({ name, source: [source.width, source.height], width, bytes: fs.statSync(output).size }));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
