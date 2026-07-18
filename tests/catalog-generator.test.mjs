import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { generateCatalogArtifacts } from '../scripts/generate-catalog.mjs';

test('regenerates static pages and the no-script catalog from catalog.json', () => {
  const siteRoot = mkdtempSync(join(tmpdir(), 'redwood-catalog-test-'));
  mkdirSync(join(siteRoot, 'products', 'yuanxing_dizuo', 'xinyue'), { recursive: true });
  writeFileSync(join(siteRoot, 'products', 'catalog.json'), JSON.stringify({
    categories: [{
      id: 'yuanxing_dizuo',
      name: '圆形底座',
      products: [{ id: 'xinyue', name: '新月圆底座' }]
    }]
  }));
  writeFileSync(join(siteRoot, 'products', 'yuanxing_dizuo', 'xinyue', 'info.json'), JSON.stringify({
    name: '新月圆底座',
    price: '¥ 88',
    description: '测试介绍'
  }));
  writeFileSync(join(siteRoot, 'products', 'yuanxing_dizuo', 'xinyue', 'model.glb'), 'test model');
  writeFileSync(join(siteRoot, 'index.html'), '<noscript><!-- catalog:begin --><!-- catalog:end --></noscript>');

  const result = generateCatalogArtifacts(siteRoot);
  const productPage = readFileSync(join(siteRoot, 'products', 'yuanxing_dizuo', 'xinyue', 'index.html'), 'utf8');
  const indexHtml = readFileSync(join(siteRoot, 'index.html'), 'utf8');

  assert.deepEqual(result.generatedProducts, ['yuanxing_dizuo/xinyue']);
  assert.match(productPage, /<title>新月圆底座 \| 雨山红木<\/title>/);
  assert.match(indexHtml, /\.\/products\/yuanxing_dizuo\/xinyue\//);
});
