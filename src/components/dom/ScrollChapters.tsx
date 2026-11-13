'use client';

import { CHAPTERS } from '@/lib/chapters';
import { setHudState, useHudStore } from '@/lib/scene-store';
import { scrollToChapter } from '@/lib/scroll-rig';

export function ScrollChapters() {
  const { activeChapter, reducedMotion, mode } = useHudStore();

  return (
    <main
      id="story-chapters"
      className="pointer-events-none relative z-10 mx-auto max-w-7xl px-5 sm:px-8 lg:px-12"
    >
      {CHAPTERS.map((chapter, idx) => {
        const isHero = idx === 0;
        const isExplore = chapter.id === 'explore';
        const isCurrent = activeChapter === chapter.id;

        return (
          <section
            key={chapter.id}
            id={`chapter-${chapter.id}`}
            data-chapter-id={chapter.id}
            aria-labelledby={`chapter-heading-${chapter.id}`}
            className={`flex min-h-screen flex-col justify-end pb-28 pt-28 sm:pb-32 ${
              idx % 2 === 1 ? 'items-end' : 'items-start'
            }`}
          >
            <article
              className={`pointer-events-auto w-full max-w-xl rounded-2xl border border-[#fbfaf6]/20 bg-[#060a1c]/90 p-6 shadow-2xl backdrop-blur-md sm:p-8 ${
                isCurrent ? 'ring-1 ring-[#fbfaf6]/35' : ''
              }`}
            >
              <p className="font-display text-xs font-semibold uppercase tracking-[0.35em] text-[#c7d0ec]">
                {chapter.eyebrow}
              </p>

              {isHero ? (
                <h1
                  id={`chapter-heading-${chapter.id}`}
                  style={{ opacity: 1 }}
                  className="mt-3 font-display text-4xl font-black uppercase leading-[0.94] tracking-[0.03em] text-[#fbfaf6] sm:text-5xl lg:text-6xl"
                >
                  Orlando in Ink &amp; Light
                </h1>
              ) : (
                <h2
                  id={`chapter-heading-${chapter.id}`}
                  className="mt-3 font-display text-3xl font-extrabold uppercase leading-[0.98] tracking-[0.02em] text-[#fbfaf6] sm:text-4xl"
                >
                  {chapter.title}
                </h2>
              )}

              {isHero && (
                <p className="mt-2 font-display text-sm font-semibold uppercase tracking-[0.18em] text-[#d5dcf2]">
                  {chapter.title}
                </p>
              )}

              <p className="mt-4 font-sans text-base leading-relaxed text-[#e6eaf6]">
                {chapter.summary}
              </p>

              <div className="mt-6 flex flex-wrap items-center gap-3">
                {isHero && (
                  <button
                    type="button"
                    onClick={() => scrollToChapter('golden', reducedMotion)}
                    className="rounded-full bg-[#fbfaf6] px-5 py-2.5 font-display text-xs font-bold uppercase tracking-[0.16em] text-[#0a1228] transition-colors hover:bg-[#e9e4d6] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#fbfaf6]"
                  >
                    Begin Ascent ↓
                  </button>
                )}

                {isExplore && (
                  <button
                    type="button"
                    onClick={() => {
                      setHudState({
                        mode: mode === 'explore' ? 'scroll' : 'explore',
                      });
                    }}
                    className="rounded-full bg-[#fbfaf6] px-5 py-2.5 font-display text-xs font-bold uppercase tracking-[0.16em] text-[#0a1228] transition-colors hover:bg-[#e9e4d6] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#fbfaf6]"
                  >
                    {mode === 'explore' ? 'Return to Story [E]' : 'Unlock Orbit [E]'}
                  </button>
                )}

                <span className="font-mono text-xs uppercase tracking-[0.14em] text-[#c7d0ec]">
                  Lake Eola · 28.5383° N
                </span>
              </div>
            </article>
          </section>
        );
      })}
    </main>
  );
}
