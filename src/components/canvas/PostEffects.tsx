'use client';

import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

export interface PostEffectsProps {
  enabled: boolean;
}

function ActivePostEffects() {
  const { gl, scene, camera, size } = useThree();
  const composerRef = useRef<EffectComposer | null>(null);
  const bloomRef = useRef<UnrealBloomPass | null>(null);

  useEffect(() => {
    const composer = new EffectComposer(gl);
    const renderPass = new RenderPass(scene, camera);
    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(1, 1),
      0.32,
      0.55,
      0.84
    );
    const outputPass = new OutputPass();

    composer.addPass(renderPass);
    composer.addPass(bloomPass);
    composer.addPass(outputPass);

    composerRef.current = composer;
    bloomRef.current = bloomPass;

    return () => {
      composerRef.current = null;
      bloomRef.current = null;
      renderPass.dispose();
      bloomPass.dispose();
      outputPass.dispose();
      composer.dispose();
    };
  }, [gl, scene, camera]);

  useEffect(() => {
    const composer = composerRef.current;
    const bloomPass = bloomRef.current;
    if (!composer) return;
    composer.setPixelRatio(gl.getPixelRatio());
    composer.setSize(size.width, size.height);
    bloomPass?.setSize(size.width, size.height);
  }, [gl, size.width, size.height]);

  useFrame((_, delta) => {
    composerRef.current?.render(delta);
  }, 1);

  return null;
}

export function PostEffects({ enabled }: PostEffectsProps) {
  if (!enabled) return null;
  return <ActivePostEffects />;
}
