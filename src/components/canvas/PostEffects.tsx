'use client';

import { useEffect, useMemo, useRef, type MutableRefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

export interface MainPassStats {
  drawCalls: number;
  triangles: number;
}

export interface PostEffectsProps {
  enabled: boolean;
  mainPassStatsRef?: MutableRefObject<MainPassStats | null>;
}

const FULLSCREEN_VERT = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const BLOOM_EXTRACT_FRAG = `
  precision mediump float;
  uniform sampler2D tScene;
  uniform vec2 uTexelSize;
  varying vec2 vUv;

  vec3 sampleBright(vec2 uv) {
    vec3 col = texture2D(tScene, clamp(uv, 0.001, 0.999)).rgb;
    float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
    float weight = smoothstep(0.76, 1.0, luma);
    return col * weight;
  }

  void main() {
    vec2 off = uTexelSize * 1.6;
    vec3 acc = sampleBright(vUv) * 0.36;
    acc += sampleBright(vUv + vec2(off.x, off.y)) * 0.16;
    acc += sampleBright(vUv + vec2(-off.x, off.y)) * 0.16;
    acc += sampleBright(vUv + vec2(off.x, -off.y)) * 0.16;
    acc += sampleBright(vUv + vec2(-off.x, -off.y)) * 0.16;
    gl_FragColor = vec4(acc, 1.0);
  }
`;

const BLOOM_COMPOSITE_FRAG = `
  precision mediump float;
  uniform sampler2D tScene;
  uniform sampler2D tBloom;
  uniform vec2 uBloomTexel;
  uniform float uStrength;
  varying vec2 vUv;

  void main() {
    vec4 base = texture2D(tScene, vUv);
    vec2 d = uBloomTexel * 1.5;
    vec3 bloom = texture2D(tBloom, vUv).rgb * 0.36;
    bloom += texture2D(tBloom, vUv + vec2(d.x, 0.0)).rgb * 0.16;
    bloom += texture2D(tBloom, vUv - vec2(d.x, 0.0)).rgb * 0.16;
    bloom += texture2D(tBloom, vUv + vec2(0.0, d.y)).rgb * 0.16;
    bloom += texture2D(tBloom, vUv - vec2(0.0, d.y)).rgb * 0.16;
    gl_FragColor = vec4(base.rgb + bloom * uStrength, base.a);
  }
`;

function ActivePostEffects({
  mainPassStatsRef,
}: {
  mainPassStatsRef?: MutableRefObject<MainPassStats | null>;
}) {
  const { gl, scene, camera, size } = useThree();
  const resourcesRef = useRef<{
    sceneRT: THREE.WebGLRenderTarget;
    bloomRT: THREE.WebGLRenderTarget;
    quadScene: THREE.Scene;
    quadCamera: THREE.OrthographicCamera;
    quadMesh: THREE.Mesh;
    quadGeo: THREE.PlaneGeometry;
    extractMat: THREE.ShaderMaterial;
    compositeMat: THREE.ShaderMaterial;
  } | null>(null);

  const initResources = useMemo(() => {
    const quadGeo = new THREE.PlaneGeometry(2, 2);
    const extractMat = new THREE.ShaderMaterial({
      name: 'BloomExtractMaterial',
      vertexShader: FULLSCREEN_VERT,
      fragmentShader: BLOOM_EXTRACT_FRAG,
      uniforms: {
        tScene: { value: null },
        uTexelSize: { value: new THREE.Vector2(1 / 512, 1 / 512) },
      },
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });

    const compositeMat = new THREE.ShaderMaterial({
      name: 'BloomCompositeMaterial',
      vertexShader: FULLSCREEN_VERT,
      fragmentShader: BLOOM_COMPOSITE_FRAG,
      uniforms: {
        tScene: { value: null },
        tBloom: { value: null },
        uBloomTexel: { value: new THREE.Vector2(1 / 256, 1 / 256) },
        uStrength: { value: 0.34 },
      },
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });

    const quadMesh = new THREE.Mesh(quadGeo, extractMat);
    quadMesh.frustumCulled = false;
    const quadScene = new THREE.Scene();
    quadScene.add(quadMesh);
    const quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    const sceneRT = new THREE.WebGLRenderTarget(1, 1, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      depthBuffer: true,
    });
    const bloomRT = new THREE.WebGLRenderTarget(1, 1, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      depthBuffer: false,
    });

    return {
      sceneRT,
      bloomRT,
      quadScene,
      quadCamera,
      quadMesh,
      quadGeo,
      extractMat,
      compositeMat,
    };
  }, []);

  useEffect(() => {
    resourcesRef.current = initResources;
    return () => {
      if (mainPassStatsRef) {
        mainPassStatsRef.current = null;
      }
      resourcesRef.current = null;
      initResources.sceneRT.dispose();
      initResources.bloomRT.dispose();
      initResources.quadGeo.dispose();
      initResources.extractMat.dispose();
      initResources.compositeMat.dispose();
    };
  }, [initResources, mainPassStatsRef]);

  useEffect(() => {
    const res = resourcesRef.current;
    if (!res) return;
    const dpr = gl.getPixelRatio();
    const w = Math.max(2, Math.floor(size.width * dpr));
    const h = Math.max(2, Math.floor(size.height * dpr));
    const bw = Math.max(1, Math.floor(w * 0.5));
    const bh = Math.max(1, Math.floor(h * 0.5));

    res.sceneRT.setSize(w, h);
    res.bloomRT.setSize(bw, bh);
    res.extractMat.uniforms.uTexelSize.value.set(1 / w, 1 / h);
    res.compositeMat.uniforms.uBloomTexel.value.set(1 / bw, 1 / bh);
  }, [gl, size.width, size.height]);

  useFrame(() => {
    const res = resourcesRef.current;
    if (!res) return;

    const prevTarget = gl.getRenderTarget();

    // 1. Main scene pass into offscreen target
    gl.setRenderTarget(res.sceneRT);
    gl.clear();
    gl.render(scene, camera);

    if (mainPassStatsRef) {
      mainPassStatsRef.current = {
        drawCalls: gl.info.render.calls,
        triangles: gl.info.render.triangles,
      };
    }

    // 2. Single-downsample bright pass + soft blur
    res.extractMat.uniforms.tScene.value = res.sceneRT.texture;
    res.quadMesh.material = res.extractMat;
    gl.setRenderTarget(res.bloomRT);
    gl.clear();
    gl.render(res.quadScene, res.quadCamera);

    // 3. Additive composite to screen
    res.compositeMat.uniforms.tScene.value = res.sceneRT.texture;
    res.compositeMat.uniforms.tBloom.value = res.bloomRT.texture;
    res.quadMesh.material = res.compositeMat;
    gl.setRenderTarget(prevTarget);
    gl.render(res.quadScene, res.quadCamera);
  }, 1);

  return null;
}

export function PostEffects({ enabled, mainPassStatsRef }: PostEffectsProps) {
  if (!enabled) return null;
  return <ActivePostEffects mainPassStatsRef={mainPassStatsRef} />;
}
