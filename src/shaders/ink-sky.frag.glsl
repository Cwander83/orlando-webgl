precision highp float;

varying vec3 vWorldDir;
varying vec2 vUv;

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
  vec3 dir = normalize(vWorldDir);
  vec3 sunDir = normalize(uSunDir);
  float elev = clamp(dir.y * 0.5 + 0.5, 0.0, 1.0);
  float horizonMask = smoothstep(-0.08, 0.42, dir.y);
  float zenithMask = smoothstep(0.10, 0.88, dir.y);

  // 4-act sky palette:
  // Act 1 Dawn (0.00 - 0.25): coral horizon -> deep navy zenith
  vec3 dawnHorizon = vec3(0.949, 0.518, 0.400); // warm coral
  vec3 dawnMid = vec3(0.412, 0.286, 0.451);
  vec3 dawnZenith = vec3(0.043, 0.078, 0.216);  // #0b1437 navy

  // Act 2 Golden (0.25 - 0.50): warm copper horizon -> rich indigo zenith
  vec3 goldenHorizon = vec3(0.910, 0.525, 0.275); // warm copper
  vec3 goldenMid = vec3(0.329, 0.341, 0.545);
  vec3 goldenZenith = vec3(0.067, 0.110, 0.271);

  // Act 3 Storm / Squall (0.50 - 0.75 + uStormIntensity): brooding #060a1c cumulus
  vec3 stormHorizon = vec3(0.176, 0.243, 0.365);
  vec3 stormMid = vec3(0.067, 0.102, 0.212);
  vec3 stormZenith = vec3(0.024, 0.039, 0.110); // #060a1c

  // Act 4 Night (0.75 - 1.00): #060a1c ink + warm distant horizon glow
  vec3 nightHorizon = vec3(0.133, 0.165, 0.310);
  vec3 nightMid = vec3(0.039, 0.071, 0.157);
  vec3 nightZenith = vec3(0.024, 0.039, 0.110); // #060a1c

  float t = clamp(uTimeOfDay, 0.0, 1.0);
  float wDawnToGolden = smoothstep(0.16, 0.32, t);
  float wGoldenToStorm = smoothstep(0.42, 0.58, t);
  float wStormToNight = smoothstep(0.68, 0.82, t);

  vec3 actHorizon = mix(dawnHorizon, goldenHorizon, wDawnToGolden);
  actHorizon = mix(actHorizon, stormHorizon, wGoldenToStorm);
  actHorizon = mix(actHorizon, nightHorizon, wStormToNight);

  vec3 actMid = mix(dawnMid, goldenMid, wDawnToGolden);
  actMid = mix(actMid, stormMid, wGoldenToStorm);
  actMid = mix(actMid, nightMid, wStormToNight);

  vec3 actZenith = mix(dawnZenith, goldenZenith, wDawnToGolden);
  actZenith = mix(actZenith, stormZenith, wGoldenToStorm);
  actZenith = mix(actZenith, nightZenith, wStormToNight);

  // Blend storm override when stormIntensity > 0
  float stormBlend = clamp(uStormIntensity, 0.0, 1.0);
  vec3 horizonCol = mix(actHorizon, stormHorizon, stormBlend * 0.85);
  vec3 midCol = mix(actMid, stormMid, stormBlend * 0.85);
  vec3 zenithCol = mix(actZenith, stormZenith, stormBlend * 0.90);

  vec3 skyCol = mix(horizonCol, midCol, horizonMask);
  skyCol = mix(skyCol, zenithCol, zenithMask);

  // Sun disc & Mie glow (fades at night and under heavy storm cover)
  float sunDot = max(dot(dir, sunDir), 0.0);
  float dayLight = 1.0 - smoothstep(0.62, 0.78, t);
  float sunVis = dayLight * (1.0 - stormBlend * 0.82);
  float sunHalo = pow(sunDot, 10.0) * 0.45 + pow(sunDot, 96.0) * 0.85;
  vec3 sunTint = mix(vec3(0.984, 0.980, 0.965), vec3(1.0, 0.68, 0.42), smoothstep(0.10, 0.45, t));
  skyCol += sunTint * sunHalo * sunVis;

  // Procedural starfield at night (above horizon)
  float nightFactor = smoothstep(0.68, 0.85, t) * (1.0 - stormBlend * 0.9);
  if (nightFactor > 0.01 && dir.y > 0.04) {
    vec2 starUv = vec2(atan(dir.z, dir.x), asin(clamp(dir.y, -1.0, 1.0))) * vec2(26.0, 26.0);
    vec2 starCell = floor(starUv);
    vec2 starFract = fract(starUv) - 0.5;
    float starRand = hash21(starCell);
    if (starRand > 0.955) {
      float starDist = length(starFract - (hash22(starCell) - 0.5) * 0.45);
      float twinkle = uReducedMotion > 0.5
        ? 1.0
        : 0.75 + 0.25 * sin(uTime * 2.4 + starRand * 62.8);
      float starMask = smoothstep(0.14, 0.02, starDist) * smoothstep(0.04, 0.28, dir.y);
      skyCol += vec3(0.984, 0.980, 0.965) * starMask * nightFactor * twinkle * 0.9;
    }
  }

  // Night horizon city glow
  float horizonBand = exp(-abs(dir.y) * 9.0);
  skyCol += vec3(0.95, 0.74, 0.42) * horizonBand * nightFactor * 0.14;

  // Cumulus cloud FBM layer (max 2 octaves, 1 when uQualityLevel < 1.0)
  float animTime = uReducedMotion > 0.5 ? 0.0 : uTime;
  vec3 cloudCoord = dir * 2.6 + vec3(animTime * 0.022, 0.0, animTime * 0.014);
  float cloudNoise = fbm3(cloudCoord, uQualityLevel);
  float cloudCoverage = mix(0.56, 0.34, stormBlend);
  float cloudMask = smoothstep(cloudCoverage, cloudCoverage + 0.24, cloudNoise) * smoothstep(0.0, 0.25, dir.y + 0.08);
  vec3 cloudLit = mix(vec3(0.984, 0.980, 0.965), vec3(0.95, 0.68, 0.48), smoothstep(0.15, 0.45, t));
  cloudLit = mix(cloudLit, vec3(0.12, 0.16, 0.26), nightFactor);
  vec3 stormCloudCol = vec3(0.024, 0.039, 0.110); // #060a1c
  vec3 finalCloudCol = mix(cloudLit * 0.78, stormCloudCol, stormBlend * 0.92);
  skyCol = mix(skyCol, finalCloudCol, cloudMask * mix(0.45, 0.88, stormBlend));

  // Lightning flash burst (clamped to 0 on CPU when reducedMotion is true)
  float flash = clamp(uLightningFlash, 0.0, 1.0) * (1.0 - uReducedMotion);
  float cloudGapFlash = mix(0.35, 1.0, 1.0 - cloudMask * 0.55);
  skyCol += vec3(0.86, 0.92, 1.0) * flash * cloudGapFlash * 0.85;

  // Organic FBM ink-splatter reveal mask (uInkReveal: 0..1 in #0a1228 ink)
  if (uInkReveal < 0.999) {
    float inkFbm = fbm3(dir * 3.8 + vec3(1.7, -0.4, 2.3), uQualityLevel);
    float radialBias = clamp(elev * 0.35 + 0.35, 0.0, 1.0);
    float splatterField = mix(inkFbm, radialBias, 0.32);
    float revealThreshold = mix(-0.18, 1.18, clamp(uInkReveal, 0.0, 1.0));
    float revealed = smoothstep(revealThreshold - 0.09, revealThreshold + 0.04, 1.0 - splatterField);
    vec3 inkColor = vec3(0.039, 0.071, 0.157); // #0a1228
    skyCol = mix(inkColor, skyCol, revealed);
  }

  gl_FragColor = vec4(skyCol, 1.0);
}
