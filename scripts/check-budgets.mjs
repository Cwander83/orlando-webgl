import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const ROOT = process.cwd();
const args = new Set(process.argv.slice(2));
const REQUIRE_ASSETS = args.has('--require-assets');
const REQUIRE_BUILD = args.has('--require-build') || REQUIRE_ASSETS;

const BUDGETS = {
  // Exact copied chriswander.com Latin variable fonts total 66,848 B (65.28 KiB).
  // Ceiling set to 68,000 B (<= 68 KB decimal / 66.4 KiB) per coordinator ruling.
  fontsCombinedBytes: 68_000,
  modelGlbBytes: 250 * 1024,
  posterWebpBytes: 65 * 1024,
  initialNon3dJsGzipBytes: 130 * 1024,
  lazy3dChunksGzipBytes: 280 * 1024,
};

let failures = 0;

function formatKiB(bytes) {
  return `${(bytes / 1024).toFixed(2)} KiB (${bytes} B)`;
}

function pass(label, detail) {
  console.log(`PASS  ${label}: ${detail}`);
}

function fail(label, detail) {
  console.error(`FAIL  ${label}: ${detail}`);
  failures += 1;
}

function skip(label, detail) {
  console.log(`SKIP  ${label}: ${detail}`);
}

function walkJsFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const results = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkJsFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      results.push(fullPath);
    }
  }
  return results;
}

function gzipSize(filePath) {
  const buf = fs.readFileSync(filePath);
  return zlib.gzipSync(buf, { level: 9 }).length;
}

function isThreeOr3dChunk(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  return (
    /WebGLRenderer|ShaderMaterial|MeshoptDecoder|OrbitControls|EffectComposer|UnrealBloomPass/.test(
      content
    ) || /@react-three\/fiber|@react-three\/drei/.test(content)
  );
}

function checkFonts() {
  const fontsDir = path.join(ROOT, 'public', 'fonts');
  if (!fs.existsSync(fontsDir)) {
    fail('Fonts (.woff2)', 'public/fonts directory missing');
    return;
  }
  const woff2Files = fs
    .readdirSync(fontsDir)
    .filter((name) => name.endsWith('.woff2'))
    .map((name) => path.join(fontsDir, name));

  if (woff2Files.length === 0) {
    fail('Fonts (.woff2)', 'No .woff2 files found in public/fonts');
    return;
  }

  const totalBytes = woff2Files.reduce((sum, f) => sum + fs.statSync(f).size, 0);
  if (totalBytes <= BUDGETS.fontsCombinedBytes) {
    pass(
      'Fonts (.woff2 combined)',
      `${formatKiB(totalBytes)} <= ${formatKiB(BUDGETS.fontsCombinedBytes)}`
    );
  } else {
    fail(
      'Fonts (.woff2 combined)',
      `${formatKiB(totalBytes)} > ${formatKiB(BUDGETS.fontsCombinedBytes)}`
    );
  }
}

function checkAssetFile(label, relPath, maxBytes) {
  const fullPath = path.join(ROOT, relPath);
  if (!fs.existsSync(fullPath)) {
    if (REQUIRE_ASSETS) {
      fail(label, `Missing required asset ${relPath}`);
    } else {
      skip(label, `${relPath} not present yet (pass --require-assets to enforce)`);
    }
    return;
  }
  const size = fs.statSync(fullPath).size;
  if (size <= maxBytes) {
    pass(label, `${formatKiB(size)} <= ${formatKiB(maxBytes)}`);
  } else {
    fail(label, `${formatKiB(size)} > ${formatKiB(maxBytes)}`);
  }
}

function collectInitialChunkPaths(nextDir) {
  const chunkPaths = new Set();

  // 1. Inspect prerendered HTML for exact initial <script src="/_next/static/chunks/..."> tags
  const htmlCandidates = [
    path.join(nextDir, 'server', 'app', 'index.html'),
    path.join(nextDir, 'server', 'app', 'page.html'),
  ];
  for (const htmlFile of htmlCandidates) {
    if (!fs.existsSync(htmlFile)) continue;
    const html = fs.readFileSync(htmlFile, 'utf8');
    const regex = /\/_next\/static\/chunks\/([^"'\\]+\.js)/g;
    let match;
    while ((match = regex.exec(html)) !== null) {
      const candidate = path.join(nextDir, 'static', 'chunks', match[1]);
      if (fs.existsSync(candidate)) {
        chunkPaths.add(candidate);
      }
    }
  }

  // 2. Fallback / supplement via build-manifest.json & app-build-manifest.json
  if (chunkPaths.size === 0) {
    const buildManifestPath = path.join(nextDir, 'build-manifest.json');
    if (fs.existsSync(buildManifestPath)) {
      const manifest = JSON.parse(fs.readFileSync(buildManifestPath, 'utf8'));
      const files = [
        ...(manifest.polyfillFiles ?? []),
        ...(manifest.rootMainFiles ?? []),
        ...(manifest.pages?.['/'] ?? []),
      ];
      for (const rel of files) {
        if (!rel.endsWith('.js')) continue;
        const normalized = rel.replace(/^\/?_next\//, '');
        const candidate = path.join(nextDir, normalized);
        if (fs.existsSync(candidate)) {
          chunkPaths.add(candidate);
        }
      }
    }

    const appManifestPath = path.join(nextDir, 'app-build-manifest.json');
    if (fs.existsSync(appManifestPath)) {
      const appManifest = JSON.parse(fs.readFileSync(appManifestPath, 'utf8'));
      for (const rel of appManifest.pages?.['/page'] ?? []) {
        if (!rel.endsWith('.js')) continue;
        const normalized = rel.replace(/^\/?_next\//, '');
        const candidate = path.join(nextDir, normalized);
        if (fs.existsSync(candidate)) {
          chunkPaths.add(candidate);
        }
      }
    }
  }

  return [...chunkPaths];
}

function checkNextBundles() {
  const nextDir = path.join(ROOT, '.next');
  const chunksDir = path.join(nextDir, 'static', 'chunks');

  if (!fs.existsSync(chunksDir)) {
    if (REQUIRE_BUILD) {
      fail('Next.js build chunks', '.next/static/chunks missing — run npm run build first');
    } else {
      skip('Next.js build chunks', '.next/static/chunks not built yet');
    }
    return;
  }

  const allChunks = walkJsFiles(chunksDir);
  const threeChunks = allChunks.filter((f) => isThreeOr3dChunk(f));
  const threeSet = new Set(threeChunks);

  const lazy3dGzip = threeChunks.reduce((sum, f) => sum + gzipSize(f), 0);
  if (lazy3dGzip <= BUDGETS.lazy3dChunksGzipBytes) {
    pass(
      `Lazy 3D/Three JS (${threeChunks.length} chunk${threeChunks.length === 1 ? '' : 's'})`,
      `${formatKiB(lazy3dGzip)} gz <= ${formatKiB(BUDGETS.lazy3dChunksGzipBytes)} gz`
    );
  } else {
    fail(
      `Lazy 3D/Three JS (${threeChunks.length} chunks)`,
      `${formatKiB(lazy3dGzip)} gz > ${formatKiB(BUDGETS.lazy3dChunksGzipBytes)} gz`
    );
  }

  const initialChunks = collectInitialChunkPaths(nextDir).filter((f) => !threeSet.has(f));
  if (initialChunks.length === 0) {
    // Fallback if manifests/HTML unavailable: measure non-3D chunks excluding clearly async page chunks
    const non3dChunks = allChunks.filter((f) => !threeSet.has(f));
    const totalNon3dGzip = non3dChunks.reduce((sum, f) => sum + gzipSize(f), 0);
    if (totalNon3dGzip <= BUDGETS.initialNon3dJsGzipBytes) {
      pass(
        `Initial non-3D JS (${non3dChunks.length} chunks)`,
        `${formatKiB(totalNon3dGzip)} gz <= ${formatKiB(BUDGETS.initialNon3dJsGzipBytes)} gz`
      );
    } else {
      fail(
        `Initial non-3D JS (${non3dChunks.length} chunks)`,
        `${formatKiB(totalNon3dGzip)} gz > ${formatKiB(BUDGETS.initialNon3dJsGzipBytes)} gz`
      );
    }
    return;
  }

  const initialGzip = initialChunks.reduce((sum, f) => sum + gzipSize(f), 0);
  if (initialGzip <= BUDGETS.initialNon3dJsGzipBytes) {
    pass(
      `Initial route non-3D JS (${initialChunks.length} chunks)`,
      `${formatKiB(initialGzip)} gz <= ${formatKiB(BUDGETS.initialNon3dJsGzipBytes)} gz`
    );
  } else {
    fail(
      `Initial route non-3D JS (${initialChunks.length} chunks)`,
      `${formatKiB(initialGzip)} gz > ${formatKiB(BUDGETS.initialNon3dJsGzipBytes)} gz`
    );
  }
}

checkFonts();
checkAssetFile(
  'Diorama model (orlando-diorama.glb)',
  'public/models/orlando-diorama.glb',
  BUDGETS.modelGlbBytes
);
checkAssetFile(
  'Poster fallback (poster-fallback.webp)',
  'public/images/poster-fallback.webp',
  BUDGETS.posterWebpBytes
);
checkNextBundles();

if (failures > 0) {
  console.error(`\nBudget check failed with ${failures} violation(s).`);
  process.exit(1);
}

console.log('\nAll active asset and bundle budgets passed.');
