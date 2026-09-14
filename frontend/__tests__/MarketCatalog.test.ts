// Jest runs in Node; application types intentionally exclude Node globals.
const { createHash } = require('crypto');
const { readFileSync } = require('fs');
const { join } = require('path');
declare const __dirname: string;

import { getMarketProductImage, marketProductImages } from '../src/game/marketProductImages';
import { marketCatalogProducts } from '../src/game/marketContent';
import { getMarketProduct, marketCategories, marketProducts } from '../src/game/scenarios';

describe('환경 실험용 마트 상품 카탈로그', () => {
  it.each(marketCategories)('$label 진열대에 최소 24개의 서로 다른 상품을 제공한다', ({ id }) => {
    const products = marketProducts.filter(product => product.categoryId === id);
    expect(products.length).toBeGreaterThanOrEqual(24);
    expect(new Set(products.map(product => product.id)).size).toBe(products.length);
  });

  it('모든 상품 ID가 고유하고 가격·규격·부류·종류가 명시되어 있다', () => {
    expect(new Set(marketProducts.map(product => product.id)).size).toBe(marketProducts.length);
    for (const product of marketProducts) {
      expect(product.price).toBeGreaterThan(0);
      expect(Number.isInteger(product.price)).toBe(true);
      expect(product.detail).toBeTruthy();
      expect(product.familyId).toBeTruthy();
      expect(product.familyLabel).toBeTruthy();
      expect(product.variantLabel).toBeTruthy();
    }
  });

  it('모든 상품에 대응하는 이미지가 있으며 카탈로그에서 빠진 매핑도 없다', () => {
    for (const id of Object.keys(marketProductImages)) { expect(getMarketProduct(id)).toBeDefined(); expect(getMarketProductImage(id)).toBeDefined(); }
    // Original AI scenario variants without new art retain the shelf's text/icon fallback.
    for (const product of marketProducts.filter(p => !getMarketProductImage(p.id))) expect(marketCatalogProducts.some(p => p.id === product.id)).toBe(true);
    expect(getMarketProductImage('unknown-product')).toBeUndefined();
  });

  it('모든 상품 이미지가 서로 다른 실제 PNG 파일이고 최소 해상도를 충족한다', () => {
    const hashes = new Set<string>();
    for (const product of marketProducts.filter(p => getMarketProductImage(p.id))) {
      const file = readFileSync(join(__dirname, `../assets/images/game/market/products/product_${product.id}.png`));
      expect(file.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
      expect(file.readUInt32BE(16)).toBeGreaterThanOrEqual(256);
      expect(file.readUInt32BE(20)).toBeGreaterThanOrEqual(256);
      hashes.add(createHash('sha256').update(file).digest('hex'));
    }
    expect(hashes.size).toBe(Object.keys(marketProductImages).length);
  });

  it.each([
    ['milk', ['milk', 'low-fat-milk', 'chocolate-milk', 'strawberry-milk']],
    ['eggs', ['eggs', 'premium-eggs', 'king-eggs']],
    ['cola', ['cola', 'zero-cola']],
  ])('%s는 공통 부류와 서로 다른 세부 종류를 갖는다', (familyId, ids) => {
    const products = (ids as string[]).map(id => getMarketProduct(id)!);
    expect(products.every(product => product.familyId === familyId)).toBe(true);
    expect(new Set(products.map(product => product.variantLabel)).size).toBe(products.length);
  });

  it('기존 장보기 시나리오의 품목과 가격을 유지한다', () => {
    expect(getMarketProduct('milk')?.price).toBe(2200);
    expect(getMarketProduct('apple')?.price).toBe(1200);
    expect(getMarketProduct('curry')?.price).toBe(2800);
    expect(getMarketProduct('premium-eggs')?.price).toBe(5200);
  });

  it('생활용품 24종에 필수 품목과 구별 가능한 규격을 제공한다', () => {
    const household = marketProducts.filter(product => product.categoryId === 'household');
    expect(household).toHaveLength(24);
    expect(marketProducts.length).toBeGreaterThanOrEqual(120);
    expect(household.map(product => product.id)).toEqual(expect.arrayContaining([
      'striped-slippers', 'bathroom-slippers', 'aa-batteries', 'aaa-batteries',
      'usb-c-charger', 'lightning-charger', 'dish-soap', 'dish-sponge', 'cleaning-brush',
      'sticky-notes', 'black-ballpoint', 'packing-tape', 'transparent-tape', 'adhesive-bandages',
    ]));
    expect(getMarketProduct('aa-batteries')).toMatchObject({ familyId: 'batteries', familyLabel: '건전지', detail: 'AA · 4개입' });
    expect(getMarketProduct('aaa-batteries')).toMatchObject({ familyId: 'batteries', familyLabel: '건전지', detail: 'AAA · 4개입' });
    expect(getMarketProduct('usb-c-charger')?.detail).toContain('USB-C');
    expect(getMarketProduct('lightning-charger')?.detail).toContain('8핀');
    expect(getMarketProduct('black-ballpoint')?.price).toBeLessThanOrEqual(1000);
  });

  it.each([
    ['slippers', ['striped-slippers', 'striped-slippers-blue']],
    ['bathroom-slippers', ['bathroom-slippers', 'bathroom-slippers-pink']],
    ['batteries', ['aa-batteries', 'aaa-batteries', 'aa-batteries-8', 'aaa-batteries-8']],
    ['charger', ['usb-c-charger', 'lightning-charger', 'usb-c-charger-long']],
    ['dish-soap', ['dish-soap', 'dish-soap-refill']],
    ['dish-sponge', ['dish-sponge', 'soft-dish-sponge']],
    ['sticky-notes', ['sticky-notes', 'sticky-notes-pastel']],
    ['ballpoint', ['black-ballpoint', 'blue-ballpoint']],
    ['tape', ['packing-tape', 'transparent-tape']],
    ['bandages', ['adhesive-bandages', 'waterproof-bandages']],
  ])('생활용품 %s의 부류와 정확한 상품 조건을 구별할 수 있다', (familyId, ids) => {
    const products = (ids as string[]).map(id => getMarketProduct(id)!);
    expect(products.every(product => product.familyId === familyId)).toBe(true);
    expect(new Set(products.map(product => product.variantLabel)).size).toBe(products.length);
    expect(new Set(products.map(product => product.name)).size).toBe(products.length);
  });
});
