import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { importProduct } from '../scripts/add-product.mjs';

function writeMinimalGlb(path) {
  const json = Buffer.from(JSON.stringify({ asset: { version: '2.0' } }).padEnd(64, ' '));
  const header = Buffer.alloc(20);
  header.write('glTF');
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(20 + json.length, 8);
  header.writeUInt32LE(json.length, 12);
  header.writeUInt32LE(0x4e4f534a, 16);
  writeFileSync(path, Buffer.concat([header, json]));
}

function createSiteFixture() {
  const siteRoot = mkdtempSync(join(tmpdir(), 'redwood-import-site-'));
  mkdirSync(join(siteRoot, 'products', 'yuanxing_dizuo'), { recursive: true });
  writeFileSync(join(siteRoot, 'products', 'catalog.json'), JSON.stringify({
    categories: [{ id: 'yuanxing_dizuo', name: '圆形底座', products: [] }]
  }));
  writeFileSync(join(siteRoot, 'index.html'), '<noscript><!-- catalog:begin --><!-- catalog:end --></noscript>');
  return siteRoot;
}

test('imports a product package without requiring edits to frontend files', () => {
  const siteRoot = createSiteFixture();
  const sourceDirectory = mkdtempSync(join(tmpdir(), 'redwood-product-package-'));
  writeMinimalGlb(join(sourceDirectory, 'model.glb'));
  writeFileSync(join(sourceDirectory, 'info.json'), JSON.stringify({
    name: '新月圆底座',
    price: '¥ 88',
    description: '由导入器生成的商品页'
  }));

  const result = importProduct({
    siteRoot,
    sourceDirectory,
    categoryId: 'yuanxing_dizuo',
    productId: 'xinyue',
    runTests: false
  });

  const productDirectory = join(siteRoot, 'products', 'yuanxing_dizuo', 'xinyue');
  assert.equal(result.productPath, 'yuanxing_dizuo/xinyue');
  assert.ok(existsSync(join(productDirectory, 'model.glb')));
  assert.ok(existsSync(join(sourceDirectory, 'model.glb')));
  assert.match(readFileSync(join(siteRoot, 'products', 'catalog.json'), 'utf8'), /"xinyue"/);
  assert.match(readFileSync(join(siteRoot, 'index.html'), 'utf8'), /products\/yuanxing_dizuo\/xinyue/);
  assert.match(readFileSync(join(productDirectory, 'index.html'), 'utf8'), /新月圆底座/);
});

test('rejects an existing target without overwriting its files', () => {
  const siteRoot = createSiteFixture();
  const sourceDirectory = mkdtempSync(join(tmpdir(), 'redwood-product-package-'));
  writeMinimalGlb(join(sourceDirectory, 'model.glb'));
  writeFileSync(join(sourceDirectory, 'info.json'), JSON.stringify({
    name: '重复商品', price: '¥ 88', description: '不应覆盖'
  }));
  const productDirectory = join(siteRoot, 'products', 'yuanxing_dizuo', 'xinyue');
  mkdirSync(productDirectory);
  writeFileSync(join(productDirectory, 'sentinel.txt'), 'keep');

  assert.throws(
    () => importProduct({
      siteRoot,
      sourceDirectory,
      categoryId: 'yuanxing_dizuo',
      productId: 'xinyue',
      runTests: false
    }),
    /already exists/
  );
  assert.equal(readFileSync(join(productDirectory, 'sentinel.txt'), 'utf8'), 'keep');
});
