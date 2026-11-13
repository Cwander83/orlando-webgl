import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getHudState,
  resetSceneState,
  sceneMutableState,
  setHudState,
  subscribeHudState,
} from '@/lib/scene-store';

describe('scene-store isolation and discrete HUD notifications', () => {
  beforeEach(() => {
    resetSceneState();
  });

  it('never notifies subscribers when mutating sceneMutableState', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeHudState(listener);

    sceneMutableState.scrollProgress = 0.64;
    sceneMutableState.targetTimeOfDay = 0.58;
    sceneMutableState.dampedTimeOfDay = 0.52;
    sceneMutableState.targetStormIntensity = 0.9;
    sceneMutableState.dampedStormIntensity = 0.75;
    sceneMutableState.lightningFlash = 1.0;
    sceneMutableState.pointerNDC.x = 0.4;
    sceneMutableState.pointerWorld.z = -5;
    sceneMutableState.pointerActive = 1;

    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
  });

  it('notifies subscribers exactly once on discrete state changes and skips no-op updates', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeHudState(listener);

    setHudState({ activeChapter: 'dawn' });
    expect(listener).not.toHaveBeenCalled();

    setHudState({ activeChapter: 'storm' });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(getHudState().activeChapter).toBe('storm');

    setHudState({ activeChapter: 'storm' });
    expect(listener).toHaveBeenCalledTimes(1);

    setHudState({ mode: 'explore', manualStorm: true });
    expect(listener).toHaveBeenCalledTimes(2);
    expect(getHudState().mode).toBe('explore');
    expect(getHudState().manualStorm).toBe(true);

    unsubscribe();
  });

  it('resets both mutable and HUD state cleanly', () => {
    sceneMutableState.scrollProgress = 0.88;
    sceneMutableState.lightningFlash = 0.9;
    setHudState({ activeChapter: 'night', mode: 'live', qualityTier: 'low', reducedMotion: true });

    resetSceneState();

    expect(sceneMutableState.scrollProgress).toBe(0);
    expect(sceneMutableState.lightningFlash).toBe(0);
    expect(getHudState()).toEqual({
      activeChapter: 'dawn',
      mode: 'scroll',
      qualityTier: 'high',
      reducedMotion: false,
      liveWeather: null,
      manualTimeOfDay: null,
      manualStorm: false,
    });
  });
});
