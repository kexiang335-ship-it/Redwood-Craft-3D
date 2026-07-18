import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import test from 'node:test';

import { resolveStaticFile } from '../scripts/serve.mjs';

const rootDirectory = resolve('.');

test('serves a product directory through its static index.html', () => {
  assert.equal(
    resolveStaticFile(rootDirectory, '/products/yuanxing_dizuo/ziguangtan_tengtiao/'),
    resolve(rootDirectory, 'products/yuanxing_dizuo/ziguangtan_tengtiao/index.html')
  );
});

test('rejects paths outside the static site root', () => {
  assert.equal(resolveStaticFile(rootDirectory, '/../package.json'), null);
});
