import { getLibraryBookArt, libraryBookArtById } from '../src/game/libraryArt';
import { LIBRARY_BOOKS } from '../src/game/librarySession';

const { readFileSync } = require('fs');
const { join } = require('path');
const { createHash } = require('crypto');
declare const __dirname: string;

type Cover = { id: string; file: string; generated: boolean; width: number; height: number; bytes: number; sha256: string; alpha: { transparent: number; outerEdgeNonzero: number } };
const { covers } = require('../assets/images/game/library/books-v3/asset-manifest.json') as { covers: Cover[] };
const { covers: additionsV4 } = require('../assets/images/game/library/v4/asset-manifest.json') as { covers: Cover[] };

it('gives every catalogue book its own explicit ID mapping and rejects missing art instead of recycling another cover', () => {
  const ids = LIBRARY_BOOKS.map(book => book.id).sort();
  expect(Object.keys(libraryBookArtById).sort()).toEqual(ids);
  const allCovers = [...covers, ...additionsV4];
  expect(allCovers.map(cover => cover.id).sort()).toEqual(ids);
  expect(new Set(allCovers.map(cover => cover.file)).size).toBe(ids.length);
  expect(new Set(allCovers.map(cover => cover.sha256)).size).toBe(ids.length);
  for (const book of [...LIBRARY_BOOKS].reverse()) expect(getLibraryBookArt(book.id)).toBeDefined();
  expect(() => getLibraryBookArt('unmapped-book')).toThrow('Missing library book cover: unmapped-book');
});

it('adds 26 individually extracted book covers with preserved transparent PNG edges', () => {
  expect(additionsV4).toHaveLength(26);
  for (const cover of additionsV4) {
    const png = readFileSync(join(__dirname, '../assets/images/game/library', cover.file));
    expect(png.readUInt32BE(16)).toBe(cover.width);
    expect(png.readUInt32BE(20)).toBe(cover.height);
    expect(cover.width / cover.height).toBeGreaterThan(0.6);
    expect(cover.width / cover.height).toBeLessThan(0.95);
    expect(png[25]).toBe(6);
    expect(createHash('sha256').update(png).digest('hex')).toBe(cover.sha256);
  }
});

it('ships the three new room props with transparent edges and bounded mobile texture sizes', () => {
  const { assets } = require('../assets/images/game/library/v5/asset-manifest.json') as { assets: (Omit<Cover, 'id'> & { name: string })[] };
  expect(assets.map(asset => asset.name).sort()).toEqual(['display', 'plants', 'window']);
  for (const asset of assets) {
    const png = readFileSync(join(__dirname, '../assets/images/game/library/v5', asset.file));
    expect(png.readUInt32BE(16)).toBe(asset.width);
    expect(png.readUInt32BE(20)).toBe(asset.height);
    expect(Math.max(asset.width, asset.height)).toBeLessThanOrEqual(640);
    expect(png[25]).toBe(6);
    expect(createHash('sha256').update(png).digest('hex')).toBe(asset.sha256);
    expect(asset.alpha.transparent).toBeGreaterThan(1000);
    expect(asset.alpha.outerEdgeNonzero).toBe(0);
  }
  expect(assets.reduce((bytes, asset) => bytes + asset.bytes, 0)).toBeLessThan(1000000);
});

it('keeps the paired connected bookcases at matching elevations and preserves transparent PNG edges', () => {
  const { assets } = require('../assets/images/game/library/v6/asset-manifest.json') as { assets: (Omit<Cover, 'id'> & { name: string })[] };
  expect(assets.map(asset => asset.name).sort()).toEqual(['island-arts', 'island-story', 'wall-left', 'wall-right']);
  for (const asset of assets) {
    const png = readFileSync(join(__dirname, '../assets/images/game/library/v6', asset.file));
    expect(png.readUInt32BE(16)).toBe(asset.width);
    expect(png.readUInt32BE(20)).toBe(asset.height);
    expect(png[25]).toBe(6);
    expect(createHash('sha256').update(png).digest('hex')).toBe(asset.sha256);
    expect(asset.alpha.transparent).toBeGreaterThan(1000);
    expect(asset.alpha.outerEdgeNonzero).toBe(0);
  }
  for (const prefix of ['wall-', 'island-']) {
    const pair = assets.filter(asset => asset.name.startsWith(prefix));
    expect(pair[0].width).toBe(pair[1].width);
    expect(pair[0].height).toBe(pair[1].height);
  }
  expect(assets.reduce((bytes, asset) => bytes + asset.bytes, 0)).toBeLessThan(2600000);
});

it('keeps the twelve existing book illustrations attached to their original IDs', () => {
  const originalIds = ['moon-mail', 'cloud-cat', 'little-train', 'our-neighbor', 'forest-leaves', 'sea-friends', 'night-stars', 'garden-bugs', 'easy-cooking', 'balcony-garden', 'tidy-room', 'healthy-day'];
  originalIds.forEach((id, index) => expect(covers.find(cover => cover.id === id)).toEqual(expect.objectContaining({
    generated: false, file: `book-${String(index + 1).padStart(2, '0')}.png`,
  })));
});

it('ships fourteen unique transparent 256px covers whose pixels match the reviewed manifest', () => {
  const additions = covers.filter(cover => cover.generated);
  expect(additions).toHaveLength(14);
  for (const cover of additions) {
    const png = readFileSync(join(__dirname, '../assets/images/game/library', cover.file));
    expect(png.subarray(1, 4).toString()).toBe('PNG');
    expect(png.readUInt32BE(16)).toBe(cover.width);
    expect(png.readUInt32BE(20)).toBe(256);
    expect(png[25]).toBe(6); // PNG RGBA preserves generated transparency.
    expect(png.length).toBe(cover.bytes);
    expect(createHash('sha256').update(png).digest('hex')).toBe(cover.sha256);
    expect(cover.alpha.transparent).toBeGreaterThan(0);
    expect(cover.alpha.outerEdgeNonzero).toBe(0);
  }
});
