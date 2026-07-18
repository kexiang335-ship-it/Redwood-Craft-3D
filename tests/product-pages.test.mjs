import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const catalog = JSON.parse(readFileSync('products/catalog.json', 'utf8'));
const products = catalog.categories.flatMap((category) => category.products.map((product) => ({
  path: `products/${category.id}/${product.id}/index.html`,
  product: `${category.id}/${product.id}`,
  name: product.name
})));

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

for (const item of products) {
  test(`${item.path} provides product metadata without JavaScript`, () => {
    const html = readFileSync(item.path, 'utf8');
    assert.match(html, new RegExp(`<title>${escapeRegExp(item.name)} \\| 雨山红木</title>`));
    assert.match(html, /<meta property="og:type" content="product">/);
    assert.match(html, new RegExp(`content="${escapeRegExp(item.product)}"`));
    assert.match(html, new RegExp(`href="${escapeRegExp(`../../../?product=${item.product}`)}"`));
  });
}

test('the no-script catalogue links to every static product page', () => {
  const html = readFileSync('index.html', 'utf8');
  for (const item of products) {
    assert.match(html, new RegExp(`href="${escapeRegExp(`./products/${item.product}/`)}"`));
  }
});
