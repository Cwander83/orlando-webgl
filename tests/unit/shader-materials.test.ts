import { describe, expect, it } from 'vitest';
import * as THREE from 'three';

import {
  createInkSkyMaterial,
  createLakeWaterMaterial,
  createStylizedCityMaterial,
  updateAtmosphereMaterial,
  type SharedAtmosphereUniforms,
} from '@/lib/shader-materials';

describe('shader-materials', () => {
  it('creates InkSkyMaterial with resolved noise include and sky dome flags', () => {
    const mat = createInkSkyMaterial();
    expect(mat).toBeInstanceOf(THREE.ShaderMaterial);
    expect(mat.side).toBe(THREE.BackSide);
    expect(mat.depthWrite).toBe(false);
    expect(mat.fragmentShader).not.toContain('#include');
    expect(mat.vertexShader).not.toContain('#include');
    expect(mat.fragmentShader).toContain('fbm3');
    expect(mat.fragmentShader).toContain('uInkReveal');
    expect(mat.fragmentShader).toContain('uLightningFlash');
    mat.dispose();
  });

  it('creates LakeWaterMaterial with pointer uniforms and shoreline/raindrop shader logic', () => {
    const mat = createLakeWaterMaterial();
    expect(mat).toBeInstanceOf(THREE.ShaderMaterial);
    expect(mat.fragmentShader).not.toContain('#include');
    expect(mat.fragmentShader).toContain('snoise2D');
    expect(mat.fragmentShader).toContain('uPointerWorld');
    expect(mat.fragmentShader).toContain('uStormIntensity > 0.2');
    expect(mat.uniforms.uPointerWorld.value).toBeInstanceOf(THREE.Vector2);
    expect(mat.uniforms.uPointerActive.value).toBe(0);
    mat.dispose();
  });

  it('creates StylizedCityMaterial with single shared shader contract', () => {
    const mat = createStylizedCityMaterial();
    expect(mat).toBeInstanceOf(THREE.ShaderMaterial);
    expect(mat.fragmentShader).not.toContain('#include');
    expect(mat.fragmentShader).toContain('hash21');
    expect(mat.fragmentShader).toContain('fwidth(vNormal)');
    expect(mat.fragmentShader).toContain('uTimeOfDay > 0.62');
    expect(mat.fragmentShader).toContain('vUv.x');
    expect(mat.fragmentShader).toContain('vUv.y');
    mat.dispose();
  });

  it('updates shared atmosphere uniforms and clamps uLightningFlash to 0 under reducedMotion', () => {
    const sky = createInkSkyMaterial();
    const water = createLakeWaterMaterial();
    const city = createStylizedCityMaterial();

    const activeState: SharedAtmosphereUniforms = {
      time: 12.5,
      timeOfDay: 0.65,
      stormIntensity: 0.9,
      lightningFlash: 0.85,
      inkReveal: 0.95,
      sunDirection: [3, 4, 0],
      reducedMotion: false,
      qualityLevel: 2,
      pointerWorld: { x: 4.5, z: -2.25 },
      pointerActive: 0.8,
    };

    updateAtmosphereMaterial(sky, activeState);
    updateAtmosphereMaterial(water, activeState);
    updateAtmosphereMaterial(city, activeState);

    expect(sky.uniforms.uTime.value).toBe(12.5);
    expect(sky.uniforms.uTimeOfDay.value).toBe(0.65);
    expect(sky.uniforms.uStormIntensity.value).toBe(0.9);
    expect(sky.uniforms.uLightningFlash.value).toBe(0.85);
    expect(sky.uniforms.uInkReveal.value).toBe(0.95);
    expect(sky.uniforms.uReducedMotion.value).toBe(0);
    expect(sky.uniforms.uQualityLevel.value).toBe(2);

    const sunDir = sky.uniforms.uSunDir.value as THREE.Vector3;
    expect(sunDir.x).toBeCloseTo(0.6, 5);
    expect(sunDir.y).toBeCloseTo(0.8, 5);
    expect(sunDir.z).toBeCloseTo(0, 5);

    const ptr = water.uniforms.uPointerWorld.value as THREE.Vector2;
    expect(ptr.x).toBe(4.5);
    expect(ptr.y).toBe(-2.25);
    expect(water.uniforms.uPointerActive.value).toBe(0.8);

    // Reduced motion MUST clamp uLightningFlash to 0 across all materials
    const reducedState: SharedAtmosphereUniforms = {
      ...activeState,
      lightningFlash: 1.0,
      reducedMotion: true,
      qualityLevel: 0,
    };

    updateAtmosphereMaterial(sky, reducedState);
    updateAtmosphereMaterial(water, reducedState);
    updateAtmosphereMaterial(city, reducedState);

    expect(sky.uniforms.uLightningFlash.value).toBe(0);
    expect(water.uniforms.uLightningFlash.value).toBe(0);
    expect(city.uniforms.uLightningFlash.value).toBe(0);
    expect(sky.uniforms.uReducedMotion.value).toBe(1);
    expect(city.uniforms.uQualityLevel.value).toBe(0);

    sky.dispose();
    water.dispose();
    city.dispose();
  });
});
