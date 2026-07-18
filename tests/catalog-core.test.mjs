import assert from 'node:assert/strict';
import test from 'node:test';

import {
  addProductToCatalog,
  renderNoScriptCatalog,
  renderStaticProductPage,
  validateCatalog
} from '../scripts/catalog-core.mjs';

const baseCatalog = {
  categories: [
    {
      id: 'yuanxing_dizuo',
      name: '圆形底座',
      products: [{ id: 'ziguangtan_tengtiao', name: '紫光檀藤条/回纹圆底座' }]
    }
  ]
};

test('adds a product without mutating the existing catalog', () => {
  const updatedCatalog = addProductToCatalog(baseCatalog, {
    categoryId: 'yuanxing_dizuo',
    product: { id: 'xinyue', name: '新月圆底座' }
  });

  assert.equal(baseCatalog.categories[0].products.length, 1);
  assert.deepEqual(updatedCatalog.categories[0].products, [
    { id: 'xinyue', name: '新月圆底座' },
    { id: 'ziguangtan_tengtiao', name: '紫光檀藤条/回纹圆底座' }
  ]);
});

test('adds a new category only when it has a display name', () => {
  const updatedCatalog = addProductToCatalog(baseCatalog, {
    categoryId: 'fangxing_jijia',
    categoryName: '方形几架',
    product: { id: 'huali', name: '花梨木几架' }
  });

  assert.deepEqual(updatedCatalog.categories[0].id, 'fangxing_jijia');
  assert.throws(
    () => addProductToCatalog(baseCatalog, {
      categoryId: 'fangxing_jijia',
      product: { id: 'huali', name: '花梨木几架' }
    }),
    /category name/i
  );
});

test('rejects unsafe IDs and duplicate product directories', () => {
  assert.throws(
    () => addProductToCatalog(baseCatalog, {
      categoryId: '../outside',
      product: { id: 'xinyue', name: '新月圆底座' }
    }),
    /Invalid category id/
  );
  assert.throws(
    () => addProductToCatalog(baseCatalog, {
      categoryId: 'yuanxing_dizuo',
      product: { id: 'ziguangtan_tengtiao', name: '重复商品' }
    }),
    /already exists/
  );
});

test('validates all products in the catalog use safe IDs and visible names', () => {
  assert.deepEqual(validateCatalog(baseCatalog), baseCatalog);
  assert.throws(
    () => validateCatalog({ categories: [{ id: 'valid', name: '', products: [] }] }),
    /category name/i
  );
});

test('generates escaped static pages and a complete no-script catalog', () => {
  const product = {
    name: '测试 <商品>',
    price: '¥ 88',
    description: '描述 & 介绍'
  };
  const productPage = renderStaticProductPage({
    categoryId: 'yuanxing_dizuo',
    productId: 'xinyue',
    product
  });
  const noScriptCatalog = renderNoScriptCatalog(addProductToCatalog(baseCatalog, {
    categoryId: 'yuanxing_dizuo',
    product: { id: 'xinyue', name: '测试 <商品>' }
  }));

  assert.match(productPage, /测试 &lt;商品&gt;/);
  assert.match(productPage, /描述 &amp; 介绍/);
  assert.match(productPage, /href="\.\.\/\.\.\/\.\.\/\?product=yuanxing_dizuo\/xinyue"/);
  assert.match(noScriptCatalog, /\.\/products\/yuanxing_dizuo\/xinyue\//);
  assert.doesNotMatch(noScriptCatalog, /测试 <商品>/);
});
