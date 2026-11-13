# Blender Workflow — Orlando in Ink & Light Diorama

This directory documents how to import, refine, and re-export `public/models/orlando-diorama.glb` for the WebGL diorama without breaking shader attributes, draw-call budgets, or Meshopt compression.

---

## 1. Automated Baseline Pipeline

You do **not** need Blender to regenerate a clean, geographically accurate baseline `.glb`:

```bash
# 1. Fetch Overpass OSM footprints around Lake Eola (with curated fallback)
node assets-src/osm/fetch-orlando-osm.mjs

# 2. Extrude footprints, sculpt hero crowns, and build public/models/orlando-diorama.glb
node scripts/generate-base-diorama.mjs

# 3. Apply dedup, weld, quantize, and EXT_meshopt_compression + budget assertions
npm run assets:optimize
```

---

## 2. Blender Import & Coordinate System

1. Open **Blender 4.x+** and clear the default scene (`A` -> `X` -> `Delete`).
2. Import the generated baseline via **File → Import → glTF 2.0 (.glb/.gltf)** and select `public/models/orlando-diorama.glb`.
3. **Scene Coordinate Convention (Three.js `+Y` Up):**
   - **Origin `(0, 0, 0)`:** Center of Linton E. Allen Memorial Fountain inside Lake Eola.
   - **Axes:** `+X` = East, `-X` = West (Orange Ave skyline), `+Z` = South, `-Z` = North, `+Y` = Up.
   - **Scale:** `1.0` world unit ≈ `11.76 m` horizontal (`worldScale: 0.085`); downtown core spans roughly `[-75..75]` world units; Lake Eola radius is ~`14–18` world units with water plane at `y = 0.05`.
   - **Transforms:** Keep every object's Location `(0, 0, 0)`, Rotation `(0, 0, 0)`, and Scale `(1, 1, 1)` (`Ctrl+A → All Transforms` before export).

---

## 3. Required Scene Graph & Mesh Names

Keep total mesh count **`<= 10`** and total triangle count **`<= 45,000`**. Do **not** rename these exact object/mesh names—`OrlandoDiorama.tsx` and `optimize-glb.mjs` look them up verbatim:

| Mesh / Node Name | Role | Triangle Target | Material / Shader |
| --- | --- | --- | --- |
| `lake_eola_basin` | Flat water mesh at `y = 0.05` | ~900 – 1,500 | `LakeWaterMaterial` |
| `fountain_lake_eola` | Tiered Linton E. Allen Memorial Fountain at `(0, 0, 0)` | `< 2,000` | `StylizedCityMaterial` (`isHero = 1.0`) |
| `tower_200_s_orange` | 200 S Orange Ave (twin-turret postmodern crown) | `< 2,500` | `StylizedCityMaterial` (`isHero = 1.0`) |
| `tower_bank_of_america` | Bank of America Center (stepped diagonal spire) | `< 2,500` | `StylizedCityMaterial` (`isHero = 1.0`) |
| `tower_55_west` | 55 West (modernist vertical fin tower) | `< 2,500` | `StylizedCityMaterial` (`isHero = 1.0`) |
| `tower_vue_lake_eola` | The Vue at Lake Eola (angular NW lakeside tower) | `< 2,500` | `StylizedCityMaterial` (`isHero = 1.0`) |
| `tower_city_hall` | Orlando City Hall (rotunda dome & civic wings) | `< 2,500` | `StylizedCityMaterial` (`isHero = 1.0`) |
| `skyline_context_merged` | **All** surrounding blocks + plinth joined into **1 mesh** | `< 15,000` | `StylizedCityMaterial` (`isHero = 0.0`) |

---

## 4. Crown Sculpting & Shading Guidelines

- **Sharp Architectural Edges:** Use **Flat Shading** (or split normals at hard 90° edges) on walls, setbacks, and spires so `fwidth(vNormal)` in `stylized-city.frag.glsl` draws crisp editorial ink-crease lines. Use **Smooth Shading** only on curved domes (`fountain_lake_eola`, `tower_city_hall` rotunda).
- **No Image Textures:** Buildings and water rely exclusively on custom GLSL shaders. Do not embed PNG/JPEG diffuse or normal maps inside the `.glb`.
- **Single Context Mesh:** If you add or adjust surrounding downtown blocks, join them (`Ctrl+J`) back into `skyline_context_merged` so draw calls stay `<= 12`.

---

## 5. `TEXCOORD_0` UV Attribute Convention

Both `StylizedCityMaterial` and `LakeWaterMaterial` read custom data from the primary UV map (`TEXCOORD_0`, named `UVMap` in Blender):

### Buildings & Fountain (`StylizedCityMaterial`)
- **`uv.x` (`windowSeed`):** Per-building float in `[0.05..0.95]` used to vary procedural floor/window lighting patterns across adjacent buildings. When merging new blocks into `skyline_context_merged`, assign each building's UV island a distinct `u` coordinate before joining (`Ctrl+J`).
- **`uv.y` (`isHero`):**
  - `1.0` on `fountain_lake_eola` and the hero `tower_*` landmarks.
  - `0.0` on `skyline_context_merged`.

### Lake Eola Water (`LakeWaterMaterial`)
- **`uv.x` (`shoreDist`):** Normalized distance from bank to center:
  - `0.0` along the outer shoreline edge (renders the crisp `#fbfaf6` ink-foam contour where `shoreDist < 0.06`).
  - `1.0` at Lake Eola's center `(0, 0.05, 0)`.
- **`uv.y`:** Unused (`0.0`).
- Keep at least two concentric edge loops near `uv.x = 0.05` and `0.12` so 12-bit UV quantization produces a smooth shoreline foam band.

---

## 6. Exporting from Blender & Running `npm run assets:optimize`

1. Select all 8 required meshes (`A`).
2. **File → Export → glTF 2.0 (.glb/.gltf)**:
   - **Format:** `glTF Binary (.glb)`
   - **Include:** Selected Objects (or all scene objects if clean)
   - **Transform:** `+Y Up` checked
   - **Data → Mesh:** `Apply Modifiers` checked, `UVs` checked, `Normals` checked, `Tangents` unchecked
   - **Material:** `Materials: Export` (lightweight placeholder PBR or No Export — R3F assigns custom `ShaderMaterial`s at runtime)
   - **Compression:** Leave Draco **OFF** (Meshopt is applied in the next step)
3. Save directly to `public/models/orlando-diorama.glb`.
4. Run the optimizer and budget verification:

```bash
npm run assets:optimize
node scripts/check-budgets.mjs --require-assets
```

`npm run assets:optimize` runs `scripts/optimize-glb.mjs` (`dedup`, `weld`, `quantize`, and `EXT_meshopt_compression` at `level: 'medium'`) and fails loudly if:
- File size exceeds **250 KB**
- Total triangles exceed **45,000**
- Mesh count exceeds **10**
- Any of the 8 required mesh names is missing
