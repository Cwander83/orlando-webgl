'use client';

import { useSyncExternalStore } from 'react';
import type { ChapterId, QualityTier, SceneMode } from './chapters';

export interface LiveWeatherSnapshot {
  tempF: number | null;
  conditionLabel: string;
  stormIntensity: number;
  timeOfDay: number;
  localTimeLabel: string;
  fallback: boolean;
}

export interface SceneMutableState {
  scrollProgress: number;
  targetTimeOfDay: number;
  dampedTimeOfDay: number;
  targetStormIntensity: number;
  dampedStormIntensity: number;
  inkReveal: number;
  lightningFlash: number;
  pointerNDC: { x: number; y: number };
  pointerWorld: { x: number; z: number };
  pointerActive: number;
}

export interface HudState {
  activeChapter: ChapterId;
  mode: SceneMode;
  qualityTier: QualityTier;
  reducedMotion: boolean;
  liveWeather: LiveWeatherSnapshot | null;
  manualTimeOfDay: number | null;
  manualStorm: boolean;
}

function createInitialMutableState(): SceneMutableState {
  return {
    scrollProgress: 0,
    targetTimeOfDay: 0.12,
    dampedTimeOfDay: 0.12,
    targetStormIntensity: 0,
    dampedStormIntensity: 0,
    inkReveal: 0,
    lightningFlash: 0,
    pointerNDC: { x: 0, y: 0 },
    pointerWorld: { x: 0, z: 0 },
    pointerActive: 0,
  };
}

const INITIAL_HUD_STATE: HudState = Object.freeze({
  activeChapter: 'dawn',
  mode: 'scroll',
  qualityTier: 'high',
  reducedMotion: false,
  liveWeather: null,
  manualTimeOfDay: null,
  manualStorm: false,
});

export const sceneMutableState: SceneMutableState = createInitialMutableState();

let hudState: HudState = { ...INITIAL_HUD_STATE };
const listeners = new Set<() => void>();

function emitChange(): void {
  for (const listener of listeners) {
    listener();
  }
}

export function getHudState(): HudState {
  return hudState;
}

function getServerHudState(): HudState {
  return INITIAL_HUD_STATE;
}

export function setHudState(partial: Partial<HudState>): void {
  let changed = false;
  const next: HudState = { ...hudState };

  for (const key of Object.keys(partial) as (keyof HudState)[]) {
    const incoming = partial[key];
    if (incoming === undefined) continue;
    if (!Object.is(hudState[key], incoming)) {
      (next as unknown as Record<keyof HudState, unknown>)[key] = incoming;
      changed = true;
    }
  }

  if (!changed) return;
  hudState = next;
  emitChange();
}

export function subscribeHudState(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useHudStore(): HudState {
  return useSyncExternalStore(subscribeHudState, getHudState, getServerHudState);
}

export function resetSceneState(): void {
  const freshMutable = createInitialMutableState();
  sceneMutableState.scrollProgress = freshMutable.scrollProgress;
  sceneMutableState.targetTimeOfDay = freshMutable.targetTimeOfDay;
  sceneMutableState.dampedTimeOfDay = freshMutable.dampedTimeOfDay;
  sceneMutableState.targetStormIntensity = freshMutable.targetStormIntensity;
  sceneMutableState.dampedStormIntensity = freshMutable.dampedStormIntensity;
  sceneMutableState.inkReveal = freshMutable.inkReveal;
  sceneMutableState.lightningFlash = freshMutable.lightningFlash;
  sceneMutableState.pointerNDC.x = 0;
  sceneMutableState.pointerNDC.y = 0;
  sceneMutableState.pointerWorld.x = 0;
  sceneMutableState.pointerWorld.z = 0;
  sceneMutableState.pointerActive = 0;

  setHudState({ ...INITIAL_HUD_STATE });
}
