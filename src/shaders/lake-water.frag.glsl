precision highp float;

varying vec2 vUv;
varying vec3 vWorldPos;

uniform float uTime;
uniform float uTimeOfDay;
uniform float uStormIntensity;
uniform float uLightningFlash;
uniform float uInkReveal;
uniform vec3 uSunDir;
uniform float uReducedMotion;
uniform float uQualityLevel;
uniform vec2 uPointerWorld;
uniform float uPointerActive;

#include <noise>

vec3 getSkyReflection(vec3 reflDir, float t, float stormBlend, vec3 sunDir) {
  float h = clamp(reflDir.y, 0.0, 1.0);
  vec3 dawnCol = mix(vec3(0.949, 0.518, 0.400), vec3(0.043, 0.078, 0.216), smoothstep(0.0, 0.65, h));
  vec3 goldenCol = mix(vec3(0.910, 0.525, 0.275), vec3(0.067, 0.110, 0.271), smoothstep(0.0, 0.65, h));
  vec3 stormCol = mix(vec3(0.176, 0.243, 0.365), vec3(0.024, 0.039, 0.110), smoothstep(0.0, 0.55, h));
  vec3 nightCol = mix(vec3(0.145, 0.176, 0.320), vec3(0.024, 0.039, 0.110), smoothstep(0.0, 0.55, h));

  vec3 col = mix(dawnCol, goldenCol, smoothstep(0.16, 0.32, t));
  col = mix(col, stormCol, smoothstep(0.42, 0.58, t));
  col = mix(col, nightCol, smoothstep(0.68, 0.82, t));
  col = mix(col, stormCol, stormBlend * 0.85);

  float sunDot = max(dot(normalize(reflDir), sunDir), 0.0);
  float dayVis = (1.0 - smoothstep(0.62, 0.78, t)) * (1.0 - stormBlend * 0.82);
  vec3 sunTint = mix(vec3(0.984, 0.980, 0.965), vec3(1.0, 0.68, 0.42), smoothstep(0.10, 0.45, t));
  col += sunTint * pow(sunDot, 48.0) * 1.15 * dayVis;
  return col;
}

void main() {
  float shoreDist = clamp(vUv.x, 0.0, 1.0);
  float animTime = uReducedMotion > 0.5 ? 0.0 : uTime;
  float stormBlend = clamp(uStormIntensity, 0.0, 1.0);
  vec2 xz = vWorldPos.xz;

  // 3 directional waves (analytical height + gradient normal perturbation)
  vec2 d1 = normalize(vec2(0.85, 0.52));
  vec2 d2 = normalize(vec2(-0.62, 0.78));
  vec2 d3 = normalize(vec2(0.24, -0.97));

  float p1 = dot(xz, d1) * 1.35 + animTime * 1.45;
  float p2 = dot(xz, d2) * 2.15 - animTime * 1.85;
  float p3 = dot(xz, d3) * 3.40 + animTime * 2.35;

  float amp = mix(0.045, 0.085, stormBlend);
  vec2 grad = d1 * cos(p1) * amp * 1.35 + d2 * cos(p2) * amp * 0.75 * 2.15;
  if (uQualityLevel >= 0.5) {
    grad += d3 * cos(p3) * amp * 0.42 * 3.40;
  }

  // Radial cursor wake around uPointerWorld
  float wakeHighlight = 0.0;
  if (uPointerActive > 0.01) {
    vec2 toPtr = xz - uPointerWorld;
    float ptrDist = length(toPtr);
    float env = exp(-ptrDist * 0.35) * uPointerActive;
    if (env > 0.005) {
      vec2 dirPtr = ptrDist > 0.001 ? toPtr / ptrDist : vec2(1.0, 0.0);
      float wakePhase = ptrDist * 4.2 - animTime * 6.5;
      float wakeSlope = cos(wakePhase) * env * 0.28;
      grad += dirPtr * wakeSlope;
      wakeHighlight = max(sin(wakePhase), 0.0) * env * 0.35;
    }
  }

  // Cell-hashed storm raindrop rings when uStormIntensity > 0.2 && uQualityLevel > 0.5
  float rainRingGlint = 0.0;
  if (uStormIntensity > 0.2 && uQualityLevel > 0.5) {
    vec2 rainUv = xz * 1.35;
    vec2 cell = floor(rainUv);
    vec2 cellLocal = fract(rainUv);
    vec2 rnd = hash22(cell);
    vec2 dropCenter = vec2(0.25) + 0.5 * rnd;
    float cycle = fract(animTime * (0.9 + rnd.x * 0.6) + rnd.y * 7.13);
    float dDrop = length(cellLocal - dropCenter);
    float ringRadius = cycle * 0.45;
    float ring = exp(-abs(dDrop - ringRadius) * 28.0) * (1.0 - cycle);
    float rainStrength = smoothstep(0.2, 0.9, uStormIntensity);
    vec2 ringDir = dDrop > 0.001 ? (cellLocal - dropCenter) / dDrop : vec2(0.0);
    grad += ringDir * ring * rainStrength * 0.35;
    rainRingGlint = ring * rainStrength * 0.45;
  }

  vec3 N = normalize(vec3(-grad.x, 1.0, -grad.y));
  vec3 V = normalize(cameraPosition - vWorldPos);
  vec3 R = reflect(-V, N);
  R.y = abs(R.y);
  vec3 sunDir = normalize(uSunDir);

  // Schlick Fresnel
  float NdotV = max(dot(N, V), 0.0);
  float F0 = 0.04;
  float fresnel = F0 + (1.0 - F0) * pow(1.0 - NdotV, 5.0);

  // Deep Lake Eola ink-navy body color
  vec3 deepWater = mix(vec3(0.039, 0.075, 0.200), vec3(0.024, 0.039, 0.110), stormBlend);
  vec3 shallowWater = mix(vec3(0.082, 0.153, 0.329), vec3(0.055, 0.094, 0.220), stormBlend);
  vec3 waterBase = mix(shallowWater, deepWater, smoothstep(0.0, 0.55, shoreDist));

  // Center fountain emerald/cream glow at night
  float nightFactor = smoothstep(0.68, 0.85, uTimeOfDay);
  float centerDist = length(xz);
  float fountainGlow = exp(-centerDist * 0.22) * nightFactor;
  waterBase += vec3(0.14, 0.58, 0.52) * fountainGlow * 0.35;

  vec3 skyRefl = getSkyReflection(R, uTimeOfDay, stormBlend, sunDir);
  vec3 color = mix(waterBase, skyRefl, clamp(fresnel * 1.15 + 0.08, 0.0, 0.92));

  // Lightning flash reflection
  float flash = clamp(uLightningFlash, 0.0, 1.0) * (1.0 - uReducedMotion);
  color += vec3(0.84, 0.91, 1.0) * flash * (0.28 + fresnel * 0.65);

  // Wake & rain ring cream glints
  vec3 cream = vec3(0.984, 0.980, 0.965); // #fbfaf6
  color += cream * (wakeHighlight + rainRingGlint) * 0.55;

  // Crisp #fbfaf6 ink-foam contour at bank edge (shoreDist == 0.0 -> 0.06)
  float foamNoise = snoise2D(xz * 0.75 + vec2(animTime * 0.2, -animTime * 0.15)) * 0.012;
  float edgeMetric = shoreDist + foamNoise;
  float aa = max(fwidth(shoreDist), 0.004);
  float mainFoam = 1.0 - smoothstep(0.038 - aa, 0.062 + aa, edgeMetric);
  float innerRipple = smoothstep(0.085, 0.095, edgeMetric) * (1.0 - smoothstep(0.095, 0.112, edgeMetric));
  color = mix(color, cream, clamp(mainFoam * 0.92 + innerRipple * 0.28, 0.0, 1.0));

  // Ink reveal wipe matching sky
  if (uInkReveal < 0.999) {
    float inkNoise = fbm2(xz * 0.12 + vec2(3.1, -1.7), uQualityLevel);
    float revealThreshold = mix(-0.15, 1.15, clamp(uInkReveal, 0.0, 1.0));
    float revealed = smoothstep(revealThreshold - 0.08, revealThreshold + 0.04, 1.0 - inkNoise);
    color = mix(vec3(0.039, 0.071, 0.157), color, revealed);
  }

  gl_FragColor = vec4(color, 1.0);
}
