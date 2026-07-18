const SAFE_PATH_SEGMENT = /^[a-z0-9_]+$/;

function assertSafePathSegment(value, label) {
  if (typeof value !== 'string' || !SAFE_PATH_SEGMENT.test(value)) {
    throw new Error(`Invalid ${label}`);
  }
}

export function getProductPaths(categoryFolder, productFolder) {
  assertSafePathSegment(categoryFolder, 'category folder');
  assertSafePathSegment(productFolder, 'product folder');

  const productRoot = `./products/${categoryFolder}/${productFolder}`;
  return {
    infoUrl: `${productRoot}/info.json`,
    modelUrl: `${productRoot}/model.glb`
  };
}

export function normalizeCatalog(catalog) {
  if (!catalog || typeof catalog !== 'object' || !Array.isArray(catalog.categories)) {
    throw new Error('Invalid product catalog');
  }

  return catalog.categories.map((category) => {
    assertSafePathSegment(category?.id, 'category folder');
    if (typeof category.name !== 'string' || !category.name.trim()) {
      throw new Error('Invalid category name');
    }
    if (!Array.isArray(category.products)) throw new Error('Invalid category products');

    return {
      categoryFolder: category.id,
      categoryName: category.name.trim(),
      items: category.products.map((product) => {
        assertSafePathSegment(product?.id, 'product folder');
        if (typeof product.name !== 'string' || !product.name.trim()) {
          throw new Error('Invalid product name');
        }
        return { folder: product.id, name: product.name.trim() };
      })
    };
  });
}

function normalizeProduct(product) {
  if (!product || typeof product !== 'object' || Array.isArray(product)) {
    throw new Error('Invalid product metadata');
  }

  return {
    name: typeof product.name === 'string' && product.name.trim() ? product.name : '未命名产品',
    price: typeof product.price === 'string' && product.price.trim() ? product.price : '价格未定',
    description: typeof product.description === 'string' && product.description.trim()
      ? product.description
      : '暂无详细描述'
  };
}

export function createProductLoader({ fetchProduct, onModelLoading, onProductReady, onProductError }) {
  let activeRequestId = 0;
  let activeController = null;

  return async function loadProduct(categoryFolder, productFolder) {
    const requestId = ++activeRequestId;
    activeController?.abort();
    activeController = new AbortController();

    const { infoUrl, modelUrl } = getProductPaths(categoryFolder, productFolder);
    onModelLoading(modelUrl);

    try {
      const product = await fetchProduct(infoUrl, { signal: activeController.signal });
      if (requestId !== activeRequestId) return { status: 'stale' };

      onProductReady(normalizeProduct(product));
      return { status: 'ready' };
    } catch (error) {
      if (requestId !== activeRequestId || error?.name === 'AbortError') {
        return { status: 'stale' };
      }

      onProductError('产品信息加载失败，请稍后重试。');
      return { status: 'error' };
    }
  };
}

/**
 * Module scripts load independently. Keep product selection behind the custom
 * element registration so assigning `viewer.src` cannot be lost while an
 * unupgraded <model-viewer> element is being upgraded.
 */
export function deferProductLoadUntilViewerIsReady(viewerReady, loadProduct) {
  return function loadWhenViewerIsReady(categoryFolder, productFolder) {
    return viewerReady.then(() => loadProduct(categoryFolder, productFolder));
  };
}

export function shouldLoadAnalytics(consent) {
  return consent === 'accepted';
}
