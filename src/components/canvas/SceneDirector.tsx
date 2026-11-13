'use client';

import { useEffect, useRef, type MutableRefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import {
  sampleScrollTimeline,
  type ChapterId,
  type QualityTier,
  type SceneMode,
} from '@/lib/chapters';
import { createRollingFpsMonitor } from '@/lib/gpu-tier';
import { getHudState, sceneMutableState, setHudState } from '@/lib/scene-store';
import { updateAtmosphereMaterial } from '@/lib/shader-materials';
import type { MainPassStats } from './PostEffects';

export interface SceneMetrics {
  drawCalls: number;
  triangles: number;
  programs: number;
  qualityTier: QualityTier;
  mode: SceneMode;
  cameraJumpDelta: number;
  lightningFlash: number;
  activeChapter: ChapterId;
  reducedMotion: boolean;
}

declare global {
  interface Window {
    __SCENE_METRICS__?: SceneMetrics;
  }
}

export interface SceneDirectorProps {
  skyMaterial: THREE.ShaderMaterial;
  waterMaterial: THREE.ShaderMaterial;
  cityMaterial: THREE.ShaderMaterial;
  initialTier: QualityTier;
  cameraJumpDeltaRef: MutableRefObject<number>;
  mainPassStatsRef: MutableRefObject<MainPassStats | null>;
}

function qualityLevelFromTier(tier: QualityTier): 0 | 1 | 2 {
  if (tier === 'high') return 2;
  if (tier === 'medium') return 1;
  return 0;
}

function computeSolarDirection(timeOfDay: number): [number, number, number] {
  // Maps normalized timeOfDay (0..1) to an east->west solar arc
  const angle = (timeOfDay - 0.05) * Math.PI * 1.45;
  const x = Math.cos(angle) * 0.82;
  const y = Math.sin(angle) * 0.65 - 0.12;
  const z = 0.56;
  const len = Math.hypot(x, y, z) || 1;
  return [x / len, y / len, z / len];
}

export function SceneDirector({
  skyMaterial,
  waterMaterial,
  cityMaterial,
  initialTier,
  cameraJumpDeltaRef,
  mainPassStatsRef,
}: SceneDirectorProps) {
  const { gl } = useThree();
  const nextLightningAtRef = useRef<number>(1.8);

  const monitorRef = useRef<ReturnType<typeof createRollingFpsMonitor> | null>(null);

  useEffect(() => {
    const monitor = createRollingFpsMonitor({
      initialTier,
      onDowngrade: (nextTier) => {
        setHudState({ qualityTier: nextTier });
      },
    });
    monitorRef.current = monitor;

    const onVisibilityChange = () => {
      monitor.notifyVisibilityChange(performance.now(), document.hidden);
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      monitorRef.current = null;
    };
  }, [initialTier]);

  useEffect(() => {
    const hud = getHudState();
    window.__SCENE_METRICS__ = {
      drawCalls: 0,
      triangles: 0,
      programs: 0,
      qualityTier: hud.qualityTier,
      mode: hud.mode,
      cameraJumpDelta: 0,
      lightningFlash: 0,
      activeChapter: hud.activeChapter,
      reducedMotion: hud.reducedMotion,
    };

    return () => {
      delete window.__SCENE_METRICS__;
    };
  }, []);

  useFrame((state, delta) => {
    const hud = getHudState();
    const rawDeltaMs = delta * 1000;
    const clampedDelta = Math.min(delta, 0.1);
    const nowMs = performance.now();

    monitorRef.current?.recordFrame(
      rawDeltaMs,
      nowMs,
      typeof document !== 'undefined' ? document.hidden : false
    );

    const dampRate = hud.reducedMotion ? 30 : 4.2;
    sceneMutableState.dampedTimeOfDay = THREE.MathUtils.damp(
      sceneMutableState.dampedTimeOfDay,
      sceneMutableState.targetTimeOfDay,
      dampRate,
      clampedDelta
    );
    sceneMutableState.dampedStormIntensity = THREE.MathUtils.damp(
      sceneMutableState.dampedStormIntensity,
      sceneMutableState.targetStormIntensity,
      dampRate,
      clampedDelta
    );

    // Ink reveal wipe on initial load (immediate under reducedMotion)
    if (hud.reducedMotion) {
      sceneMutableState.inkReveal = 1;
    } else if (sceneMutableState.inkReveal < 1) {
      sceneMutableState.inkReveal = Math.min(1, sceneMutableState.inkReveal + clampedDelta * 0.72);
    }

    // Stochastic Florida squall lightning envelope (strictly 0 when reducedMotion)
    if (hud.reducedMotion) {
      sceneMutableState.lightningFlash = 0;
    } else {
      sceneMutableState.lightningFlash = Math.max(
        0,
        sceneMutableState.lightningFlash - clampedDelta * 5.2
      );
      if (
        sceneMutableState.dampedStormIntensity > 0.45 &&
        state.clock.elapsedTime >= nextLightningAtRef.current
      ) {
        sceneMutableState.lightningFlash = 0.72 + Math.random() * 0.28;
        nextLightningAtRef.current =
          state.clock.elapsedTime + 2.1 + Math.random() * (4.2 - sceneMutableState.dampedStormIntensity * 1.8);
      }
    }

    // Gently decay pointer wake intensity when idle
    if (sceneMutableState.pointerActive > 0) {
      sceneMutableState.pointerActive = Math.max(
        0,
        sceneMutableState.pointerActive - clampedDelta * 0.65
      );
    }

    const useSplineSun = hud.mode === 'scroll' && hud.manualTimeOfDay === null;
    const sunDirection = useSplineSun
      ? sampleScrollTimeline(sceneMutableState.scrollProgress).sunDirection
      : computeSolarDirection(sceneMutableState.dampedTimeOfDay);

    const sharedUniforms = {
      time: state.clock.elapsedTime,
      timeOfDay: sceneMutableState.dampedTimeOfDay,
      stormIntensity: sceneMutableState.dampedStormIntensity,
      lightningFlash: hud.reducedMotion ? 0 : sceneMutableState.lightningFlash,
      inkReveal: sceneMutableState.inkReveal,
      sunDirection,
      reducedMotion: hud.reducedMotion,
      qualityLevel: qualityLevelFromTier(hud.qualityTier),
      pointerWorld: sceneMutableState.pointerWorld,
      pointerActive: sceneMutableState.pointerActive,
    };

    updateAtmosphereMaterial(skyMaterial, sharedUniforms);
    updateAtmosphereMaterial(waterMaterial, sharedUniforms);
    updateAtmosphereMaterial(cityMaterial, sharedUniforms);

    const mainStats = mainPassStatsRef.current;
    const drawCalls = mainStats ? mainStats.drawCalls : gl.info.render.calls;
    const triangles = mainStats ? mainStats.triangles : gl.info.render.triangles;
    const programs = gl.info.programs?.length ?? 0;

    window.__SCENE_METRICS__ = {
      drawCalls,
      triangles,
      programs,
      qualityTier: hud.qualityTier,
      mode: hud.mode,
      cameraJumpDelta: cameraJumpDeltaRef.current,
      lightningFlash: hud.reducedMotion ? 0 : sceneMutableState.lightningFlash,
      activeChapter: hud.activeChapter,
      reducedMotion: hud.reducedMotion,
    };
  }, 0);

  return null;
}
