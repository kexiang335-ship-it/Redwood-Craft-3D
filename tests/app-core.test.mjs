import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createProductLoader,
  deferProductLoadUntilViewerIsReady,
  getProductPaths,
  normalizeCatalog,
  shouldLoadAnalytics
} from '../app-core.js';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

test('builds product paths from the selected catalog identifiers', () => {
  assert.deepEqual(
    getProductPaths('yuanxing_dizuo', 'ziguangtan_tengtiao'),
    {
      infoUrl: './products/yuanxing_dizuo/ziguangtan_tengtiao/info.json',
      modelUrl: './products/yuanxing_dizuo/ziguangtan_tengtiao/model.glb'
    }
  );
});

test('rejects unsafe product path segments', () => {
  assert.throws(
    () => getProductPaths('yuanxing_dizuo', '../private-file'),
    /Invalid product folder/
  );
});

test('only commits the newest product response when selections race', async () => {
  const first = deferred();
  const second = deferred();
  const committedProducts = [];
  const committedModels = [];
  let requestCount = 0;

  const loadProduct = createProductLoader({
    fetchProduct: () => {
      requestCount += 1;
      return requestCount === 1 ? first.promise : second.promise;
    },
    onModelLoading: (url) => committedModels.push(url),
    onProductReady: (product) => committedProducts.push(product),
    onProductError: assert.fail
  });

  const firstLoad = loadProduct('yuanxing_dizuo', 'ziguangtan_tengtiao');
  const secondLoad = loadProduct('fangxing_dizuo', 'hualimu_huiwen');

  second.resolve({ name: 'B', price: '¥60', description: 'second' });
  await secondLoad;
  first.resolve({ name: 'A', price: '¥58', description: 'first' });
  await firstLoad;

  assert.deepEqual(committedProducts, [{ name: 'B', price: '¥60', description: 'second' }]);
  assert.equal(committedModels.length, 2);
  assert.match(committedModels[1], /hualimu_huiwen\/model\.glb$/);
});

test('reports the newest product request failure without replacing the model selection', async () => {
  const failures = [];
  const models = [];
  const loadProduct = createProductLoader({
    fetchProduct: async () => {
      throw new Error('network unavailable');
    },
    onModelLoading: (url) => models.push(url),
    onProductReady: assert.fail,
    onProductError: (message) => failures.push(message)
  });

  await loadProduct('yuanxing_dizuo', 'ziguangtan_tengtiao');

  assert.equal(models.length, 1);
  assert.deepEqual(failures, ['产品信息加载失败，请稍后重试。']);
});

test('waits for the 3D viewer custom element before selecting a model', async () => {
  const viewerReady = deferred();
  const selections = [];
  const loadWhenViewerIsReady = deferProductLoadUntilViewerIsReady(
    viewerReady.promise,
    (categoryFolder, productFolder) => selections.push(`${categoryFolder}/${productFolder}`)
  );

  const pendingSelection = loadWhenViewerIsReady('fangxing_dizuo', 'hualimu_huiwen');
  assert.deepEqual(selections, []);

  viewerReady.resolve();
  await pendingSelection;
  assert.deepEqual(selections, ['fangxing_dizuo/hualimu_huiwen']);
});

test('loads analytics only after explicit acceptance', () => {
  assert.equal(shouldLoadAnalytics('accepted'), true);
  assert.equal(shouldLoadAnalytics('rejected'), false);
  assert.equal(shouldLoadAnalytics(null), false);
});

test('normalizes a catalog before it is rendered in the product menu', () => {
  assert.deepEqual(normalizeCatalog({
    categories: [{
      id: 'yuanxing_dizuo',
      name: '圆形底座',
      products: [{ id: 'xinyue', name: '新月圆底座' }]
    }]
  }), [{
    categoryFolder: 'yuanxing_dizuo',
    categoryName: '圆形底座',
    items: [{ folder: 'xinyue', name: '新月圆底座' }]
  }]);

  assert.throws(
    () => normalizeCatalog({ categories: [{ id: '../unsafe', name: '错误', products: [] }] }),
    /Invalid category folder/
  );
});
