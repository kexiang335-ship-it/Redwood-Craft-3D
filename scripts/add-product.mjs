import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, extname, join, relative, resolve, sep } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  addProductToCatalog,
  renderNoScriptCatalog,
  renderStaticProductPage,
  validateCatalog,
  validateProductMetadata
} from './catalog-core.mjs';
import { normalizeTangents } from './normalize-tangents.mjs';

const MAX_MODEL_BYTES = 50 * 1024 * 1024;

function readJson(filePath, label) {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new Error(`Unable to read ${label} at ${filePath}: ${error.message}`);
  }
}

function writeJsonAtomic(filePath, value) {
  writeTextAtomic(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function writeTextAtomic(filePath, value) {
  const temporaryPath = join(dirname(filePath), `.${basename(filePath)}.tmp-${process.pid}`);
  writeFileSync(temporaryPath, value);
  renameSync(temporaryPath, filePath);
}

function resolveInsideRoot(root, target) {
  const resolvedRoot = resolve(root);
  const resolvedTarget = resolve(target);
  const pathFromRoot = relative(resolvedRoot, resolvedTarget);
  if (pathFromRoot === '' || pathFromRoot === '..' || pathFromRoot.startsWith(`..${sep}`)) {
    throw new Error('Target must remain inside the site root');
  }
  return resolvedTarget;
}

function getGlbDocument(modelPath) {
  const bytes = readFileSync(modelPath);
  if (bytes.length > MAX_MODEL_BYTES) {
    throw new Error(`model.glb exceeds the ${MAX_MODEL_BYTES / 1024 / 1024} MB import limit`);
  }
  if (bytes.toString('utf8', 0, 4) !== 'glTF') throw new Error('model.glb is not a valid GLB file');
  if (bytes.readUInt32LE(4) !== 2) throw new Error('model.glb must use glTF 2.0');
  const fileLength = bytes.readUInt32LE(8);
  if (fileLength !== bytes.length) throw new Error('model.glb has an invalid declared length');
  const jsonLength = bytes.readUInt32LE(12);
  if (jsonLength <= 0 || 20 + jsonLength > bytes.length) throw new Error('model.glb has an invalid JSON chunk');
  try {
    return JSON.parse(bytes.subarray(20, 20 + jsonLength).toString('utf8').trim());
  } catch {
    throw new Error('model.glb contains invalid JSON');
  }
}

export function validateImportModel(modelPath) {
  const document = getGlbDocument(modelPath);
  if (document.extensionsRequired?.includes('EXT_texture_webp')) {
    throw new Error('model.glb requires WebP textures; export it with PNG or JPEG textures instead');
  }
  for (const image of document.images ?? []) {
    if (image.mimeType && !['image/png', 'image/jpeg'].includes(image.mimeType)) {
      throw new Error(`Unsupported model texture format: ${image.mimeType}`);
    }
  }
  for (const mesh of document.meshes ?? []) {
    for (const primitive of mesh.primitives ?? []) {
      if (!document.materials?.[primitive.material]?.normalTexture) continue;
      if (primitive.attributes?.TANGENT === undefined) {
        throw new Error('Normal-mapped models must include TANGENT data before import');
      }
    }
  }
  return document;
}

function getSourceFiles({ sourceDirectory, modelPath }) {
  const suppliedModelPath = modelPath ?? (sourceDirectory ? join(sourceDirectory, 'model.glb') : undefined);
  if (!suppliedModelPath) throw new Error('Provide --source <product folder> or --model <model.glb>');
  const resolvedModelPath = realpathSync(suppliedModelPath);
  if (extname(resolvedModelPath).toLowerCase() !== '.glb' || !lstatSync(resolvedModelPath).isFile()) {
    throw new Error('The selected model must be a regular .glb file');
  }

  const resolvedSourceDirectory = sourceDirectory ? realpathSync(sourceDirectory) : dirname(resolvedModelPath);
  const infoPath = join(resolvedSourceDirectory, 'info.json');
  return {
    modelPath: resolvedModelPath,
    packageMetadata: existsSync(infoPath) ? readJson(infoPath, 'source info.json') : {}
  };
}

function replaceNoScriptCatalog(indexHtml, catalog) {
  const startMarker = '<!-- catalog:begin -->';
  const endMarker = '<!-- catalog:end -->';
  const start = indexHtml.indexOf(startMarker);
  const end = indexHtml.indexOf(endMarker);
  if (start === -1 || end === -1 || end < start) {
    throw new Error('index.html is missing catalog generation markers');
  }
  return `${indexHtml.slice(0, start + startMarker.length)}\n    ${renderNoScriptCatalog(catalog)}\n    ${indexHtml.slice(end)}`;
}

function runProjectTests(siteRoot) {
  const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const result = spawnSync(npmCommand, ['test'], { cwd: siteRoot, stdio: 'inherit' });
  if (result.status !== 0) throw new Error('npm test failed; the import was rolled back');
}

export function importProduct({
  siteRoot,
  sourceDirectory,
  modelPath,
  categoryId,
  categoryName,
  productId,
  metadata,
  runTests = true
}) {
  const root = resolve(siteRoot);
  const catalogPath = resolveInsideRoot(root, join(root, 'products', 'catalog.json'));
  const indexPath = resolveInsideRoot(root, join(root, 'index.html'));
  const catalog = validateCatalog(readJson(catalogPath, 'catalog.json'));
  const source = getSourceFiles({ sourceDirectory, modelPath });
  const product = validateProductMetadata({ ...source.packageMetadata, ...metadata });
  const nextCatalog = addProductToCatalog(catalog, {
    categoryId,
    categoryName,
    product: { id: productId, name: product.name }
  });
  const productDirectory = resolveInsideRoot(root, join(root, 'products', categoryId, productId));
  if (existsSync(productDirectory)) throw new Error(`Product directory ${categoryId}/${productId} already exists`);

  const originalCatalog = readFileSync(catalogPath, 'utf8');
  const originalIndex = readFileSync(indexPath, 'utf8');
  const nextIndex = replaceNoScriptCatalog(originalIndex, nextCatalog);
  const stagingRoot = mkdtempSync(join(tmpdir(), 'redwood-product-import-'));
  const stagedProductDirectory = join(stagingRoot, productId);
  let targetCreated = false;

  try {
    mkdirSync(stagedProductDirectory);
    const stagedModelPath = join(stagedProductDirectory, 'model.glb');
    copyFileSync(source.modelPath, stagedModelPath);
    normalizeTangents(stagedModelPath, stagedModelPath);
    validateImportModel(stagedModelPath);
    writeJsonAtomic(join(stagedProductDirectory, 'info.json'), product);
    writeFileSync(
      join(stagedProductDirectory, 'index.html'),
      renderStaticProductPage({ categoryId, productId, product })
    );

    mkdirSync(dirname(productDirectory), { recursive: true });
    renameSync(stagedProductDirectory, productDirectory);
    targetCreated = true;
    writeJsonAtomic(catalogPath, nextCatalog);
    writeTextAtomic(indexPath, nextIndex);
    if (runTests) runProjectTests(root);
    return {
      productPath: `${categoryId}/${productId}`,
      changedFiles: [
        `products/${categoryId}/${productId}/model.glb`,
        `products/${categoryId}/${productId}/info.json`,
        `products/${categoryId}/${productId}/index.html`,
        'products/catalog.json',
        'index.html'
      ]
    };
  } catch (error) {
    if (targetCreated) rmSync(productDirectory, { recursive: true, force: true });
    writeFileSync(catalogPath, originalCatalog);
    writeFileSync(indexPath, originalIndex);
    throw error;
  } finally {
    rmSync(stagingRoot, { recursive: true, force: true });
  }
}

function parseArguments(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith('--')) throw new Error(`Unknown argument: ${argument}`);
    const key = argument.slice(2);
    if (key === 'skip-tests') {
      options.skipTests = true;
      continue;
    }
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for --${key}`);
    options[key] = value;
    index += 1;
  }
  return options;
}

async function promptForImport(options, siteRoot) {
  const catalog = validateCatalog(readJson(join(siteRoot, 'products', 'catalog.json'), 'catalog.json'));
  const source = getSourceFiles({ sourceDirectory: options.source, modelPath: options.model });
  const defaults = source.packageMetadata;
  const readline = createInterface({ input: process.stdin, output: process.stdout });
  const ask = async (label, fallback = '') => {
    const answer = await readline.question(fallback ? `${label} [${fallback}]: ` : `${label}: `);
    return answer.trim() || fallback;
  };

  try {
    let categoryId = options.category;
    let categoryName = options['category-name'];
    if (!categoryId) {
      console.log('\n现有类目：');
      catalog.categories.forEach((category, index) => console.log(`${index + 1}. ${category.name} (${category.id})`));
      const choice = await ask('输入类目编号，或输入 new 新建类目');
      if (choice === 'new') {
        categoryId = await ask('新类目 ID（小写字母、数字、下划线）');
        categoryName = await ask('新类目名称');
      } else {
        const selected = catalog.categories[Number(choice) - 1];
        if (!selected) throw new Error('类目编号无效');
        categoryId = selected.id;
      }
    }

    return {
      siteRoot,
      sourceDirectory: options.source,
      modelPath: options.model,
      categoryId,
      categoryName,
      productId: options['product-id'] ?? await ask('商品 ID（小写字母、数字、下划线）', defaults.id ?? ''),
      metadata: {
        name: options.name ?? await ask('商品名称', defaults.name ?? ''),
        price: options.price ?? await ask('价格展示文字', defaults.price ?? ''),
        description: options.description ?? await ask('商品简介', defaults.description ?? '')
      },
      runTests: !options.skipTests
    };
  } finally {
    readline.close();
  }
}

async function runCli() {
  const scriptPath = fileURLToPath(import.meta.url);
  const siteRoot = dirname(dirname(scriptPath));
  const options = parseArguments(process.argv.slice(2));
  if (!options.source && !options.model) {
    throw new Error('请提供 --source <商品包文件夹> 或 --model <model.glb>');
  }
  const request = await promptForImport(options, siteRoot);
  const result = importProduct(request);
  console.log(`\n导入完成：${result.productPath}`);
  console.log('已更新：');
  result.changedFiles.forEach((file) => console.log(`- ${file}`));
  console.log('\n下一步：git diff --check && git status --short，然后确认无误后再提交和推送。');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runCli().catch((error) => {
    console.error(`导入失败：${error.message}`);
    process.exitCode = 1;
  });
}
