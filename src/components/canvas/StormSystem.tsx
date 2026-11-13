'use client';

import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

export interface StormSystemProps {
  rainCount: number;
  stormIntensity: number;
  reducedMotion: boolean;
}

const RAIN_VERTEX_SHADER = `
  attribute vec4 aInstanceSeed;
  uniform float uTime;
  uniform float uStormIntensity;
  varying float vAlpha;

  void main() {
    float x = aInstanceSeed.x;
    float yPhase = aInstanceSeed.y;
    float z = aInstanceSeed.z;
    float speed = aInstanceSeed.w;

    float heightSpan = 42.0;
    float yPos = mod(yPhase - uTime * speed, heightSpan);

    // Slight Florida squall slant
    vec3 worldCenter = vec3(x - yPos * 0.09, yPos, z + yPos * 0.04);
    vec3 localPos = vec3(position.x * 0.045, position.y * 1.45, position.z);
    // Billboard streak horizontally toward camera while preserving vertical slant
    vec4 mvCenter = modelViewMatrix * vec4(worldCenter, 1.0);
    mvCenter.xy += localPos.xy;
    mvCenter.x -= localPos.y * 0.08;

    float fadeTop = smoothstep(42.0, 34.0, yPos);
    float fadeBottom = smoothstep(0.0, 2.5, yPos);
    vAlpha = fadeTop * fadeBottom * smoothstep(0.05, 0.85, uStormIntensity) * 0.42;

    gl_Position = projectionMatrix * mvCenter;
  }
`;

const RAIN_FRAGMENT_SHADER = `
  precision mediump float;
  varying float vAlpha;

  void main() {
    if (vAlpha <= 0.005) discard;
    gl_FragColor = vec4(0.86, 0.91, 0.98, vAlpha);
  }
`;

function createSeededRng(seed = 407) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

export function StormSystem({
  rainCount,
  stormIntensity,
  reducedMotion,
}: StormSystemProps) {
  const count = Math.max(0, Math.floor(rainCount));

  const geometry = useMemo(() => {
    if (count === 0) return null;

    const base = new THREE.PlaneGeometry(1, 1);
    const instanced = new THREE.InstancedBufferGeometry();
    instanced.index = base.index;
    instanced.attributes.position = base.attributes.position;
    instanced.attributes.uv = base.attributes.uv;
    instanced.instanceCount = count;

    const seeds = new Float32Array(count * 4);
    const rng = createSeededRng(285439);
    for (let i = 0; i < count; i += 1) {
      const i4 = i * 4;
      seeds[i4] = (rng() - 0.5) * 96;
      seeds[i4 + 1] = rng() * 42;
      seeds[i4 + 2] = (rng() - 0.5) * 96;
      seeds[i4 + 3] = 28 + rng() * 18;
    }

    instanced.setAttribute('aInstanceSeed', new THREE.InstancedBufferAttribute(seeds, 4));
    instanced.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 20, 0), 80);
    base.dispose();
    return instanced;
  }, [count]);

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        name: 'StormRainMaterial',
        vertexShader: RAIN_VERTEX_SHADER,
        fragmentShader: RAIN_FRAGMENT_SHADER,
        uniforms: {
          uTime: { value: 0 },
          uStormIntensity: { value: 0 },
        },
        transparent: true,
        depthWrite: false,
        toneMapped: false,
      }),
    []
  );

  useEffect(() => {
    return () => {
      geometry?.dispose();
    };
  }, [geometry]);

  useEffect(() => {
    return () => {
      material.dispose();
    };
  }, [material]);

  const visible = !reducedMotion && stormIntensity > 0.05 && count > 0;

  useFrame((_, delta) => {
    if (!visible) return;
    material.uniforms.uTime.value += Math.min(delta, 0.1);
    material.uniforms.uStormIntensity.value = stormIntensity;
  });

  if (!geometry) return null;

  return (
    <mesh
      name="storm_rain_system"
      geometry={geometry}
      material={material}
      visible={visible}
      frustumCulled={false}
      renderOrder={10}
    />
  );
}
