import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const catalog = JSON.parse(readFileSync('products/catalog.json', 'utf8'));
const models = catalog.categories.flatMap((category) => category.products.map(
  (product) => `products/${category.id}/${product.id}/model.glb`
));

function readGlbJson(file) {
  const bytes = readFileSync(file);
  assert.equal(bytes.toString('utf8', 0, 4), 'glTF', `${file} must be a GLB`);
  const jsonLength = bytes.readUInt32LE(12);
  return JSON.parse(bytes.subarray(20, 20 + jsonLength).toString('utf8').trim());
}

function readGlbBinary(file, document) {
  const bytes = readFileSync(file);
  const jsonLength = bytes.readUInt32LE(12);
  const binaryOffset = 20 + jsonLength + 8;

  return { bytes, binaryOffset, document };
}

for (const model of models) {
  test(`${model} does not require WebP texture support`, () => {
    const document = readGlbJson(model);
    assert.ok(
      !document.extensionsRequired?.includes('EXT_texture_webp'),
      'EXT_texture_webp must not be required for browser compatibility'
    );
    assert.ok(
      document.images.every((image) => ['image/png', 'image/jpeg'].includes(image.mimeType)),
      'textures must use broadly supported PNG or JPEG formats'
    );
  });

  test(`${model} provides normalized tangents for normal-mapped materials`, () => {
    const document = readGlbJson(model);
    const { bytes, binaryOffset } = readGlbBinary(model, document);

    for (const mesh of document.meshes ?? []) {
      for (const primitive of mesh.primitives ?? []) {
        const material = document.materials?.[primitive.material];
        if (!material?.normalTexture) continue;

        const accessor = document.accessors?.[primitive.attributes?.TANGENT];
        assert.ok(accessor, 'normal-mapped primitive must include TANGENT data');
        assert.equal(accessor.componentType, 5126, 'tangents must be float32');
        assert.equal(accessor.type, 'VEC4', 'tangents must be VEC4');

        const bufferView = document.bufferViews[accessor.bufferView];
        const stride = bufferView.byteStride ?? 16;
        const start = binaryOffset + (bufferView.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
        for (let index = 0; index < accessor.count; index += 1) {
          const offset = start + index * stride;
          const length = Math.hypot(
            bytes.readFloatLE(offset),
            bytes.readFloatLE(offset + 4),
            bytes.readFloatLE(offset + 8)
          );
          assert.ok(Math.abs(length - 1) < 0.001, `tangent ${index} must be normalized`);
        }
      }
    }
  });
}
