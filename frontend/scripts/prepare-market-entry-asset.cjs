// Build-time sizing only: keep the Figma original; preserve aspect, alpha and artwork.
const fs = require('node:fs');
const path = require('node:path');
const sharp = require(process.env.MARKET_ASSET_SHARP_MODULE || 'sharp');
const directory = path.resolve(__dirname, '../assets/images/game/market/entry');
async function main() {
  const input = path.join(directory, 'shopping-cart.png');
  const output = path.join(directory, 'shopping-cart-runtime.png');
  // The 215×229dp cover slot needs about 645×862 physical pixels at 3× density.
  await sharp(input).resize({ height: 960, withoutEnlargement: true })
    .png({ compressionLevel: 9, palette: false }).toFile(output);
  const metadata = await sharp(output).metadata();
  if (!metadata.hasAlpha || metadata.height !== 960) throw new Error('Invalid runtime cart');
  console.log(JSON.stringify({ originalBytes: fs.statSync(input).size, runtimeBytes: fs.statSync(output).size,
    width: metadata.width, height: metadata.height, alpha: metadata.hasAlpha }));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
