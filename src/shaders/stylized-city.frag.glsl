precision highp float;

varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vWorldPos;

uniform float uTime;
uniform float uTimeOfDay;
uniform float uStormIntensity;
uniform float uLightningFlash;
uniform float uInkReveal;
uniform vec3 uSunDir;
uniform float uReducedMotion;
uniform float uQualityLevel;

#include <noise>

void main() {
  float windowSeed = vUv.x;
  float isHero = vUv.y;

  vec3 N = normalize(vNormal);
  vec3 V = normalize(cameraPosition - vWorldPos);
  vec3 L = normalize(uSunDir);

  float t = clamp(uTimeOfDay, 0.0, 1.0);
  float stormBlend = clamp(uStormIntensity, 0.0, 1.0);
  float nightFactor = smoothstep(0.66, 0.85, t);
  float dayLight = 1.0 - smoothstep(0.62, 0.80, t);

  // 3-band editorial navy/cream shading
  vec3 shadowCol = vec3(0.024, 0.039, 0.110); // #060a1c
  vec3 midCol = mix(vec3(0.106, 0.165, 0.369), vec3(0.133, 0.204, 0.435), isHero); // #1b2a5e
  midCol = mix(midCol, vec3(0.055, 0.086, 0.200), nightFactor * 0.65 + stormBlend * 0.45);

  vec3 creamRim = vec3(0.984, 0.980, 0.965); // #fbfaf6
  vec3 warmAmber = vec3(0.965, 0.745, 0.439);
  vec3 coralRim = vec3(0.953, 0.569, 0.443);

  vec3 sunTint = mix(coralRim, warmAmber, smoothstep(0.12, 0.42, t));
  sunTint = mix(sunTint, creamRim, 0.45);
  vec3 rimCol = mix(sunTint, vec3(0.32, 0.42, 0.65), stormBlend * 0.7);
  rimCol = mix(rimCol, vec3(0.24, 0.31, 0.52), nightFactor * 0.75);

  float NdotL = dot(N, L);
  float bandMid = smoothstep(-0.18, 0.08, NdotL);
  float bandLit = smoothstep(0.38, 0.62, NdotL) * mix(1.0, 0.35, stormBlend) * mix(1.0, 0.25, nightFactor);

  vec3 baseCol = mix(shadowCol, midCol, bandMid);
  baseCol = mix(baseCol, rimCol, bandLit);

  // Subtle upward roof/fountain cream highlight + Fresnel rim on hero towers
  float roofBias = smoothstep(0.55, 0.90, N.y) * dayLight * (1.0 - stormBlend * 0.65);
  baseCol = mix(baseCol, rimCol, roofBias * 0.35);

  float fresnel = pow(1.0 - max(dot(N, V), 0.0), 3.2);
  baseCol += mix(creamRim, sunTint, 0.5) * fresnel * (0.12 + 0.16 * isHero) * (0.35 + 0.65 * dayLight);

  // Lightning flash rim spike during storm
  float flash = clamp(uLightningFlash, 0.0, 1.0) * (1.0 - uReducedMotion);
  baseCol += vec3(0.85, 0.92, 1.0) * flash * (0.28 + 0.55 * fresnel);

  // fwidth(vNormal) ink-crease edge accent
  vec3 dN = fwidth(vNormal);
  float crease = smoothstep(0.14, 0.48, length(dN));
  vec3 inkLineCol = mix(vec3(0.039, 0.071, 0.157), creamRim * 0.75, isHero * bandLit * 0.45);
  baseCol = mix(baseCol, inkLineCol, crease * 0.65);

  // World-space procedural lit window grid (vertical facades only, uTimeOfDay > 0.62)
  float facadeMask = 1.0 - smoothstep(0.35, 0.65, abs(N.y));
  if (uTimeOfDay > 0.62 && facadeMask > 0.01 && vWorldPos.y > 0.35) {
    float duskProgress = smoothstep(0.62, 0.84, uTimeOfDay);
    vec2 facadeCoord = abs(N.x) > abs(N.z) ? vWorldPos.zy : vWorldPos.xy;
    vec2 cellGrid = facadeCoord * vec2(0.58, 0.40);
    vec2 cellId = floor(cellGrid);
    vec2 cellUv = fract(cellGrid);

    float inPane = step(0.20, cellUv.x) * step(cellUv.x, 0.80) * step(0.24, cellUv.y) * step(cellUv.y, 0.74);
    float roomRand = hash21(cellId + vec2(windowSeed * 43.17, isHero * 13.7));
    float floorRand = hash21(vec2(cellId.y, windowSeed * 19.3));

    float litProb = mix(0.25, 0.68, isHero) * duskProgress;
    float isLit = step(1.0 - litProb, roomRand * 0.75 + floorRand * 0.25);

    // Subtle storm power flicker when reducedMotion is off
    float flicker = 1.0;
    if (uStormIntensity > 0.35 && uReducedMotion < 0.5) {
      float fHash = hash21(vec2(floor(uTime * 8.0), roomRand * 100.0));
      flicker = fHash > (0.94 - uStormIntensity * 0.06) ? 0.35 : 1.0;
    }

    vec3 warmCream = vec3(0.984, 0.980, 0.965); // #fbfaf6
    vec3 warmGold = vec3(1.000, 0.820, 0.400);  // #ffd166
    vec3 winCol = mix(warmGold, warmCream, hash21(cellId + vec2(7.1, 3.3)));
    float intensity = (0.75 + 0.45 * isHero) * flicker;
    baseCol += winCol * inPane * isLit * facadeMask * intensity;
  }

  // Ink reveal wipe matching sky & water
  if (uInkReveal < 0.999) {
    float inkNoise = fbm2(vWorldPos.xz * 0.08 + vec2(1.4, 2.9), uQualityLevel);
    float revealThreshold = mix(-0.15, 1.15, clamp(uInkReveal, 0.0, 1.0));
    float revealed = smoothstep(revealThreshold - 0.08, revealThreshold + 0.04, 1.0 - inkNoise);
    baseCol = mix(vec3(0.039, 0.071, 0.157), baseCol, revealed);
  }

  gl_FragColor = vec4(baseCol, 1.0);
}
