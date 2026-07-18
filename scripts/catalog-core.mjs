const SAFE_ID = /^[a-z0-9_]+$/;
const MAX_NAME_LENGTH = 80;
const MAX_PRICE_LENGTH = 40;
const MAX_DESCRIPTION_LENGTH = 3000;

function assertSafeId(value, label) {
  if (typeof value !== 'string' || !SAFE_ID.test(value)) {
    throw new Error(`Invalid ${label}`);
  }
}

function assertVisibleText(value, label, maximumLength) {
  if (typeof value !== 'string' || !value.trim() || value.length > maximumLength) {
    throw new Error(`Invalid ${label}`);
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function sortedByName(items) {
  return [...items].sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'));
}

export function validateCatalog(catalog) {
  if (!catalog || typeof catalog !== 'object' || !Array.isArray(catalog.categories)) {
    throw new Error('Catalog must contain categories');
  }

  const categoryIds = new Set();
  for (const category of catalog.categories) {
    assertSafeId(category?.id, 'category id');
    assertVisibleText(category?.name, 'category name', MAX_NAME_LENGTH);
    if (categoryIds.has(category.id)) throw new Error(`Category ${category.id} already exists`);
    categoryIds.add(category.id);
    if (!Array.isArray(category.products)) throw new Error(`Category ${category.id} must contain products`);

    const productIds = new Set();
    for (const product of category.products) {
      assertSafeId(product?.id, 'product id');
      assertVisibleText(product?.name, 'product name', MAX_NAME_LENGTH);
      if (productIds.has(product.id)) throw new Error(`Product ${category.id}/${product.id} already exists`);
      productIds.add(product.id);
    }
  }

  return catalog;
}

export function validateProductMetadata(product) {
  if (!product || typeof product !== 'object' || Array.isArray(product)) {
    throw new Error('Product metadata must be an object');
  }
  assertVisibleText(product.name, 'product name', MAX_NAME_LENGTH);
  assertVisibleText(product.price, 'product price', MAX_PRICE_LENGTH);
  assertVisibleText(product.description, 'product description', MAX_DESCRIPTION_LENGTH);
  return {
    name: product.name.trim(),
    price: product.price.trim(),
    description: product.description.trim()
  };
}

export function addProductToCatalog(catalog, { categoryId, categoryName, product }) {
  validateCatalog(catalog);
  assertSafeId(categoryId, 'category id');
  assertSafeId(product?.id, 'product id');
  assertVisibleText(product?.name, 'product name', MAX_NAME_LENGTH);

  const category = catalog.categories.find((item) => item.id === categoryId);
  if (!category && categoryName === undefined) throw new Error('A category name is required for a new category');
  if (!category && typeof categoryName === 'string') {
    assertVisibleText(categoryName, 'category name', MAX_NAME_LENGTH);
  }
  if (category?.products.some((item) => item.id === product.id)) {
    throw new Error(`Product ${categoryId}/${product.id} already exists`);
  }

  const nextProduct = { id: product.id, name: product.name.trim() };
  const nextCategories = category
    ? catalog.categories.map((item) => item.id === categoryId
      ? { ...item, products: sortedByName([...item.products, nextProduct]) }
      : { ...item, products: [...item.products] })
    : [...catalog.categories.map((item) => ({ ...item, products: [...item.products] })), {
      id: categoryId,
      name: categoryName.trim(),
      products: [nextProduct]
    }];

  return { categories: sortedByName(nextCategories) };
}

export function renderStaticProductPage({ categoryId, productId, product }) {
  assertSafeId(categoryId, 'category id');
  assertSafeId(productId, 'product id');
  const metadata = validateProductMetadata(product);
  const productPath = `${categoryId}/${productId}`;
  const escapedName = escapeHtml(metadata.name);
  const escapedPrice = escapeHtml(metadata.price);
  const escapedDescription = escapeHtml(metadata.description);

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="${escapedDescription.slice(0, 150)}">
  <meta property="og:locale" content="zh_CN">
  <meta property="og:site_name" content="雨山红木">
  <meta property="og:type" content="product">
  <meta property="og:title" content="${escapedName} | 雨山红木">
  <meta property="og:description" content="${escapedDescription.slice(0, 150)}">
  <meta property="product:retailer_item_id" content="${productPath}">
  <title>${escapedName} | 雨山红木</title>
  <meta http-equiv="refresh" content="0; url=../../../?product=${productPath}">
</head>
<body>
  <main>
    <h1>${escapedName}</h1>
    <p>${escapedPrice}</p>
    <p>${escapedDescription.replaceAll('\n', '<br>')}</p>
    <p><a href="../../../?product=${productPath}">进入 3D 展厅查看此商品</a></p>
  </main>
</body>
</html>
`;
}

export function renderNoScriptCatalog(catalog) {
  validateCatalog(catalog);
  const categoryLinks = catalog.categories.map((category) => {
    const items = category.products.map((product) => (
      `        <li><a href="./products/${category.id}/${product.id}/">${escapeHtml(product.name)}</a></li>`
    )).join('\n');
    return `      <li>${escapeHtml(category.name)}\n        <ul>\n${items}\n        </ul>\n      </li>`;
  }).join('\n');

  return `<section class="no-script-catalog" aria-label="静态产品目录">
      <h1>雨山红木 3D 数字展厅</h1>
      <p>启用 JavaScript 可查看交互式 3D 模型；以下链接提供每件商品的静态介绍。</p>
      <ul>
${categoryLinks}
      </ul>
    </section>`;
}

export function replaceGeneratedCatalogBlock(indexHtml, catalogMarkup) {
  const startMarker = '<!-- catalog:begin -->';
  const endMarker = '<!-- catalog:end -->';
  const start = indexHtml.indexOf(startMarker);
  const end = indexHtml.indexOf(endMarker);
  if (start === -1 || end === -1 || end < start) {
    throw new Error('index.html is missing catalog generation markers');
  }
  return `${indexHtml.slice(0, start + startMarker.length)}\n    ${catalogMarkup}\n    ${indexHtml.slice(end)}`;
}
