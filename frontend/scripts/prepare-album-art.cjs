// Package generated postcard art for the small game-phone album. No drawing edits.
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');
const root = path.resolve(__dirname, '../assets/images/game/album/v1');
(async () => {
  for (const name of ['library', 'bus', 'shopping']) {
    const output = path.join(root, name + '.runtime.jpg');
    await sharp(path.join(root, name + '.png')).resize({ width: 640, withoutEnlargement: true }).jpeg({ quality: 88, mozjpeg: true }).toFile(output);
    console.log(JSON.stringify({ name, bytes: fs.statSync(output).size }));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
