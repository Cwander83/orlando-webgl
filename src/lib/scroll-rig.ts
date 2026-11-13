'use client';

import { CHAPTERS, sampleScrollTimeline, type ChapterId } from './chapters';
import { getHudState, sceneMutableState, setHudState } from './scene-store';

export function syncReducedMotionMedia(): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return () => {};
  }

  const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
  const apply = () => {
    setHudState({ reducedMotion: mq.matches });
    if (mq.matches) {
      sceneMutableState.lightningFlash = 0;
    }
  };

  apply();
  mq.addEventListener('change', apply);
  return () => {
    mq.removeEventListener('change', apply);
  };
}

export function scrollToChapter(chapterId: ChapterId, reducedMotion: boolean): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return;
  }

  const chapter = CHAPTERS.find((c) => c.id === chapterId) ?? CHAPTERS[0];
  const [start, end] = chapter.scrollRange;
  const targetProgress = chapterId === 'dawn' ? 0 : chapterId === 'explore' ? 0.96 : (start + end) * 0.5;

  const sectionEl = document.querySelector<HTMLElement>(`[data-chapter-id="${chapterId}"]`);
  const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);

  let targetY = targetProgress * maxScroll;
  if (sectionEl && chapterId !== 'dawn') {
    const rect = sectionEl.getBoundingClientRect();
    targetY = Math.max(0, window.scrollY + rect.top);
  } else if (chapterId === 'dawn') {
    targetY = 0;
  }

  const nextMode = chapterId === 'explore' ? 'explore' : getHudState().mode === 'live' ? 'live' : 'scroll';

  setHudState({
    activeChapter: chapterId,
    mode: nextMode,
  });

  if (nextMode === 'scroll') {
    const sample = sampleScrollTimeline(targetProgress);
    sceneMutableState.scrollProgress = targetProgress;
    if (getHudState().manualTimeOfDay === null) {
      sceneMutableState.targetTimeOfDay = sample.timeOfDay;
    }
    if (!getHudState().manualStorm) {
      sceneMutableState.targetStormIntensity = sample.stormIntensity;
    }
  }

  window.scrollTo({
    top: targetY,
    behavior: reducedMotion ? 'auto' : 'smooth',
  });
}

export function bindScrollRig(options: { container: HTMLElement }): () => void {
  let disposed = false;
  let killTrigger: (() => void) | null = null;
  const cleanupReducedMotion = syncReducedMotionMedia();

  void (async () => {
    const [{ default: gsap }, { ScrollTrigger }] = await Promise.all([
      import('gsap'),
      import('gsap/ScrollTrigger'),
    ]);

    if (disposed) return;

    gsap.registerPlugin(ScrollTrigger);

    const trigger = ScrollTrigger.create({
      trigger: options.container,
      start: 'top top',
      end: 'bottom bottom',
      scrub: true,
      onUpdate: (self) => {
        const progress = self.progress;
        sceneMutableState.scrollProgress = progress;

        const hud = getHudState();
        const sample = sampleScrollTimeline(progress);

        if (hud.activeChapter !== sample.chapterId) {
          setHudState({ activeChapter: sample.chapterId });
        }

        if (hud.mode === 'scroll') {
          if (hud.manualTimeOfDay === null) {
            sceneMutableState.targetTimeOfDay = sample.timeOfDay;
          }
          if (!hud.manualStorm) {
            sceneMutableState.targetStormIntensity = sample.stormIntensity;
          }
        }
      },
    });

    killTrigger = () => {
      trigger.kill();
    };
  })();

  return () => {
    disposed = true;
    cleanupReducedMotion();
    if (killTrigger) {
      killTrigger();
    }
  };
}
