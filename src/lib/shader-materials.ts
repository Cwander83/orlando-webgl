import * as THREE from 'three';

import noiseChunk from '@/shaders/chunks/noise.glsl';
import inkSkyVert from '@/shaders/ink-sky.vert.glsl';
import inkSkyFragRaw from '@/shaders/ink-sky.frag.glsl';
import lakeWaterVert from '@/shaders/lake-water.vert.glsl';
import lakeWaterFragRaw from '@/shaders/lake-water.frag.glsl';
import stylizedCityVert from '@/shaders/stylized-city.vert.glsl';
import stylizedCityFragRaw from '@/shaders/stylized-city.frag.glsl';

export interface SharedAtmosphereUniforms {
  time: number;
  timeOfDay: number;
  stormIntensity: number;
  lightningFlash: number;
  inkReveal: number;
  sunDirection: [number, number, number];
  reducedMotion: boolean;
  qualityLevel: 0 | 1 | 2;
  pointerWorld?: { x: number; z: number };
  pointerActive?: number;
}

function resolveNoiseInclude(fragmentSource: string): string {
  return fragmentSource.replace(/^\s*#include\s+<noise>\s*$/gm, noiseChunk);
}

function createBaseAtmosphereUniforms(): Record<string, THREE.IUniform> {
  return {
    uTime: { value: 0 },
    uTimeOfDay: { value: 0.12 },
    uStormIntensity: { value: 0 },
    uLightningFlash: { value: 0 },
    uInkReveal: { value: 1 },
    uSunDir: { value: new THREE.Vector3(0.6, 0.35, -0.7).normalize() },
    uReducedMotion: { value: 0 },
    uQualityLevel: { value: 2 },
  };
}

export function createInkSkyMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    name: 'InkSkyMaterial',
    vertexShader: inkSkyVert,
    fragmentShader: resolveNoiseInclude(inkSkyFragRaw),
    uniforms: createBaseAtmosphereUniforms(),
    side: THREE.BackSide,
    depthWrite: false,
    toneMapped: false,
  });
}

export function createLakeWaterMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    name: 'LakeWaterMaterial',
    vertexShader: lakeWaterVert,
    fragmentShader: resolveNoiseInclude(lakeWaterFragRaw),
    uniforms: {
      ...createBaseAtmosphereUniforms(),
      uPointerWorld: { value: new THREE.Vector2(0, 0) },
      uPointerActive: { value: 0 },
    },
    toneMapped: false,
  });
}

export function createStylizedCityMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    name: 'StylizedCityMaterial',
    vertexShader: stylizedCityVert,
    fragmentShader: resolveNoiseInclude(stylizedCityFragRaw),
    uniforms: createBaseAtmosphereUniforms(),
    toneMapped: false,
  });
}

export function updateAtmosphereMaterial(
  mat: THREE.ShaderMaterial,
  state: SharedAtmosphereUniforms
): void {
  const { uniforms } = mat;
  if (!uniforms) return;

  if (uniforms.uTime) uniforms.uTime.value = state.time;
  if (uniforms.uTimeOfDay) uniforms.uTimeOfDay.value = state.timeOfDay;
  if (uniforms.uStormIntensity) uniforms.uStormIntensity.value = state.stormIntensity;
  if (uniforms.uLightningFlash) {
    uniforms.uLightningFlash.value = state.reducedMotion ? 0 : Math.max(0, state.lightningFlash);
  }
  if (uniforms.uInkReveal) uniforms.uInkReveal.value = state.inkReveal;
  if (uniforms.uSunDir) {
    const vec = uniforms.uSunDir.value as THREE.Vector3;
    vec.set(state.sunDirection[0], state.sunDirection[1], state.sunDirection[2]);
    if (vec.lengthSq() > 0) vec.normalize();
  }
  if (uniforms.uReducedMotion) uniforms.uReducedMotion.value = state.reducedMotion ? 1 : 0;
  if (uniforms.uQualityLevel) uniforms.uQualityLevel.value = state.qualityLevel;

  if (uniforms.uPointerWorld && state.pointerWorld) {
    (uniforms.uPointerWorld.value as THREE.Vector2).set(
      state.pointerWorld.x,
      state.pointerWorld.z
    );
  }
  if (uniforms.uPointerActive && state.pointerActive !== undefined) {
    uniforms.uPointerActive.value = state.pointerActive;
  }
}
