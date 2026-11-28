import fs from 'node:fs';
import path from 'node:path';
import { MARKET_CUSTOMER_APPEARANCES, MARKET_EMPLOYEE_APPEARANCES } from '../src/game/marketPeople';
const { PNG } = require('pngjs');

test('all 16 SD NPC assets retain transparent margins and a common floor anchor without clipped hair or shoes', () => {
  for (const variant of [...MARKET_EMPLOYEE_APPEARANCES, ...MARKET_CUSTOMER_APPEARANCES]) {
    const file = path.join(__dirname, '../assets/images/game/market/people', variant.id + '-chibi-v2.png');
    const png = PNG.sync.read(fs.readFileSync(file));
    expect([png.width, png.height]).toEqual([256, 384]);
    expect(png.data[3]).toBe(0);
    expect(png.data[(png.width - 1) * 4 + 3]).toBe(0);
    let top = png.height, bottom = 0, left = png.width, right = 0;
    for (let y = 0; y < png.height; y++) for (let x = 0; x < png.width; x++) {
      if (png.data[(y * png.width + x) * 4 + 3] < 32) continue;
      top = Math.min(top, y); bottom = Math.max(bottom, y); left = Math.min(left, x); right = Math.max(right, x);
    }
    expect(top).toBeGreaterThanOrEqual(38);
    expect(top).toBeLessThanOrEqual(42);
    expect(bottom).toBeGreaterThanOrEqual(382);
    expect(left).toBeGreaterThan(3);
    expect(right).toBeLessThan(252);
    expect(fs.existsSync(file.replace('-chibi-v2.png', '-v1.png'))).toBe(true);
  }
});
