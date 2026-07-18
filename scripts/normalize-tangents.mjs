import { readFileSync, writeFileSync } from 'node:fs';

function getGlbParts(bytes) {
  if (bytes.toString('utf8', 0, 4) !== 'glTF') throw new Error('Input must be a GLB file');

  const jsonLength = bytes.readUInt32LE(12);
  const jsonOffset = 20;
  const binaryOffset = jsonOffset + jsonLength + 8;
  return {
    binaryOffset,
    document: JSON.parse(bytes.subarray(jsonOffset, jsonOffset + jsonLength).toString('utf8').trim())
  };
}

function normalMappedTangentAccessors(document) {
  const accessors = new Set();
  for (const mesh of document.meshes ?? []) {
    for (const primitive of mesh.primitives ?? []) {
      if (!document.materials?.[primitive.material]?.normalTexture) continue;
      if (primitive.attributes?.TANGENT === undefined) continue;
      accessors.add(primitive.attributes.TANGENT);
    }
  }
  return accessors;
}

export function normalizeTangents(inputPath, outputPath) {
  const bytes = readFileSync(inputPath);
  const { document, binaryOffset } = getGlbParts(bytes);
  let fallbackCount = 0;

  for (const accessorIndex of normalMappedTangentAccessors(document)) {
    const accessor = document.accessors[accessorIndex];
    if (accessor.componentType !== 5126 || accessor.type !== 'VEC4') {
      throw new Error(`TANGENT accessor ${accessorIndex} must be float32 VEC4`);
    }

    const bufferView = document.bufferViews[accessor.bufferView];
    const stride = bufferView.byteStride ?? 16;
    const start = binaryOffset + (bufferView.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
    for (let index = 0; index < accessor.count; index += 1) {
      const offset = start + index * stride;
      let x = bytes.readFloatLE(offset);
      let y = bytes.readFloatLE(offset + 4);
      let z = bytes.readFloatLE(offset + 8);
      const length = Math.hypot(x, y, z);

      if (!Number.isFinite(length) || length < 0.000001) {
        x = 1;
        y = 0;
        z = 0;
        fallbackCount += 1;
      } else {
        x /= length;
        y /= length;
        z /= length;
      }

      bytes.writeFloatLE(x, offset);
      bytes.writeFloatLE(y, offset + 4);
      bytes.writeFloatLE(z, offset + 8);
    }
  }

  writeFileSync(outputPath, bytes);
  return fallbackCount;
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const [, , inputPath, outputPath] = process.argv;
  if (!inputPath || !outputPath) {
    throw new Error('Usage: node scripts/normalize-tangents.mjs <input.glb> <output.glb>');
  }
  const fallbackCount = normalizeTangents(inputPath, outputPath);
  console.log(`Normalized tangents; repaired ${fallbackCount} zero-length vectors.`);
}
