'use client';

import { useCallback, useEffect, useState } from 'react';
import { CHAPTERS, sampleScrollTimeline, type ChapterId } from '@/lib/chapters';
import { computeOrlandoTimeOfDay } from '@/lib/orlando-sky';
import {
  getHudState,
  sceneMutableState,
  setHudState,
  useHudStore,
  type LiveWeatherSnapshot,
} from '@/lib/scene-store';
import { scrollToChapter, syncReducedMotionMedia } from '@/lib/scroll-rig';

const STORY_CHAPTERS = CHAPTERS.slice(0, 4);

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return target.isContentEditable;
}

export function SceneHud() {
  const { activeChapter, mode, qualityTier, reducedMotion, liveWeather, manualTimeOfDay, manualStorm } =
    useHudStore();
  const [liveLoading, setLiveLoading] = useState(false);

  useEffect(() => {
    return syncReducedMotionMedia();
  }, []);

  const toggleExplore = useCallback(() => {
    const current = getHudState();
    const nextMode = current.mode === 'explore' ? 'scroll' : 'explore';
    setHudState({ mode: nextMode });
    if (nextMode === 'scroll') {
      const sample = sampleScrollTimeline(sceneMutableState.scrollProgress);
      if (current.manualTimeOfDay === null) {
        sceneMutableState.targetTimeOfDay = sample.timeOfDay;
      }
      if (!current.manualStorm) {
        sceneMutableState.targetStormIntensity = sample.stormIntensity;
      }
    }
  }, []);

  const toggleLiveOrlando = useCallback(async () => {
    const current = getHudState();
    if (current.mode === 'live') {
      const sample = sampleScrollTimeline(sceneMutableState.scrollProgress);
      setHudState({
        mode: 'scroll',
        manualTimeOfDay: null,
        manualStorm: false,
      });
      sceneMutableState.targetTimeOfDay = sample.timeOfDay;
      sceneMutableState.targetStormIntensity = sample.stormIntensity;
      return;
    }

    setLiveLoading(true);
    const localSolar = computeOrlandoTimeOfDay(new Date());
    sceneMutableState.targetTimeOfDay = localSolar.timeOfDay;

    try {
      const res = await fetch('/api/orlando-weather');
      if (!res.ok) {
        throw new Error(`Weather status ${res.status}`);
      }
      const data = (await res.json()) as LiveWeatherSnapshot;
      setHudState({
        mode: 'live',
        liveWeather: data,
        manualTimeOfDay: null,
        manualStorm: false,
      });
      sceneMutableState.targetTimeOfDay = data.timeOfDay;
      sceneMutableState.targetStormIntensity = data.stormIntensity;
    } catch {
      const fallbackSnapshot: LiveWeatherSnapshot = {
        tempF: null,
        conditionLabel: 'Offline sky',
        stormIntensity: 0,
        timeOfDay: localSolar.timeOfDay,
        localTimeLabel: localSolar.localTimeLabel,
        fallback: true,
      };
      setHudState({
        mode: 'live',
        liveWeather: fallbackSnapshot,
        manualTimeOfDay: null,
        manualStorm: false,
      });
      sceneMutableState.targetTimeOfDay = fallbackSnapshot.timeOfDay;
      sceneMutableState.targetStormIntensity = fallbackSnapshot.stormIntensity;
    } finally {
      setLiveLoading(false);
    }
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isEditableTarget(event.target)) return;

      const key = event.key;
      if (key === '1' || key === '2' || key === '3' || key === '4') {
        const chapter = STORY_CHAPTERS[Number(key) - 1];
        if (chapter) {
          scrollToChapter(chapter.id, getHudState().reducedMotion);
        }
        return;
      }

      if (key === 'e' || key === 'E') {
        toggleExplore();
        return;
      }

      if (key === 'l' || key === 'L') {
        void toggleLiveOrlando();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [toggleExplore, toggleLiveOrlando]);

  const currentChapterObj = CHAPTERS.find((c) => c.id === activeChapter) ?? CHAPTERS[0];
  const liveStatusText =
    mode === 'live' && liveWeather
      ? liveWeather.fallback
        ? `Live clock · Offline sky · ${liveWeather.localTimeLabel}`
        : `${liveWeather.localTimeLabel} · ${liveWeather.tempF ?? '--'}°F · ${liveWeather.conditionLabel}`
      : null;

  const announcement = liveStatusText
    ? `${currentChapterObj.title}. Live Orlando: ${liveStatusText}`
    : `${currentChapterObj.eyebrow}: ${currentChapterObj.title}`;

  const tierLabel =
    qualityTier === 'high'
      ? 'High'
      : qualityTier === 'medium'
        ? 'Med'
        : qualityTier === 'low'
          ? 'Low'
          : 'Static';

  return (
    <>
      <div role="status" aria-live="polite" className="sr-only">
        {announcement}
      </div>

      <aside
        aria-label="Scene controls"
        className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex flex-col items-center gap-2 px-4"
      >
        {mode === 'explore' && (
          <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-3 rounded-2xl border border-[#fbfaf6]/25 bg-[#060a1c]/95 px-4 py-2.5 text-xs text-[#fbfaf6] shadow-xl backdrop-blur-md">
            <label className="flex items-center gap-2 font-display uppercase tracking-[0.14em]">
              <span>Solar Time</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                aria-label="Solar time of day"
                value={manualTimeOfDay ?? sceneMutableState.targetTimeOfDay}
                onChange={(event) => {
                  const val = Number(event.target.value);
                  sceneMutableState.targetTimeOfDay = val;
                  setHudState({ manualTimeOfDay: val });
                }}
                className="h-1.5 w-28 accent-[#fbfaf6] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#fbfaf6]"
              />
            </label>

            <button
              type="button"
              aria-pressed={manualStorm}
              onClick={() => {
                const nextStorm = !manualStorm;
                sceneMutableState.targetStormIntensity = nextStorm ? 0.95 : 0;
                setHudState({ manualStorm: nextStorm });
              }}
              className={`rounded-full border px-3 py-1 font-display text-[0.7rem] font-semibold uppercase tracking-[0.14em] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#fbfaf6] ${
                manualStorm
                  ? 'border-[#fbfaf6] bg-[#fbfaf6] text-[#0a1228]'
                  : 'border-[#fbfaf6]/40 text-[#fbfaf6] hover:border-[#fbfaf6]'
              }`}
            >
              Squall {manualStorm ? 'On' : 'Off'}
            </button>
          </div>
        )}

        {liveStatusText && (
          <div
            data-testid="live-weather-badge"
            className="pointer-events-auto rounded-full border border-[#fbfaf6]/25 bg-[#060a1c]/95 px-4 py-1.5 font-mono text-xs text-[#fbfaf6] shadow-lg backdrop-blur-md"
          >
            {liveStatusText}
          </div>
        )}

        <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-1.5 rounded-full border border-[#fbfaf6]/25 bg-[#060a1c]/95 p-1.5 shadow-2xl backdrop-blur-md">
          {STORY_CHAPTERS.map((ch, index) => {
            const isActive = activeChapter === ch.id;
            return (
              <button
                key={ch.id}
                type="button"
                aria-label={`0${index + 1}: ${ch.title}`}
                aria-pressed={isActive}
                onClick={() => scrollToChapter(ch.id as ChapterId, reducedMotion)}
                className={`rounded-full px-3 py-1.5 font-display text-xs font-bold uppercase tracking-[0.14em] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#fbfaf6] ${
                  isActive
                    ? 'bg-[#fbfaf6] text-[#0a1228]'
                    : 'text-[#e6eaf6] hover:bg-[#111c45]'
                }`}
              >
                0{index + 1}
              </button>
            );
          })}

          <span aria-hidden="true" className="mx-1 h-4 w-px bg-[#fbfaf6]/25" />

          <button
            type="button"
            aria-pressed={mode === 'explore'}
            onClick={toggleExplore}
            className={`rounded-full px-3.5 py-1.5 font-display text-xs font-bold uppercase tracking-[0.14em] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#fbfaf6] ${
              mode === 'explore'
                ? 'bg-[#fbfaf6] text-[#0a1228]'
                : 'text-[#fbfaf6] hover:bg-[#111c45]'
            }`}
          >
            Explore [E]
          </button>

          <button
            type="button"
            aria-pressed={mode === 'live'}
            aria-busy={liveLoading}
            onClick={() => void toggleLiveOrlando()}
            className={`rounded-full px-3.5 py-1.5 font-display text-xs font-bold uppercase tracking-[0.14em] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#fbfaf6] ${
              mode === 'live'
                ? 'bg-[#fbfaf6] text-[#0a1228]'
                : 'text-[#fbfaf6] hover:bg-[#111c45]'
            }`}
          >
            {liveLoading ? 'Syncing…' : 'Live [L]'}
          </button>

          <span
            aria-label={`Render quality ${tierLabel}`}
            className="hidden rounded-full border border-[#fbfaf6]/20 px-2.5 py-1 font-mono text-[0.68rem] uppercase tracking-[0.12em] text-[#c7d0ec] sm:inline-block"
          >
            {tierLabel}
          </span>
        </div>
      </aside>
    </>
  );
}
