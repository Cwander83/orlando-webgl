# Orlando in Ink & Light

An interactive 3D WebGL architectural diorama of **Lake Eola and Downtown Orlando**, rendered in deep navy (`#0b1437`) and warm cream (`#fbfaf6`) editorial styling. Native scroll choreographs a continuous camera flight across four atmospheric acts before unlocking bounded `OrbitControls` and live Orlando weather/solar sync.

## Architecture Overview

- **Editorial Shell (`src/app/page.tsx`, `src/components/dom/`)**: Server-rendered Next.js App Router semantic HTML (`<TopNav />`, `<ScrollChapters />`, `<SceneHud />`, `<StaticDioramaFallback />`) with preloaded self-hosted Latin variable fonts (`League Spartan` and `Open Sans`) so primary typography paints immediately before `<Canvas>` hydration.
- **Zero-Rerender State Bridge (`src/lib/scene-store.ts`, `src/lib/scroll-rig.ts`)**: `GSAP ScrollTrigger` writes normalized scroll progress (`0..1`) into `sceneMutableState` (plain mutable TypeScript object) without calling React `setState`. `useHudStore` (`useSyncExternalStore`) updates React UI only on discrete transitions (`activeChapter`, `mode`, `qualityTier`, `reducedMotion`, `liveWeather`).
- **Scene Choreography (`src/components/canvas/`)**:
  - `ExperienceLoader.tsx` & `ExperienceRoot.tsx`: Lazy `next/dynamic(..., { ssr: false })` client wrapper, post-paint `requestAnimationFrame` mount, WebGL2 + GPU tier detection, `webglcontextlost` recovery to `<StaticDioramaFallback />`, and `ErrorBoundary` fallback.
  - `SceneDirector.tsx`: Master `useFrame` controller damping `timeOfDay` and `stormIntensity` via `THREE.MathUtils.damp`, driving `inkReveal`, stochastic storm `lightningFlash` (clamped to `0` under `prefers-reduced-motion: reduce`), rolling FPS monitor hooked to `visibilitychange`, and `window.__SCENE_METRICS__`.
  - `CameraRig.tsx`: Smooth timeline interpolation across chapters, `400ms` quaternion/position slerp handoff (`handoffBlend`) between scroll and bounded `OrbitControls` (`minPolarAngle: 0.25`, `maxPolarAngle: 1.42`, `minDistance: 18`, `maxDistance: 85`), plus arrow-key and `+`/`-` keyboard orbit.
  - `OrlandoDiorama.tsx`: Loads `/models/orlando-diorama.glb` via `GLTFLoader` + `MeshoptDecoder`, binds a single shared `StylizedCityMaterial` across `fountain_lake_eola`, `tower_200_s_orange`, `tower_bank_of_america`, `tower_55_west`, `tower_vue_lake_eola`, `tower_city_hall`, and `skyline_context_merged`, extracts `lake_eola_basin` for `<LakeEolaWater />`, and adds an emerald/cream fountain plume accent.
  - `PostEffects.tsx`: Tier-gated single-downsample Bloom (`high` / `medium` tiers only; unmounted on `low` / `fallback`).
  - `DevTweakPanel.tsx`: Strictly gated behind `process.env.NODE_ENV === 'development'` dynamic `import('leva')` (**0 bytes** in production chunks).
- **Custom GLSL Shaders (`src/shaders/`, `src/lib/shader-materials.ts`)**:
  - `InkSkyMaterial`: Procedural dawn/golden/storm/night sky dome, 2-octave FBM storm clouds, and organic ink-reveal wipe.
  - `LakeWaterMaterial`: Analytical multi-wave normals, cursor wake disturbance, cell-hashed storm raindrop rings, Schlick Fresnel reflections, and shoreline ink-foam contour.
  - `StylizedCityMaterial`: 3-band navy/cream cel shading, `fwidth` architectural ink-crease lines, and world-space illuminated night windows.
- **Live Orlando Weather (`src/lib/orlando-sky.ts`, `src/app/api/orlando-weather/route.ts`)**: Keyless Open-Meteo proxy (`revalidate: 900`, `2500ms` `AbortSignal.timeout`) paired with `America/New_York` solar elevation math (`28.5383°N, -81.3792°W`) and graceful offline fallback.

## Measured Production Metrics

| Metric / Asset | Measured Value | Budget / Target |
| --- | --- | --- |
| **Diorama model (`public/models/orlando-diorama.glb`)** | `69.81 KiB` (`71,484 B`, Meshopt + quantized) | `<= 250 KiB` |
| **Self-hosted variable fonts (`.woff2` combined)** | `65.28 KiB` (`66,848 B`) | `<= 66.41 KiB` (`68,000 B`) |
| **Fallback poster (`public/images/poster-fallback.webp`)** | `17.79 KiB` (`18,218 B`) | `<= 65 KiB` |
| **Lazy 3D / Three.js chunk** | `273.89 KiB` gzipped (`280,461 B`) | `<= 280 KiB` gzipped |
| **Initial route non-3D async JS (excl. `noModule` polyfill)** | `139.16 KiB` gzipped (`142,500 B`; `131.60 KiB` Next.js 16 + React 19 runtime + `7.56 KiB` app shell) | `<= 145 KiB` gzipped |
| **`leva` in production `.next/static/chunks/*.js`** | `0 B` | `0 B` |
| **Main-pass draw calls / programs / triangles** | `7–11` draw calls / `7–8` programs / `4,276–7,122` tris | `<= 12` calls / `<= 8` programs / `<= 45,000` tris |
| **Unit tests (`vitest`)** | `5` files, `21/21` passing | 100% pass |
| **E2E tests (`playwright`, Metal ANGLE headless Chromium)** | `3` files, `6/6` passing (incl. `axe-core` 0 violations) | 100% pass |

## Keyboard Controls

- `1`–`4`: Jump to Chapters 01–04
- `E`: Toggle Explore Mode (bounded `OrbitControls`, Solar Time slider, Squall toggle)
- `ArrowLeft` / `ArrowRight` / `ArrowUp` / `ArrowDown` & `+` / `-`: Keyboard orbit & zoom in Explore/Live Mode
- `L`: Toggle Live Orlando Sky & Weather

## Local Development & Verification

```bash
npm install
npm run dev              # Start Next.js dev server with Leva dev panel
npm run typecheck        # TypeScript check
npm test                 # Run Vitest unit suite
npm run build            # Production build
npm run check:budgets    # Verify font, GLB, poster, and chunk byte budgets
npm run test:e2e         # Run Playwright E2E + axe-core + fallback tests
npm run assets:optimize  # Re-optimize orlando-diorama.glb with Meshopt
```
