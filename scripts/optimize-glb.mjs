#!/usr/bin/env node
/**
 * Optimizes public/models/orlando-diorama.glb with gltf-transform:
 *   dedup -> weld -> quantize -> meshopt (EXT_meshopt_compression)
 * and asserts hard budget & scene-graph ceilings:
 *   - File size <= 250 KB
 *   - Total triangles <= 45,000
 *   - Mesh count <= 10
 *   - All 8 required Orlando landmark & basin mesh names present
 *
 * Usage: node scripts/optimize-glb.mjs [input.glb] [output.glb]
 */

import { readFile, stat, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { dedup, weld, quantize, reorder } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(__dirname, '..');
const DEFAULT_GLB_PATH = resolve(ROOT_DIR, 'public/models/orlando-diorama.glb');

const MAX_BYTES = 250 * 1024;
const MAX_TRIS = 45_000;
const MAX_MESHES = 10;

const REQUIRED_MESHES = [
  'lake_eola_basin',
  'fountain_lake_eola',
  'tower_200_s_orange',
  'tower_bank_of_america',
  'tower_55_west',
  'tower_vue_lake_eola',
  'tower_city_hall',
  'skyline_context_merged',
];

function countDocumentTriangles(doc) {
  let total = 0;
  const perMesh = [];
  for (const mesh of doc.getRoot().listMeshes()) {
    let meshTris = 0;
    for (const prim of mesh.listPrimitives()) {
      const indices = prim.getIndices();
      if (indices) {
        meshTris += indices.getCount() / 3;
      } else {
        const pos = prim.getAttribute('POSITION');
        if (pos) meshTris += pos.getCount() / 3;
      }
    }
    total += meshTris;
    perMesh.push({ name: mesh.getName(), triangles: Math.round(meshTris) });
  }
  return { total: Math.round(total), perMesh };
}

async function main() {
  const inputPath = resolve(process.argv[2] || DEFAULT_GLB_PATH);
  const outputPath = resolve(process.argv[3] || inputPath);

  await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready]);

  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({
      'meshopt.decoder': MeshoptDecoder,
      'meshopt.encoder': MeshoptEncoder,
    });

  const inputBytes = await readFile(inputPath);
  const doc = await io.readBinary(new Uint8Array(inputBytes));

  await doc.transform(
    dedup(),
    weld({ tolerance: 0.0001 }),
    reorder({ encoder: MeshoptEncoder, target: 'size' }),
    // Quantize NORMAL and TEXCOORD_0 while keeping world-space POSITION & identity Node transforms
    quantize({ pattern: /^(?!POSITION).*$/ }),
  );
  doc
    .createExtension(EXTMeshoptCompression)
    .setRequired(true)
    .setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });

  const outputBytes = await io.writeBinary(doc);
  await writeFile(outputPath, outputBytes);

  const { size } = await stat(outputPath);
  const { total, perMesh } = countDocumentTriangles(doc);
  const meshNames = perMesh.map((m) => m.name);

  console.log(`Optimized ${outputPath}`);
  console.log(`  Size:      ${size} bytes (${(size / 1024).toFixed(2)} KB) / max ${MAX_BYTES / 1024} KB`);
  console.log(`  Meshes:    ${meshNames.length} / max ${MAX_MESHES}`);
  console.log(`  Triangles: ${total.toLocaleString()} / max ${MAX_TRIS.toLocaleString()}`);
  for (const m of perMesh) {
    console.log(`    - ${m.name}: ${m.triangles.toLocaleString()} tris`);
  }

  const missing = REQUIRED_MESHES.filter((req) => !meshNames.includes(req));
  if (missing.length > 0) {
    throw new Error(`Missing required mesh names: ${missing.join(', ')}`);
  }
  if (size > MAX_BYTES) {
    throw new Error(`GLB size ${size} bytes exceeds ceiling ${MAX_BYTES} bytes`);
  }
  if (total > MAX_TRIS) {
    throw new Error(`Triangle count ${total} exceeds ceiling ${MAX_TRIS}`);
  }
  if (meshNames.length > MAX_MESHES) {
    throw new Error(`Mesh count ${meshNames.length} exceeds ceiling ${MAX_MESHES}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
