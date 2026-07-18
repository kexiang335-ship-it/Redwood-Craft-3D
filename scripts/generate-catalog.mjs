import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  renderNoScriptCatalog,
  renderStaticProductPage,
  validateCatalog,
  validateProductMetadata
} from './catalog-core.mjs';

function readJson(filePath, label) {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new Error(`Unable to read ${label} at ${filePath}: ${error.message}`);
  }
}

export function generateCatalogArtifacts(siteRoot) {
  const catalogPath = join(siteRoot, 'products', 'catalog.json');
  const catalog = validateCatalog(readJson(catalogPath, 'catalog.json'));
  const generatedProducts = [];

  for (const category of catalog.categories) {
    for (const product of category.products) {
      const productDirectory = join(siteRoot, 'products', category.id, product.id);
      const modelPath = join(productDirectory, 'model.glb');
      if (!existsSync(modelPath)) throw new Error(`Missing model.glb for ${category.id}/${product.id}`);
      const metadata = validateProductMetadata(readJson(join(productDirectory, 'info.json'), 'info.json'));
      if (metadata.name !== product.name) {
        throw new Error(`Catalog name does not match info.json for ${category.id}/${product.id}`);
      }
      writeFileSync(
        join(productDirectory, 'index.html'),
        renderStaticProductPage({ categoryId: category.id, productId: product.id, product: metadata })
      );
      generatedProducts.push(`${category.id}/${product.id}`);
    }
  }

  const indexPath = join(siteRoot, 'index.html');
  const indexHtml = readFileSync(indexPath, 'utf8');
  const catalogMarkup = renderNoScriptCatalog(catalog);
  const startMarker = '<!-- catalog:begin -->';
  const endMarker = '<!-- catalog:end -->';
  const start = indexHtml.indexOf(startMarker);
  const end = indexHtml.indexOf(endMarker);
  if (start === -1 || end === -1 || end < start) {
    throw new Error('index.html is missing catalog generation markers');
  }
  writeFileSync(indexPath, `${indexHtml.slice(0, start + startMarker.length)}\n    ${catalogMarkup}\n    ${indexHtml.slice(end)}`);

  return { generatedProducts };
}

const scriptPath = fileURLToPath(import.meta.url);
if (process.argv[1] === scriptPath) {
  const siteRoot = dirname(dirname(scriptPath));
  const result = generateCatalogArtifacts(siteRoot);
  console.log(`Generated ${result.generatedProducts.length} static product page(s).`);
}
