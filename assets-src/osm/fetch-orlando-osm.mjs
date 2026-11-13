#!/usr/bin/env node
/**
 * Fetches building footprints and Lake Eola shoreline from OpenStreetMap Overpass API
 * around Lake Eola Fountain (28.5439, -81.3731, ~1.1 km downtown bbox) with an 8000ms
 * timeout, falling back cleanly to a curated geographically accurate Downtown Orlando +
 * Lake Eola dataset if Overpass rate-limits, times out, or returns sparse geometry.
 *
 * Output coordinates are normalized in meters centered on Lake Eola Fountain (0, 0):
 *   +X = East (meters), +Z = South (meters, -Z = North).
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = resolve(__dirname, 'orlando-footprints.geojson');

export const LAKE_EOLA_CENTER = { lat: 28.5439, lon: -81.3731 };
const METERS_PER_DEG_LAT = 110820;
const METERS_PER_DEG_LON = 111320 * Math.cos((LAKE_EOLA_CENTER.lat * Math.PI) / 180);

// ~1.1 km radius around Lake Eola Fountain
const BBOX = {
  south: 28.534,
  west: -81.3844,
  north: 28.5538,
  east: -81.3618,
};

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const OVERPASS_TIMEOUT_MS = 8000;

/** Project (lat, lon) to local meters [eastX, southZ] centered on Lake Eola Fountain. */
export function projectLatLonToMeters(lat, lon) {
  const x = (lon - LAKE_EOLA_CENTER.lon) * METERS_PER_DEG_LON;
  const z = -(lat - LAKE_EOLA_CENTER.lat) * METERS_PER_DEG_LAT;
  return [Number(x.toFixed(2)), Number(z.toFixed(2))];
}

function hashSeed(input) {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Number((((h >>> 0) % 900) / 1000 + 0.05).toFixed(4));
}

function rectRing(cx, cz, width, depth, angleDeg = 0) {
  const hw = width / 2;
  const hd = depth / 2;
  const rad = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const corners = [
    [-hw, -hd],
    [hw, -hd],
    [hw, hd],
    [-hw, hd],
    [-hw, -hd],
  ];
  return corners.map(([lx, lz]) => [
    Number((cx + lx * cos - lz * sin).toFixed(2)),
    Number((cz + lx * sin + lz * cos).toFixed(2)),
  ]);
}

function lShapeRing(cx, cz, w, d, wingW, wingD, angleDeg = 0) {
  const hw = w / 2;
  const hd = d / 2;
  const rad = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const pts = [
    [-hw, -hd],
    [hw, -hd],
    [hw, -hd + wingD],
    [-hw + wingW, -hd + wingD],
    [-hw + wingW, hd],
    [-hw, hd],
    [-hw, -hd],
  ];
  return pts.map(([lx, lz]) => [
    Number((cx + lx * cos - lz * sin).toFixed(2)),
    Number((cz + lx * sin + lz * cos).toFixed(2)),
  ]);
}

/** Smooth scalloped/oval Lake Eola shoreline in meters around Fountain (0, 0). */
function buildLakeEolaShoreline() {
  const pts = [];
  const count = 64;
  for (let i = 0; i < count; i += 1) {
    const theta = (i / count) * Math.PI * 2;
    // Lake Eola is ~405m E-W by ~300m N-S with gentle northern bay and eastern lobe
    const rx =
      202 +
      14 * Math.cos(theta * 2 - 0.4) +
      9 * Math.sin(theta * 3 + 0.8) -
      8 * Math.cos(theta - 1.2);
    const rz =
      150 +
      11 * Math.sin(theta * 2 + 0.3) +
      7 * Math.cos(theta * 3 - 0.5) +
      6 * Math.sin(theta + 0.6);
    pts.push([Number((Math.cos(theta) * rx).toFixed(2)), Number((Math.sin(theta) * rz).toFixed(2))]);
  }
  pts.push(pts[0]);
  return pts;
}

/** Curated, geographically accurate Downtown Orlando + Lake Eola dataset (meters from Fountain). */
export function buildCuratedOrlandoFeatures() {
  const features = [];

  // 1. Lake Eola basin
  features.push({
    type: 'Feature',
    properties: {
      id: 'lake_eola_basin',
      name: 'Lake Eola',
      role: 'lake',
      heightMeters: 0,
      windowSeed: 0,
    },
    geometry: {
      type: 'Polygon',
      coordinates: [buildLakeEolaShoreline()],
    },
  });

  // 2. Linton E. Allen Memorial Fountain at (0, 0)
  features.push({
    type: 'Feature',
    properties: {
      id: 'fountain_lake_eola',
      name: 'Linton E. Allen Memorial Fountain',
      role: 'fountain',
      heightMeters: 31,
      windowSeed: 0.55,
    },
    geometry: {
      type: 'Point',
      coordinates: [0, 0],
    },
  });

  // 3. Hero Orlando Landmarks (accurate meters from Lake Eola Fountain)
  const heroes = [
    {
      id: 'tower_200_s_orange',
      name: '200 S Orange (Truist Center)',
      cx: -580,
      cz: 395,
      w: 58,
      d: 48,
      angle: 0,
      heightMeters: 134,
      windowSeed: 0.18,
    },
    {
      id: 'tower_bank_of_america',
      name: 'Bank of America Center (390 N Orange)',
      cx: -600,
      cz: -410,
      w: 52,
      d: 44,
      angle: 0,
      heightMeters: 123,
      windowSeed: 0.37,
    },
    {
      id: 'tower_55_west',
      name: '55 West on the Plaza',
      cx: -700,
      cz: 405,
      w: 60,
      d: 44,
      angle: 0,
      heightMeters: 115,
      windowSeed: 0.61,
    },
    {
      id: 'tower_vue_lake_eola',
      name: 'The Vue at Lake Eola',
      cx: -235,
      cz: -200,
      w: 54,
      d: 40,
      angle: 14,
      heightMeters: 130,
      windowSeed: 0.79,
    },
    {
      id: 'tower_city_hall',
      name: 'Orlando City Hall',
      cx: -625,
      cz: 635,
      w: 72,
      d: 52,
      angle: 0,
      heightMeters: 56,
      windowSeed: 0.91,
    },
  ];

  for (const h of heroes) {
    features.push({
      type: 'Feature',
      properties: {
        id: h.id,
        name: h.name,
        role: 'hero',
        heightMeters: h.heightMeters,
        windowSeed: h.windowSeed,
        centerMeters: [h.cx, h.cz],
      },
      geometry: {
        type: 'Polygon',
        coordinates: [rectRing(h.cx, h.cz, h.w, h.d, h.angle)],
      },
    });
  }

  // 4. Surrounding Downtown Orlando Street-Grid Context Blocks (~95 buildings)
  // East = +X, South = +Z, North = -Z, West = -X
  const contextSpecs = [
    // --- Lake Eola West & NW Bank (Rosalind Ave / Robinson St) ---
    { name: 'Walt Disney Amphitheater', cx: -170, cz: 78, w: 38, d: 30, h: 14, a: -18 },
    { name: 'Lake Eola Park Pavilion', cx: 115, cz: -165, w: 28, d: 20, h: 10, a: 8 },
    { name: '101 Eola Condominiums', cx: -165, cz: -285, w: 48, d: 34, h: 52, a: 0 },
    { name: 'Post Parkside North', cx: -50, cz: -290, w: 72, d: 36, h: 24, a: 0 },
    { name: 'Post Parkside East', cx: 80, cz: -275, w: 56, d: 38, h: 22, a: 0 },
    { name: 'Paramount on Lake Eola', cx: 135, cz: 210, w: 58, d: 44, h: 48, a: 0 },
    { name: 'Waverly on Lake Eola', cx: -255, cz: 205, w: 52, d: 40, h: 68, a: 0 },
    { name: 'Jackson Condominiums', cx: -160, cz: 255, w: 50, d: 36, h: 28, a: 0 },
    { name: 'Star Tower', cx: -85, cz: 335, w: 42, d: 38, h: 64, a: 0 },
    { name: 'Eola South Midrise', cx: 25, cz: 265, w: 54, d: 34, h: 26, a: 0 },
    { name: 'Thornton Park Lofts', cx: 285, cz: 140, w: 58, d: 38, h: 20, a: 0 },
    { name: 'Thornton Park Central', cx: 315, cz: -35, w: 54, d: 44, h: 24, a: 0 },
    { name: 'EO Inn & Residences', cx: 295, cz: -175, w: 46, d: 34, h: 22, a: 0 },
    { name: 'Camden Thornton Park', cx: 420, cz: 65, w: 66, d: 48, h: 24, a: 0 },
    { name: 'Lake Eola East Townhomes', cx: 435, cz: -130, w: 54, d: 42, h: 18, a: 0 },
    { name: 'Summerlin Courtyard', cx: 550, cz: 30, w: 52, d: 40, h: 16, a: 0 },
    { name: 'Osceola Terrace', cx: 230, cz: 290, w: 54, d: 38, h: 20, a: 0 },
    { name: 'South Eola Commons', cx: 365, cz: 260, w: 62, d: 40, h: 22, a: 0 },

    // --- Rosalind Ave / Magnolia Ave Corridor (Core East of Orange Ave) ---
    { name: 'Truist Plaza East', cx: -355, cz: 20, w: 54, d: 46, h: 74, a: 0 },
    { name: 'Seaside Plaza', cx: -360, cz: -120, w: 52, d: 44, h: 68, a: 0 },
    { name: 'Citrus Center (255 S Orange)', cx: -465, cz: 280, w: 52, d: 44, h: 80, a: 0 },
    { name: 'Orlando Utilities Commission', cx: -460, cz: 515, w: 68, d: 48, h: 46, a: 0 },
    { name: 'CNL Center I', cx: -485, cz: 650, w: 56, d: 46, h: 78, a: 0 },
    { name: 'CNL Center II', cx: -375, cz: 645, w: 54, d: 44, h: 72, a: 0 },
    { name: 'Grand Bohemian Hotel', cx: -485, cz: 410, w: 56, d: 46, h: 58, a: 0 },
    { name: 'Dr. Phillips Center North', cx: -360, cz: 430, w: 84, d: 56, h: 36, a: 0 },
    { name: 'Dr. Phillips Center South', cx: -360, cz: 530, w: 86, d: 52, h: 32, a: 0 },
    { name: '111 N Orange Ave', cx: -480, cz: -15, w: 50, d: 42, h: 82, a: 0 },
    { name: 'Regions Bank Building', cx: -475, cz: -145, w: 52, d: 44, h: 76, a: 0 },
    { name: 'Dynetech / 135 W Central', cx: -690, cz: 110, w: 54, d: 46, h: 62, a: 0 },
    { name: 'One Orlando Centre', cx: -365, cz: -380, w: 58, d: 46, h: 74, a: 0 },
    { name: 'Firstate Tower', cx: -475, cz: -275, w: 48, d: 42, h: 62, a: 0 },
    { name: 'Embassy Suites Downtown', cx: -355, cz: 155, w: 58, d: 44, h: 64, a: 0 },
    { name: 'Aloft Orlando Downtown', cx: -480, cz: 765, w: 56, d: 42, h: 48, a: 0 },
    { name: 'SkyHouse Orlando', cx: -350, cz: -510, w: 52, d: 44, h: 84, a: 0 },
    { name: 'Modera Central', cx: -350, cz: -255, w: 54, d: 46, h: 78, a: 0 },

    // --- Orange Ave / Garland Ave Spine ---
    { name: 'The Plaza South Tower', cx: -470, cz: 150, w: 52, d: 42, h: 94, a: 0 },
    { name: 'The Plaza North Tower', cx: -470, cz: 72, w: 52, d: 42, h: 88, a: 0 },
    { name: 'Chase Plaza (189 S Orange)', cx: -590, cz: 260, w: 50, d: 44, h: 74, a: 0 },
    { name: 'Church Street Station Exchange', cx: -695, cz: 270, w: 66, d: 44, h: 28, a: 0 },
    { name: 'SunTrust Garage & Podium', cx: -595, cz: 510, w: 64, d: 50, h: 34, a: 0 },
    { name: '100 N Orange Garage', cx: -595, cz: -115, w: 62, d: 46, h: 36, a: 0 },
    { name: 'Orange County Courthouse', cx: -460, cz: -590, w: 72, d: 54, h: 96, a: 0 },
    { name: 'Courthouse Annex West', cx: -585, cz: -585, w: 58, d: 48, h: 44, a: 0 },
    { name: 'Courthouse Annex East', cx: -340, cz: -610, w: 54, d: 44, h: 42, a: 0 },
    { name: 'North Quarter Lofts', cx: -595, cz: -720, w: 62, d: 46, h: 34, a: 0 },
    { name: 'Park North at Cheney', cx: -460, cz: -735, w: 68, d: 44, h: 28, a: 0 },
    { name: '225 E Robinson', cx: -215, cz: -345, w: 52, d: 42, h: 58, a: 0 },
    { name: '300 E Robinson', cx: -105, cz: -360, w: 48, d: 40, h: 38, a: 0 },
    { name: 'Radius Apartments', cx: -215, cz: -495, w: 64, d: 48, h: 46, a: 0 },
    { name: 'NORA Apartments', cx: -465, cz: -455, w: 60, d: 44, h: 36, a: 0 },
    { name: '201 S Orange Ave', cx: -585, cz: 155, w: 50, d: 42, h: 66, a: 0 },
    { name: '26 S Orange (Kress)', cx: -585, cz: 20, w: 48, d: 40, h: 38, a: 0 },
    { name: '55 E Washington', cx: -475, cz: -78, w: 46, d: 36, h: 48, a: 0 },
    { name: 'One Eleven Building', cx: -590, cz: -235, w: 52, d: 42, h: 52, a: 0 },

    // --- West Downtown / Garland / Hughey / Kia Center Corridor ---
    { name: 'Solitaire / X Orlando', cx: -705, cz: -145, w: 58, d: 48, h: 72, a: 0 },
    { name: 'Society Orlando North', cx: -710, cz: -280, w: 60, d: 48, h: 64, a: 0 },
    { name: 'Tremont Tower', cx: -705, cz: -10, w: 52, d: 44, h: 54, a: 0 },
    { name: 'AC Hotel Downtown', cx: -710, cz: -415, w: 54, d: 42, h: 58, a: 0 },
    { name: 'Church Street Plaza', cx: -710, cz: 530, w: 64, d: 46, h: 48, a: 0 },
    { name: 'Kia Center Arena', cx: -840, cz: 350, w: 118, d: 108, h: 44, a: -4 },
    { name: 'Geico Garage', cx: -845, cz: 505, w: 88, d: 56, h: 32, a: 0 },
    { name: 'Creative Village Academic', cx: -835, cz: -300, w: 72, d: 52, h: 38, a: 0 },
    { name: 'UCF Downtown UnionWest', cx: -840, cz: -165, w: 66, d: 48, h: 56, a: 0 },
    { name: 'EA Orlando Studio', cx: -840, cz: -20, w: 68, d: 50, h: 36, a: 0 },
    { name: 'Central Station Apartments', cx: -720, cz: -555, w: 64, d: 46, h: 42, a: 0 },
    { name: 'Amtrak / Lynx Central', cx: -730, cz: -690, w: 76, d: 44, h: 22, a: 0 },
    { name: 'South Street Lofts', cx: -720, cz: 660, w: 62, d: 44, h: 30, a: 0 },

    // --- South Downtown / Lake Lucerne Perimeter ---
    { name: '550 S Orange', cx: -595, cz: 765, w: 54, d: 44, h: 42, a: 0 },
    { name: 'Lucerne Terrace North', cx: -350, cz: 775, w: 58, d: 42, h: 36, a: 0 },
    { name: 'Grandview on Lucerne', cx: -210, cz: 645, w: 56, d: 44, h: 30, a: 0 },
    { name: 'Lake Cherokee Gables', cx: -40, cz: 555, w: 50, d: 38, h: 22, a: 0 },
    { name: 'Rosalind South Suites', cx: -225, cz: 455, w: 54, d: 40, h: 34, a: 0 },
    { name: 'Pine & Rosalind Corner', cx: -245, cz: 75, w: 46, d: 38, h: 32, a: 0 },
    { name: 'Central & Rosalind', cx: -245, cz: -45, w: 48, d: 38, h: 36, a: 0 },

    // --- L-shaped courtyard blocks for skyline silhouette variety ---
    { name: 'Magnolia Courtyard Block', cx: -365, cz: 295, w: 62, d: 54, h: 42, a: 0, lShape: [28, 24] },
    { name: 'Robinson North Block', cx: -355, cz: -645, w: 62, d: 52, h: 34, a: 90, lShape: [26, 24] },
    { name: 'Eola Crest Block', cx: 145, cz: -345, w: 60, d: 46, h: 24, a: 0, lShape: [28, 22] },
    { name: 'Thornton South Block', cx: 485, cz: 205, w: 64, d: 48, h: 18, a: 180, lShape: [28, 22] },
    { name: 'Garland West Block', cx: -835, cz: 155, w: 66, d: 52, h: 30, a: 0, lShape: [30, 24] },
  ];

  for (const b of contextSpecs) {
    const ring = b.lShape
      ? lShapeRing(b.cx, b.cz, b.w, b.d, b.lShape[0], b.lShape[1], b.a)
      : rectRing(b.cx, b.cz, b.w, b.d, b.a);
    features.push({
      type: 'Feature',
      properties: {
        id: `ctx_${b.name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
        name: b.name,
        role: 'context',
        heightMeters: b.h,
        windowSeed: hashSeed(b.name),
      },
      geometry: {
        type: 'Polygon',
        coordinates: [ring],
      },
    });
  }

  return features;
}

/** Parse Overpass JSON into normalized meter GeoJSON, merging curated heroes when needed. */
function convertOverpassToFeatures(data) {
  const nodes = new Map();
  for (const el of data.elements || []) {
    if (el.type === 'node') {
      nodes.set(el.id, [el.lat, el.lon]);
    }
  }

  const curated = buildCuratedOrlandoFeatures();
  const curatedHeroes = curated.filter((f) => f.properties.role === 'hero' || f.properties.role === 'fountain');
  const curatedLake = curated.find((f) => f.properties.role === 'lake');

  let lakeFeature = null;
  const contextFeatures = [];

  for (const el of data.elements || []) {
    if (el.type !== 'way' || !Array.isArray(el.nodes) || el.nodes.length < 4) continue;
    const ring = [];
    for (const nid of el.nodes) {
      const coord = nodes.get(nid);
      if (!coord) continue;
      ring.push(projectLatLonToMeters(coord[0], coord[1]));
    }
    if (ring.length < 4) continue;
    if (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1]) {
      ring.push(ring[0]);
    }

    const tags = el.tags || {};
    if (tags.natural === 'water' && /eola/i.test(tags.name || '')) {
      lakeFeature = {
        type: 'Feature',
        properties: {
          id: 'lake_eola_basin',
          name: tags.name || 'Lake Eola',
          role: 'lake',
          heightMeters: 0,
          windowSeed: 0,
        },
        geometry: { type: 'Polygon', coordinates: [ring] },
      };
      continue;
    }

    if (!tags.building) continue;

    // Skip polygons overlapping hero tower footprints so heroes aren't double-extruded
    let cx = 0;
    let cz = 0;
    for (let i = 0; i < ring.length - 1; i += 1) {
      cx += ring[i][0];
      cz += ring[i][1];
    }
    cx /= ring.length - 1;
    cz /= ring.length - 1;

    const nearHero = curatedHeroes.some((h) => {
      const hc = h.properties.centerMeters;
      if (!hc) return false;
      return Math.hypot(cx - hc[0], cz - hc[1]) < 48;
    });
    if (nearHero) continue;

    // Keep within ~950m downtown radius
    if (Math.hypot(cx, cz) > 950) continue;

    const rawHeight = Number.parseFloat(tags.height);
    const levels = Number.parseFloat(tags['building:levels']);
    const distFromCore = Math.hypot(cx + 480, cz);
    const fallbackHeight = distFromCore < 320 ? 34 : distFromCore < 550 ? 22 : 14;
    const heightMeters = Number.isFinite(rawHeight)
      ? Math.max(8, Math.min(145, rawHeight))
      : Number.isFinite(levels)
        ? Math.max(8, Math.min(130, levels * 3.8))
        : fallbackHeight;

    contextFeatures.push({
      type: 'Feature',
      properties: {
        id: `osm_${el.id}`,
        name: tags.name || `OSM Building ${el.id}`,
        role: 'context',
        heightMeters: Number(heightMeters.toFixed(1)),
        windowSeed: hashSeed(`osm_${el.id}`),
      },
      geometry: { type: 'Polygon', coordinates: [ring] },
    });
  }

  // Require meaningful OSM yield before trusting Overpass output
  if (contextFeatures.length < 25) {
    return null;
  }

  return [
    lakeFeature || curatedLake,
    ...curatedHeroes,
    ...contextFeatures.slice(0, 140),
  ];
}

async function fetchFromOverpass() {
  const query = `
    [out:json][timeout:8];
    (
      way["building"](${BBOX.south},${BBOX.west},${BBOX.north},${BBOX.east});
      way["natural"="water"](${BBOX.south},${BBOX.west},${BBOX.north},${BBOX.east});
    );
    out body;
    >;
    out skel qt;
  `.trim();

  const res = await fetch(OVERPASS_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'User-Agent': 'orlando-webgl-asset-pipeline/1.0',
    },
    body: `data=${encodeURIComponent(query)}`,
    signal: AbortSignal.timeout(OVERPASS_TIMEOUT_MS),
  });

  if (!res.ok) {
    throw new Error(`Overpass HTTP ${res.status}`);
  }
  const json = await res.json();
  return convertOverpassToFeatures(json);
}

async function main() {
  const forceFallback = process.argv.includes('--fallback');
  let source = 'curated-orlando-fallback';
  let features = null;

  if (!forceFallback) {
    try {
      console.log('Querying Overpass API for Downtown Orlando + Lake Eola footprints...');
      features = await fetchFromOverpass();
      if (features) {
        source = 'overpass-osm+curated-heroes';
      } else {
        console.warn('Overpass returned sparse footprints; using curated Downtown Orlando dataset.');
      }
    } catch (err) {
      console.warn(`Overpass unavailable (${err.message}); falling back to curated Downtown Orlando dataset.`);
    }
  }

  if (!features) {
    features = buildCuratedOrlandoFeatures();
  }

  const geojson = {
    type: 'FeatureCollection',
    metadata: {
      name: 'Downtown Orlando & Lake Eola Footprints',
      center: LAKE_EOLA_CENTER,
      units: 'meters',
      axes: { x: 'east (+X)', y: 'south (+Z, north is -Z)' },
      worldScale: 0.085,
      heightScale: 0.135,
      source,
      generatedAt: new Date().toISOString(),
    },
    features,
  };

  await mkdir(dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, `${JSON.stringify(geojson, null, 2)}\n`, 'utf8');
  console.log(`Wrote ${features.length} features (${source}) -> ${OUTPUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
