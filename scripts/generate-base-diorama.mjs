#!/usr/bin/env node
/**
 * Deterministic generator for the Downtown Orlando & Lake Eola 3D diorama (.glb)
 * and optional static fallback poster (.webp).
 *
 * Reads:  assets-src/osm/orlando-footprints.geojson
 * Writes: public/models/orlando-diorama.glb (uncompressed base; run scripts/optimize-glb.mjs next)
 *         public/images/poster-fallback.webp (when --poster is passed)
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import earcut from 'earcut';
import { Document, NodeIO } from '@gltf-transform/core';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(__dirname, '..');
const GEOJSON_PATH = resolve(ROOT_DIR, 'assets-src/osm/orlando-footprints.geojson');
const GLB_OUT_PATH = resolve(ROOT_DIR, 'public/models/orlando-diorama.glb');
const POSTER_OUT_PATH = resolve(ROOT_DIR, 'public/images/poster-fallback.webp');

/** Geometry accumulator with explicit outward-normal triangle winding enforcement. */
class MeshBuilder {
  constructor() {
    this.positions = [];
    this.normals = [];
    this.uvs = [];
    this.indices = [];
  }

  addVertex(px, py, pz, nx, ny, nz, u, v) {
    const idx = this.positions.length / 3;
    this.positions.push(px, py, pz);
    this.normals.push(nx, ny, nz);
    this.uvs.push(u, v);
    return idx;
  }

  /** Push triangle ensuring (p1 - p0) x (p2 - p0) aligns with normal. */
  pushTri(p0, p1, p2, normal, uv0, uv1, uv2) {
    const ax = p1[0] - p0[0];
    const ay = p1[1] - p0[1];
    const az = p1[2] - p0[2];
    const bx = p2[0] - p0[0];
    const by = p2[1] - p0[1];
    const bz = p2[2] - p0[2];

    const cx = ay * bz - az * by;
    const cy = az * bx - ax * bz;
    const cz = ax * by - ay * bx;
    const dot = cx * normal[0] + cy * normal[1] + cz * normal[2];

    const i0 = this.addVertex(p0[0], p0[1], p0[2], normal[0], normal[1], normal[2], uv0[0], uv0[1]);
    if (dot >= 0) {
      const i1 = this.addVertex(p1[0], p1[1], p1[2], normal[0], normal[1], normal[2], uv1[0], uv1[1]);
      const i2 = this.addVertex(p2[0], p2[1], p2[2], normal[0], normal[1], normal[2], uv2[0], uv2[1]);
      this.indices.push(i0, i1, i2);
    } else {
      const i2 = this.addVertex(p2[0], p2[1], p2[2], normal[0], normal[1], normal[2], uv2[0], uv2[1]);
      const i1 = this.addVertex(p1[0], p1[1], p1[2], normal[0], normal[1], normal[2], uv1[0], uv1[1]);
      this.indices.push(i0, i2, i1);
    }
  }

  pushQuad(p0, p1, p2, p3, normal, uv0, uv1, uv2, uv3) {
    this.pushTri(p0, p1, p2, normal, uv0, uv1, uv2);
    this.pushTri(p0, p2, p3, normal, uv0, uv2, uv3);
  }

  /** Extrude a 2D [x, z] polygon ring from yMin to yMax. */
  addExtrudedPolygon(ring, yMin, yMax, uv, { includeBottom = false } = {}) {
    // Strip closing duplicate vertex if present
    const pts = ring.slice();
    if (
      pts.length > 2 &&
      pts[0][0] === pts[pts.length - 1][0] &&
      pts[0][1] === pts[pts.length - 1][1]
    ) {
      pts.pop();
    }
    if (pts.length < 3) return;

    // Ensure positive signed area in XZ so outward wall normal is [dz, 0, -dx]
    let area = 0;
    for (let i = 0; i < pts.length; i += 1) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      area += a[0] * b[1] - b[0] * a[1];
    }
    if (area < 0) pts.reverse();

    // Roof cap via earcut
    const flat = [];
    for (const [x, z] of pts) flat.push(x, z);
    const tris = earcut(flat);
    for (let i = 0; i < tris.length; i += 3) {
      const a = pts[tris[i]];
      const b = pts[tris[i + 1]];
      const c = pts[tris[i + 2]];
      this.pushTri([a[0], yMax, a[1]], [b[0], yMax, b[1]], [c[0], yMax, c[1]], [0, 1, 0], uv, uv, uv);
    }

    if (includeBottom) {
      for (let i = 0; i < tris.length; i += 3) {
        const a = pts[tris[i]];
        const b = pts[tris[i + 1]];
        const c = pts[tris[i + 2]];
        this.pushTri([a[0], yMin, a[1]], [c[0], yMin, c[1]], [b[0], yMin, b[1]], [0, -1, 0], uv, uv, uv);
      }
    }

    // Side walls (flat shaded per face for crisp fwidth(vNormal) ink edges)
    for (let i = 0; i < pts.length; i += 1) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      const dx = b[0] - a[0];
      const dz = b[1] - a[1];
      const len = Math.hypot(dx, dz);
      if (len < 1e-5) continue;
      const nx = dz / len;
      const nz = -dx / len;
      this.pushQuad(
        [a[0], yMin, a[1]],
        [b[0], yMin, b[1]],
        [b[0], yMax, b[1]],
        [a[0], yMax, a[1]],
        [nx, 0, nz],
        uv,
        uv,
        uv,
        uv,
      );
    }
  }

  /** Add an oriented box centered at (cx, cz) spanning yMin..yMax. */
  addBox(cx, cz, width, depth, yMin, yMax, uv, angleDeg = 0) {
    const hw = width / 2;
    const hd = depth / 2;
    const rad = (angleDeg * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const ring = [
      [-hw, -hd],
      [hw, -hd],
      [hw, hd],
      [-hw, hd],
    ].map(([lx, lz]) => [cx + lx * cos - lz * sin, cz + lx * sin + lz * cos]);
    this.addExtrudedPolygon(ring, yMin, yMax, uv);
  }

  /** Add a tapered frustum/cylinder with optional flat or smooth normals. */
  addCylinder(cx, cz, rBottom, rTop, yMin, yMax, segments, uv, { smooth = false, angleOffset = 0 } = {}) {
    const ringBot = [];
    const ringTop = [];
    for (let i = 0; i < segments; i += 1) {
      const a = angleOffset + (i / segments) * Math.PI * 2;
      const cos = Math.cos(a);
      const sin = Math.sin(a);
      ringBot.push([cx + cos * rBottom, cz + sin * rBottom, cos, sin]);
      ringTop.push([cx + cos * rTop, cz + sin * rTop, cos, sin]);
    }

    const slopeY = (rBottom - rTop) / Math.max(0.001, yMax - yMin);
    for (let i = 0; i < segments; i += 1) {
      const j = (i + 1) % segments;
      const b0 = ringBot[i];
      const b1 = ringBot[j];
      const t1 = ringTop[j];
      const t0 = ringTop[i];

      if (smooth) {
        const len0 = Math.hypot(b0[2], slopeY, b0[3]);
        const n0 = [b0[2] / len0, slopeY / len0, b0[3] / len0];
        const len1 = Math.hypot(b1[2], slopeY, b1[3]);
        const n1 = [b1[2] / len1, slopeY / len1, b1[3] / len1];
        const i0 = this.addVertex(b0[0], yMin, b0[1], n0[0], n0[1], n0[2], uv[0], uv[1]);
        const i1 = this.addVertex(b1[0], yMin, b1[1], n1[0], n1[1], n1[2], uv[0], uv[1]);
        const i2 = this.addVertex(t1[0], yMax, t1[1], n1[0], n1[1], n1[2], uv[0], uv[1]);
        const i3 = this.addVertex(t0[0], yMax, t0[1], n0[0], n0[1], n0[2], uv[0], uv[1]);
        this.indices.push(i0, i2, i1, i0, i3, i2);
      } else {
        const midAngle = angleOffset + ((i + 0.5) / segments) * Math.PI * 2;
        const nx = Math.cos(midAngle);
        const nz = Math.sin(midAngle);
        const nLen = Math.hypot(nx, slopeY, nz);
        this.pushQuad(
          [b0[0], yMin, b0[1]],
          [b1[0], yMin, b1[1]],
          [t1[0], yMax, t1[1]],
          [t0[0], yMax, t0[1]],
          [nx / nLen, slopeY / nLen, nz / nLen],
          uv,
          uv,
          uv,
          uv,
        );
      }
    }

    if (rTop > 0.001) {
      const centerIdx = this.addVertex(cx, yMax, cz, 0, 1, 0, uv[0], uv[1]);
      for (let i = 0; i < segments; i += 1) {
        const j = (i + 1) % segments;
        const i1 = this.addVertex(ringTop[i][0], yMax, ringTop[i][1], 0, 1, 0, uv[0], uv[1]);
        const i2 = this.addVertex(ringTop[j][0], yMax, ringTop[j][1], 0, 1, 0, uv[0], uv[1]);
        this.indices.push(centerIdx, i2, i1);
      }
    }
  }

  /** Add a hemisphere/dome at (cx, yBase, cz). */
  addDome(cx, yBase, cz, radius, height, rings, segments, uv, { smooth = true } = {}) {
    const verts = [];
    for (let r = 0; r <= rings; r += 1) {
      const phi = (r / rings) * (Math.PI * 0.5);
      const y = yBase + Math.sin(phi) * height;
      const ringRadius = Math.cos(phi) * radius;
      const ny = Math.sin(phi);
      const nHoriz = Math.cos(phi);
      const row = [];
      for (let s = 0; s <= segments; s += 1) {
        const theta = (s / segments) * Math.PI * 2;
        const px = cx + Math.cos(theta) * ringRadius;
        const pz = cz + Math.sin(theta) * ringRadius;
        const nx = Math.cos(theta) * nHoriz;
        const nz = Math.sin(theta) * nHoriz;
        const len = Math.hypot(nx, ny * (radius / height), nz) || 1;
        row.push({
          pos: [px, y, pz],
          norm: smooth ? [nx / len, (ny * (radius / height)) / len, nz / len] : [nx, ny, nz],
          idx: smooth ? this.addVertex(px, y, pz, nx / len, (ny * (radius / height)) / len, nz / len, uv[0], uv[1]) : -1,
        });
      }
      verts.push(row);
    }

    for (let r = 0; r < rings; r += 1) {
      for (let s = 0; s < segments; s += 1) {
        const a = verts[r][s];
        const b = verts[r][s + 1];
        const c = verts[r + 1][s + 1];
        const d = verts[r + 1][s];
        if (smooth) {
          if (r < rings - 1) {
            this.indices.push(a.idx, c.idx, b.idx);
            this.indices.push(a.idx, d.idx, c.idx);
          } else {
            this.indices.push(a.idx, c.idx, b.idx);
          }
        } else {
          const avgN = [
            (a.norm[0] + b.norm[0] + c.norm[0]) / 3,
            (a.norm[1] + b.norm[1] + c.norm[1]) / 3,
            (a.norm[2] + b.norm[2] + c.norm[2]) / 3,
          ];
          this.pushTri(a.pos, b.pos, c.pos, avgN, uv, uv, uv);
          if (r < rings - 1) this.pushTri(a.pos, c.pos, d.pos, avgN, uv, uv, uv);
        }
      }
    }
  }

  /** Add a 4-sided pyramid spire from rectangle (w x d) at yBase up to apex at yTop. */
  addPyramid(cx, cz, width, depth, yBase, yTop, uv, angleDeg = 0) {
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
    ].map(([lx, lz]) => [cx + lx * cos - lz * sin, yBase, cz + lx * sin + lz * cos]);
    const apex = [cx, yTop, cz];

    for (let i = 0; i < 4; i += 1) {
      const p0 = corners[i];
      const p1 = corners[(i + 1) % 4];
      const ax = p1[0] - p0[0];
      const az = p1[2] - p0[2];
      const bx = apex[0] - p0[0];
      const by = apex[1] - p0[1];
      const bz = apex[2] - p0[2];
      let nx = -(az * by);
      let ny = az * bx - ax * bz;
      let nz = ax * by;
      const len = Math.hypot(nx, ny, nz) || 1;
      if (ny < 0) {
        nx = -nx;
        ny = -ny;
        nz = -nz;
      }
      this.pushTri(p0, p1, apex, [nx / len, ny / len, nz / len], uv, uv, uv);
    }
  }
}

/** Build `lake_eola_basin` mesh at y = 0.05 with shoreline distance uv.x (0.0 bank -> 1.0 center). */
function buildLakeEolaBasin(lakeFeature, worldScale) {
  const mb = new MeshBuilder();
  const rawRing = lakeFeature.geometry.coordinates[0].slice();
  if (rawRing.length > 2) rawRing.pop();

  const pts = rawRing.map(([x, z]) => [x * worldScale, z * worldScale]);
  // Ensure consistent CCW order in XZ
  let area = 0;
  for (let i = 0; i < pts.length; i += 1) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    area += a[0] * b[1] - b[0] * a[1];
  }
  if (area < 0) pts.reverse();

  const y = 0.05;
  // Dense rings near shoreline (0.0, 0.05, 0.12) ensure crisp quantized ink-foam threshold
  const ringTs = [0.0, 0.05, 0.12, 0.24, 0.42, 0.62, 0.82];
  const ringIndices = [];

  for (const t of ringTs) {
    const scale = 1 - t;
    const row = [];
    for (const [px, pz] of pts) {
      row.push(mb.addVertex(px * scale, y, pz * scale, 0, 1, 0, t, 0));
    }
    ringIndices.push(row);
  }

  const centerIdx = mb.addVertex(0, y, 0, 0, 1, 0, 1.0, 0);
  const n = pts.length;

  for (let r = 0; r < ringIndices.length - 1; r += 1) {
    const outer = ringIndices[r];
    const inner = ringIndices[r + 1];
    for (let i = 0; i < n; i += 1) {
      const j = (i + 1) % n;
      // Upward normal (+Y) winding for CCW XZ rings: (outer[i], inner[i], inner[j])
      mb.indices.push(outer[i], inner[j], inner[i]);
      mb.indices.push(outer[i], outer[j], inner[j]);
    }
  }

  const innerMost = ringIndices[ringIndices.length - 1];
  for (let i = 0; i < n; i += 1) {
    const j = (i + 1) % n;
    mb.indices.push(innerMost[i], innerMost[j], centerIdx);
  }

  return mb;
}

/** Build `fountain_lake_eola` tiered Linton E. Allen Memorial Fountain dome at (0, 0, 0). */
function buildFountain(uv) {
  const mb = new MeshBuilder();
  // Submerged concrete base plinth & wide stepped saucer
  mb.addCylinder(0, 0, 2.85, 2.65, -0.2, 0.35, 24, uv, { smooth: false });
  mb.addCylinder(0, 0, 1.35, 2.25, 0.35, 1.35, 24, uv, { smooth: true });
  // Mid-tier scalloped bowl
  mb.addCylinder(0, 0, 0.95, 1.65, 1.35, 2.05, 20, uv, { smooth: true });
  // 8 signature mid-century cantilevered ribs around lower basin
  for (let i = 0; i < 8; i += 1) {
    const angle = (i / 8) * 360;
    const rad = (angle * Math.PI) / 180;
    const rx = Math.cos(rad) * 1.65;
    const rz = Math.sin(rad) * 1.65;
    mb.addBox(rx, rz, 1.15, 0.16, 0.25, 1.45, uv, -angle);
  }
  // Upper iconic translucent-style dome & spire finial
  mb.addDome(0, 2.0, 0, 1.28, 1.65, 8, 24, uv, { smooth: true });
  mb.addCylinder(0, 0, 0.22, 0.04, 3.55, 4.45, 10, uv, { smooth: false });
  return mb;
}

/** Build the 5 hero Orlando landmark towers with distinctive crowns. */
function buildHeroTower(feature, worldScale, heightScale) {
  const mb = new MeshBuilder();
  const { id, heightMeters, windowSeed } = feature.properties;
  const uv = [windowSeed, 1.0];

  const ring = feature.geometry.coordinates[0].slice();
  if (ring.length > 2) ring.pop();
  let cx = 0;
  let cz = 0;
  for (const [x, z] of ring) {
    cx += x;
    cz += z;
  }
  cx = (cx / ring.length) * worldScale;
  cz = (cz / ring.length) * worldScale;
  const h = heightMeters * heightScale;

  if (id === 'tower_200_s_orange') {
    // SunTrust / Truist Center: podium + chamfered shaft + twin postmodern pyramid-capped turrets
    mb.addBox(cx, cz, 5.4, 4.6, 0, 2.8, uv);
    mb.addBox(cx, cz, 4.3, 3.7, 2.8, h * 0.78, uv);
    mb.addBox(cx, cz, 3.5, 2.9, h * 0.78, h * 0.87, uv);
    // Twin opposing turrets + lantern caps
    mb.addBox(cx - 0.95, cz - 0.65, 1.25, 1.25, h * 0.87, h * 0.97, uv);
    mb.addPyramid(cx - 0.95, cz - 0.65, 1.25, 1.25, h * 0.97, h * 1.06, uv);
    mb.addBox(cx + 0.95, cz + 0.65, 1.25, 1.25, h * 0.87, h * 0.97, uv);
    mb.addPyramid(cx + 0.95, cz + 0.65, 1.25, 1.25, h * 0.97, h * 1.06, uv);
    // Secondary corner pinnacles
    mb.addBox(cx + 0.95, cz - 0.65, 0.9, 0.9, h * 0.87, h * 0.94, uv);
    mb.addBox(cx - 0.95, cz + 0.65, 0.9, 0.9, h * 0.87, h * 0.94, uv);
  } else if (id === 'tower_bank_of_america') {
    // Bank of America Center: podium + main shaft + stepped diagonal terraces + spire
    mb.addBox(cx, cz, 4.8, 4.2, 0, 2.5, uv);
    mb.addBox(cx, cz, 3.9, 3.5, 2.5, h * 0.72, uv);
    // Stepped diagonal crown ascending toward NE corner
    mb.addBox(cx + 0.25, cz - 0.2, 3.2, 2.8, h * 0.72, h * 0.81, uv);
    mb.addBox(cx + 0.55, cz - 0.45, 2.3, 2.0, h * 0.81, h * 0.9, uv);
    mb.addBox(cx + 0.8, cz - 0.7, 1.4, 1.3, h * 0.9, h * 0.98, uv);
    mb.addPyramid(cx + 0.85, cz - 0.75, 0.85, 0.85, h * 0.98, h * 1.15, uv);
  } else if (id === 'tower_55_west') {
    // 55 West: broad base + slender modernist slab + vertical architectural fins + crown fin
    mb.addBox(cx, cz, 5.4, 4.0, 0, 2.7, uv);
    mb.addBox(cx, cz, 4.5, 2.5, 2.7, h * 0.92, uv);
    // Vertical facade fins along North/South faces
    for (const offset of [-1.5, -0.5, 0.5, 1.5]) {
      mb.addBox(cx + offset, cz, 0.28, 2.85, 2.7, h * 0.94, uv);
    }
    mb.addBox(cx - 0.6, cz, 2.8, 1.5, h * 0.92, h * 1.01, uv);
    mb.addBox(cx + 0.9, cz, 1.2, 0.45, h * 0.92, h * 1.07, uv);
  } else if (id === 'tower_vue_lake_eola') {
    // The Vue at Lake Eola: angled lakeside high-rise on NW bank + cantilevered step-backs + blade roof
    const ang = 14;
    mb.addBox(cx, cz, 4.8, 3.5, 0, 2.3, uv, ang);
    mb.addBox(cx, cz, 3.8, 2.7, 2.3, h * 0.76, uv, ang);
    mb.addBox(cx + 0.2, cz - 0.1, 3.2, 2.2, h * 0.76, h * 0.92, uv, ang);
    // Angular roof fin facing Lake Eola
    mb.addBox(cx + 0.3, cz - 0.15, 2.8, 0.75, h * 0.92, h * 1.04, uv, ang + 6);
    mb.addBox(cx - 0.6, cz + 0.2, 1.5, 1.4, h * 0.92, h * 0.98, uv, ang);
  } else if (id === 'tower_city_hall') {
    // Orlando City Hall: broad civic wings + cylindrical drum + iconic copper rotunda dome + cupola
    mb.addBox(cx, cz, 6.4, 4.4, 0, 2.3, uv);
    mb.addBox(cx - 1.9, cz, 2.2, 3.4, 2.3, 3.8, uv);
    mb.addBox(cx + 1.9, cz, 2.2, 3.4, 2.3, 3.8, uv);
    mb.addCylinder(cx, cz, 1.75, 1.65, 2.3, 6.0, 16, uv, { smooth: true });
    mb.addDome(cx, 6.0, cz, 1.62, 1.9, 6, 16, uv, { smooth: true });
    mb.addCylinder(cx, cz, 0.42, 0.36, 7.85, 8.65, 10, uv, { smooth: false });
    mb.addPyramid(cx, cz, 0.55, 0.55, 8.65, 9.35, uv);
  } else {
    const scaled = ring.map(([x, z]) => [x * worldScale, z * worldScale]);
    mb.addExtrudedPolygon(scaled, 0, h, uv);
  }

  return mb;
}

/** Build single merged `skyline_context_merged` (all context buildings + Lake Eola plinth). */
function buildContextMerged(lakeFeature, contextFeatures, worldScale, heightScale) {
  const mb = new MeshBuilder();

  // 1. Subtle architectural diorama ground plate with recessed Lake Eola basin (-0.35m)
  const lakeRing = lakeFeature.geometry.coordinates[0].slice();
  if (lakeRing.length > 2) lakeRing.pop();
  const lakePts = lakeRing.map(([x, z]) => [x * worldScale, z * worldScale]);

  let area = 0;
  for (let i = 0; i < lakePts.length; i += 1) {
    const a = lakePts[i];
    const b = lakePts[(i + 1) % lakePts.length];
    area += a[0] * b[1] - b[0] * a[1];
  }
  if (area < 0) lakePts.reverse();

  const nLake = lakePts.length;
  const plinthRadius = 86;
  const plinthUv = [0.02, 0.0];

  // Outer perimeter ring aligned radially with Lake Eola points
  const outerPts = lakePts.map(([lx, lz]) => {
    const theta = Math.atan2(lz, lx);
    return [Math.cos(theta) * plinthRadius, Math.sin(theta) * plinthRadius];
  });

  // Lake Eola recessed basin bed (y = -0.35) + sloped embankment up to y = 0.14 promenade
  const rimPts = lakePts.map(([lx, lz]) => [lx * 1.03, lz * 1.03]);
  for (let i = 0; i < nLake; i += 1) {
    const j = (i + 1) % nLake;
    const l0 = lakePts[i];
    const l1 = lakePts[j];
    const r0 = rimPts[i];
    const r1 = rimPts[j];
    const o0 = outerPts[i];
    const o1 = outerPts[j];

    // Sunken lake floor triangle fan around (0, -0.35, 0)
    mb.pushTri([l0[0], -0.35, l0[1]], [l1[0], -0.35, l1[1]], [0, -0.35, 0], [0, 1, 0], plinthUv, plinthUv, plinthUv);

    // Shoreline bank wall from y = -0.35 up to y = 0.16
    const dx = l1[0] - l0[0];
    const dz = l1[1] - l0[1];
    const len = Math.hypot(dx, dz) || 1;
    // Points inward toward lake center
    mb.pushQuad(
      [l0[0], -0.35, l0[1]],
      [l1[0], -0.35, l1[1]],
      [l1[0], 0.16, l1[1]],
      [l0[0], 0.16, l0[1]],
      [-dz / len, 0, dx / len],
      plinthUv,
      plinthUv,
      plinthUv,
      plinthUv,
    );

    // Promenade walk rim (y = 0.16 -> outer ground y = 0.0)
    mb.pushQuad(
      [l0[0], 0.16, l0[1]],
      [l1[0], 0.16, l1[1]],
      [r1[0], 0.0, r1[1]],
      [r0[0], 0.0, r0[1]],
      [0, 1, 0],
      plinthUv,
      plinthUv,
      plinthUv,
      plinthUv,
    );

    // Ground terrace out to diorama rim (y = 0.0)
    mb.pushQuad(
      [r0[0], 0.0, r0[1]],
      [r1[0], 0.0, r1[1]],
      [o1[0], 0.0, o1[1]],
      [o0[0], 0.0, o0[1]],
      [0, 1, 0],
      plinthUv,
      plinthUv,
      plinthUv,
      plinthUv,
    );

    // Outer diorama bevel skirt (y = 0.0 down to y = -1.2)
    const odx = o1[0] - o0[0];
    const odz = o1[1] - o0[1];
    const olen = Math.hypot(odx, odz) || 1;
    mb.pushQuad(
      [o0[0], -1.2, o0[1]],
      [o1[0], -1.2, o1[1]],
      [o1[0], 0.0, o1[1]],
      [o0[0], 0.0, o0[1]],
      [odz / olen, 0, -odx / olen],
      plinthUv,
      plinthUv,
      plinthUv,
      plinthUv,
    );
  }

  // 2. Extrude all surrounding downtown context buildings into the single merged mesh
  for (const feat of contextFeatures) {
    const ring = feat.geometry.coordinates[0];
    if (!Array.isArray(ring) || ring.length < 4) continue;
    const scaled = ring.map(([x, z]) => [x * worldScale, z * worldScale]);
    const h = Math.max(1.0, (feat.properties.heightMeters || 18) * heightScale);
    const uv = [feat.properties.windowSeed ?? 0.5, 0.0];

    mb.addExtrudedPolygon(scaled, 0, h, uv);

    // Add subtle rooftop mechanical penthouse on taller context towers for richer skyline
    if (h >= 7.0) {
      const pts = scaled.slice(0, -1);
      let cx = 0;
      let cz = 0;
      let minX = Infinity;
      let maxX = -Infinity;
      let minZ = Infinity;
      let maxZ = -Infinity;
      for (const [px, pz] of pts) {
        cx += px;
        cz += pz;
        if (px < minX) minX = px;
        if (px > maxX) maxX = px;
        if (pz < minZ) minZ = pz;
        if (pz > maxZ) maxZ = pz;
      }
      cx /= pts.length;
      cz /= pts.length;
      const pw = Math.max(1.0, (maxX - minX) * 0.48);
      const pd = Math.max(1.0, (maxZ - minZ) * 0.48);
      mb.addBox(cx, cz, pw, pd, h, h + Math.min(1.1, h * 0.08), uv);
    }
  }

  return mb;
}

/** Attach a MeshBuilder to a glTF Document as a named Node + Mesh. */
function appendMeshToDoc(doc, buffer, name, builder, material) {
  const posAcc = doc
    .createAccessor(`${name}_pos`)
    .setType('VEC3')
    .setArray(new Float32Array(builder.positions))
    .setBuffer(buffer);
  const normAcc = doc
    .createAccessor(`${name}_norm`)
    .setType('VEC3')
    .setArray(new Float32Array(builder.normals))
    .setBuffer(buffer);
  const uvAcc = doc
    .createAccessor(`${name}_uv`)
    .setType('VEC2')
    .setArray(new Float32Array(builder.uvs))
    .setBuffer(buffer);

  const IndexArray = builder.positions.length / 3 > 65535 ? Uint32Array : Uint16Array;
  const idxAcc = doc
    .createAccessor(`${name}_idx`)
    .setType('SCALAR')
    .setArray(new IndexArray(builder.indices))
    .setBuffer(buffer);

  const prim = doc
    .createPrimitive()
    .setAttribute('POSITION', posAcc)
    .setAttribute('NORMAL', normAcc)
    .setAttribute('TEXCOORD_0', uvAcc)
    .setIndices(idxAcc)
    .setMaterial(material);

  const mesh = doc.createMesh(name).addPrimitive(prim);
  const node = doc.createNode(name).setMesh(mesh);
  doc.getRoot().listScenes()[0].addChild(node);
}

/** Generate editorial navy + cream Orlando & Lake Eola fallback poster (1600x900, <= 65 KB). */
export async function generateFallbackPoster() {
  const { default: sharp } = await import('sharp');

  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900" width="1600" height="900">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#060a1c"/>
      <stop offset="52%" stop-color="#0b1437"/>
      <stop offset="82%" stop-color="#172459"/>
      <stop offset="100%" stop-color="#2c294f"/>
    </linearGradient>
    <radialGradient id="dawnGlow" cx="62%" cy="62%" r="48%">
      <stop offset="0%" stop-color="#e8925c" stop-opacity="0.45"/>
      <stop offset="48%" stop-color="#c96f4b" stop-opacity="0.16"/>
      <stop offset="100%" stop-color="#0b1437" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="lake" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#131f4c"/>
      <stop offset="45%" stop-color="#0b1437"/>
      <stop offset="100%" stop-color="#060a1c"/>
    </linearGradient>
    <radialGradient id="fountainGlow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#fbfaf6" stop-opacity="0.55"/>
      <stop offset="45%" stop-color="#ffd166" stop-opacity="0.22"/>
      <stop offset="100%" stop-color="#0b1437" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <!-- Sky & Dawn Wash -->
  <rect width="1600" height="900" fill="url(#sky)"/>
  <rect width="1600" height="620" fill="url(#dawnGlow)"/>

  <!-- Subtle Architectural Drafting Lines -->
  <g stroke="#fbfaf6" stroke-opacity="0.06" stroke-width="1">
    <line x1="0" y1="180" x2="1600" y2="180"/>
    <line x1="0" y1="360" x2="1600" y2="360"/>
    <line x1="0" y1="540" x2="1600" y2="540"/>
    <line x1="320" y1="0" x2="320" y2="900"/>
    <line x1="800" y1="0" x2="800" y2="900"/>
    <line x1="1280" y1="0" x2="1280" y2="900"/>
  </g>

  <!-- Distant Context Skyline -->
  <g fill="#080e28" stroke="#fbfaf6" stroke-opacity="0.16" stroke-width="1.2">
    <rect x="60" y="455" width="70" height="110"/>
    <rect x="145" y="410" width="85" height="155"/>
    <rect x="245" y="440" width="60" height="125"/>
    <rect x="330" y="385" width="78" height="180"/>
    <rect x="425" y="430" width="65" height="135"/>
    <rect x="595" y="415" width="76" height="150"/>
    <rect x="755" y="395" width="70" height="170"/>
    <rect x="920" y="420" width="80" height="145"/>
    <rect x="1110" y="445" width="72" height="120"/>
    <rect x="1285" y="465" width="88" height="100"/>
    <rect x="1395" y="485" width="110" height="80"/>
  </g>

  <!-- Hero Landmark 1: 55 West -->
  <g>
    <rect x="295" y="255" width="78" height="310" fill="#101b47" stroke="#fbfaf6" stroke-opacity="0.45" stroke-width="1.6"/>
    <line x1="315" y1="255" x2="315" y2="565" stroke="#fbfaf6" stroke-opacity="0.28" stroke-width="1.2"/>
    <line x1="334" y1="255" x2="334" y2="565" stroke="#fbfaf6" stroke-opacity="0.28" stroke-width="1.2"/>
    <line x1="353" y1="255" x2="353" y2="565" stroke="#fbfaf6" stroke-opacity="0.28" stroke-width="1.2"/>
    <rect x="305" y="232" width="46" height="23" fill="#182760" stroke="#fbfaf6" stroke-opacity="0.5"/>
  </g>

  <!-- Hero Landmark 2: 200 S Orange (Twin Postmodern Turrets) -->
  <g>
    <rect x="495" y="195" width="96" height="370" fill="#111d4c" stroke="#fbfaf6" stroke-opacity="0.65" stroke-width="1.8"/>
    <rect x="506" y="160" width="74" height="35" fill="#16255c" stroke="#fbfaf6" stroke-opacity="0.65" stroke-width="1.5"/>
    <rect x="508" y="122" width="24" height="38" fill="#192a68" stroke="#fbfaf6" stroke-opacity="0.8"/>
    <polygon points="508,122 520,92 532,122" fill="#fbfaf6" fill-opacity="0.88"/>
    <rect x="554" y="122" width="24" height="38" fill="#192a68" stroke="#fbfaf6" stroke-opacity="0.8"/>
    <polygon points="554,122 566,92 578,122" fill="#fbfaf6" fill-opacity="0.88"/>
  </g>

  <!-- Hero Landmark 3: City Hall Rotunda Dome -->
  <g>
    <rect x="655" y="455" width="115" height="110" fill="#0f1a44" stroke="#fbfaf6" stroke-opacity="0.45" stroke-width="1.5"/>
    <rect x="687" y="405" width="52" height="50" fill="#152459" stroke="#fbfaf6" stroke-opacity="0.55" stroke-width="1.5"/>
    <path d="M687,405 A26,28 0 0,1 739,405 Z" fill="#e8925c" fill-opacity="0.72" stroke="#fbfaf6" stroke-opacity="0.85" stroke-width="1.5"/>
    <rect x="709" y="368" width="8" height="14" fill="#fbfaf6" fill-opacity="0.9"/>
  </g>

  <!-- Hero Landmark 4: Bank of America Center (Stepped Diagonal Spire) -->
  <g>
    <rect x="830" y="210" width="90" height="355" fill="#111d4c" stroke="#fbfaf6" stroke-opacity="0.65" stroke-width="1.8"/>
    <rect x="845" y="176" width="68" height="34" fill="#16255c" stroke="#fbfaf6" stroke-opacity="0.7"/>
    <rect x="862" y="146" width="44" height="30" fill="#1b2d6d" stroke="#fbfaf6" stroke-opacity="0.75"/>
    <polygon points="878,146 894,82 902,146" fill="#fbfaf6" fill-opacity="0.9"/>
  </g>

  <!-- Hero Landmark 5: The Vue at Lake Eola (NW Bank) -->
  <g>
    <polygon points="1015,565 1015,215 1095,190 1095,565" fill="#132154" stroke="#fbfaf6" stroke-opacity="0.7" stroke-width="1.8"/>
    <line x1="1015" y1="215" x2="1095" y2="190" stroke="#fbfaf6" stroke-width="2.2"/>
    <line x1="1040" y1="208" x2="1040" y2="565" stroke="#fbfaf6" stroke-opacity="0.22"/>
    <line x1="1068" y1="199" x2="1068" y2="565" stroke="#fbfaf6" stroke-opacity="0.22"/>
  </g>

  <!-- Warm Procedural Lit Window Accents -->
  <g fill="#ffd166" fill-opacity="0.78">
    <rect x="512" y="220" width="8" height="5"/><rect x="530" y="220" width="8" height="5"/><rect x="562" y="220" width="8" height="5"/>
    <rect x="520" y="246" width="8" height="5"/><rect x="548" y="246" width="8" height="5"/><rect x="512" y="274" width="8" height="5"/>
    <rect x="542" y="298" width="8" height="5"/><rect x="566" y="318" width="8" height="5"/><rect x="524" y="346" width="8" height="5"/>
    <rect x="846" y="236" width="8" height="5"/><rect x="872" y="236" width="8" height="5"/><rect x="894" y="264" width="8" height="5"/>
    <rect x="854" y="292" width="8" height="5"/><rect x="884" y="316" width="8" height="5"/><rect x="844" y="344" width="8" height="5"/>
    <rect x="1030" y="244" width="10" height="5"/><rect x="1056" y="268" width="10" height="5"/><rect x="1028" y="298" width="10" height="5"/>
    <rect x="1062" y="324" width="10" height="5"/><rect x="1036" y="352" width="10" height="5"/><rect x="312" y="286" width="8" height="5"/>
    <rect x="336" y="314" width="8" height="5"/><rect x="352" y="342" width="8" height="5"/>
  </g>

  <!-- Lake Eola Shoreline & Water Basin -->
  <path d="M 0,565 L 1600,565 L 1600,900 L 0,900 Z" fill="url(#lake)"/>
  <path d="M 0,566 Q 400,558 800,568 T 1600,564" fill="none" stroke="#fbfaf6" stroke-opacity="0.85" stroke-width="2.4"/>
  <path d="M 110,602 Q 480,590 820,604 T 1490,598" fill="none" stroke="#fbfaf6" stroke-opacity="0.22" stroke-width="1.2"/>

  <!-- Linton E. Allen Memorial Fountain Centerpiece & Reflection -->
  <ellipse cx="800" cy="645" rx="185" ry="62" fill="url(#fountainGlow)"/>
  <g transform="translate(800, 628)">
    <!-- Plume & Water Reflection -->
    <ellipse cx="0" cy="24" rx="115" ry="18" fill="none" stroke="#fbfaf6" stroke-opacity="0.55" stroke-width="1.6"/>
    <ellipse cx="0" cy="28" rx="165" ry="25" fill="none" stroke="#fbfaf6" stroke-opacity="0.25" stroke-width="1.2"/>
    <line x1="0" y1="-58" x2="0" y2="-88" stroke="#fbfaf6" stroke-opacity="0.85" stroke-width="2.4"/>
    <!-- Tiered Saucer + Dome -->
    <ellipse cx="0" cy="14" rx="58" ry="10" fill="#17265c" stroke="#fbfaf6" stroke-width="1.8"/>
    <ellipse cx="0" cy="-2" rx="40" ry="7" fill="#1f3173" stroke="#fbfaf6" stroke-width="1.6"/>
    <path d="M -28,-6 A 28,28 0 0,1 28,-6 Z" fill="#fbfaf6" fill-opacity="0.92"/>
  </g>

  <!-- Subtle Horizontal Water Ripples -->
  <g stroke="#fbfaf6" stroke-opacity="0.18" stroke-width="1.2">
    <line x1="220" y1="680" x2="480" y2="680"/>
    <line x1="1080" y1="690" x2="1380" y2="690"/>
    <line x1="420" y1="742" x2="1180" y2="742"/>
    <line x1="560" y1="790" x2="1040" y2="790"/>
  </g>
</svg>`.trim();

  await mkdir(dirname(POSTER_OUT_PATH), { recursive: true });
  await sharp(Buffer.from(svg))
    .resize(1600, 900)
    .webp({ quality: 84, effort: 6 })
    .toFile(POSTER_OUT_PATH);

  const { stat } = await import('node:fs/promises');
  const info = await stat(POSTER_OUT_PATH);
  console.log(`Generated ${POSTER_OUT_PATH} (${(info.size / 1024).toFixed(2)} KB)`);
}

async function main() {
  const onlyPoster = process.argv.includes('--only-poster');
  const withPoster = process.argv.includes('--poster') || process.argv.includes('--with-poster');

  if (onlyPoster) {
    await generateFallbackPoster();
    return;
  }

  const raw = await readFile(GEOJSON_PATH, 'utf8');
  const geojson = JSON.parse(raw);
  const worldScale = geojson.metadata?.worldScale ?? 0.085;
  const heightScale = geojson.metadata?.heightScale ?? 0.135;

  const lakeFeature = geojson.features.find((f) => f.properties?.id === 'lake_eola_basin');
  const fountainFeature = geojson.features.find((f) => f.properties?.id === 'fountain_lake_eola');
  const heroFeatures = geojson.features.filter((f) => f.properties?.role === 'hero');
  const contextFeatures = geojson.features.filter((f) => f.properties?.role === 'context');

  if (!lakeFeature) {
    throw new Error('Missing lake_eola_basin feature in orlando-footprints.geojson');
  }

  const doc = new Document();
  doc.createScene('OrlandoDiorama');
  const buffer = doc.createBuffer('orlando_buffer');

  const waterMat = doc
    .createMaterial('lake_water_mat')
    .setBaseColorFactor([0.07, 0.13, 0.31, 1.0])
    .setRoughnessFactor(0.15)
    .setMetallicFactor(0.1);

  const heroMat = doc
    .createMaterial('stylized_hero_mat')
    .setBaseColorFactor([0.98, 0.98, 0.96, 1.0])
    .setRoughnessFactor(0.7)
    .setMetallicFactor(0.05);

  const cityMat = doc
    .createMaterial('stylized_city_mat')
    .setBaseColorFactor([0.11, 0.16, 0.37, 1.0])
    .setRoughnessFactor(0.8)
    .setMetallicFactor(0.05);

  // 1. Lake Eola basin
  appendMeshToDoc(
    doc,
    buffer,
    'lake_eola_basin',
    buildLakeEolaBasin(lakeFeature, worldScale),
    waterMat,
  );

  // 2. Linton E. Allen Memorial Fountain
  const fountainSeed = fountainFeature?.properties?.windowSeed ?? 0.55;
  appendMeshToDoc(
    doc,
    buffer,
    'fountain_lake_eola',
    buildFountain([fountainSeed, 1.0]),
    heroMat,
  );

  // 3. 5 Hero Orlando Landmarks
  for (const hero of heroFeatures) {
    appendMeshToDoc(
      doc,
      buffer,
      hero.properties.id,
      buildHeroTower(hero, worldScale, heightScale),
      heroMat,
    );
  }

  // 4. Merged Downtown Orlando Context + Diorama Ground Plinth
  appendMeshToDoc(
    doc,
    buffer,
    'skyline_context_merged',
    buildContextMerged(lakeFeature, contextFeatures, worldScale, heightScale),
    cityMat,
  );

  await mkdir(dirname(GLB_OUT_PATH), { recursive: true });
  const io = new NodeIO();
  const glbBytes = await io.writeBinary(doc);
  await writeFile(GLB_OUT_PATH, glbBytes);

  console.log(
    `Generated base diorama -> ${GLB_OUT_PATH} (${(glbBytes.byteLength / 1024).toFixed(2)} KB, ${doc.getRoot().listMeshes().length} meshes)`,
  );

  if (withPoster) {
    await generateFallbackPoster();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
