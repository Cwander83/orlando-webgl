'use client';

import { useState } from 'react';
import { CHAPTERS, type ChapterId } from '@/lib/chapters';
import { useHudStore } from '@/lib/scene-store';
import { scrollToChapter } from '@/lib/scroll-rig';

const FALLBACK_CHAPTERS = CHAPTERS.slice(0, 4);

const CHAPTER_MOOD_GRADIENT: Record<ChapterId, string> = {
  dawn: 'from-[#060a1c]/70 via-[#1b2a5e]/45 to-[#060a1c]/90',
  golden: 'from-[#0b1437]/70 via-[#3a2a1e]/40 to-[#060a1c]/90',
  storm: 'from-[#060a1c]/85 via-[#0a1228]/70 to-[#060a1c]/95',
  night: 'from-[#060a1c]/80 via-[#0b1437]/60 to-[#060a1c]/95',
  explore: 'from-[#060a1c]/75 via-[#111c45]/50 to-[#060a1c]/90',
};

export function StaticDioramaFallback() {
  const { activeChapter, reducedMotion } = useHudStore();
  const [selectedId, setSelectedId] = useState<ChapterId>(
    activeChapter === 'explore' ? 'dawn' : activeChapter
  );

  const selected =
    FALLBACK_CHAPTERS.find((chapter) => chapter.id === selectedId) ?? FALLBACK_CHAPTERS[0];

  return (
    <>
      <section
        data-testid="static-diorama-fallback"
        aria-label="Static Lake Eola and Downtown Orlando diorama"
        className="fixed inset-0 z-0 overflow-hidden bg-[#060a1c]"
      >
        <img
          src="/images/poster-fallback.webp"
          alt="Stylized navy and cream architectural diorama of Lake Eola and Downtown Orlando skyline"
          className="h-full w-full object-cover object-center opacity-70"
        />

        <div
          aria-hidden="true"
          className={`absolute inset-0 bg-gradient-to-b ${CHAPTER_MOOD_GRADIENT[selected.id]}`}
        />
      </section>

      <aside
        aria-label="Fallback chapter preview"
        className="pointer-events-auto fixed right-5 top-20 z-20 hidden max-w-sm rounded-2xl border border-[#fbfaf6]/25 bg-[#060a1c]/92 p-5 text-[#fbfaf6] shadow-2xl backdrop-blur-md lg:block"
      >
        <p className="font-display text-[0.7rem] font-semibold uppercase tracking-[0.28em] text-[#c7d0ec]">
          Static Diorama Mode
        </p>
        <h2 className="mt-1 font-display text-lg font-extrabold uppercase tracking-[0.04em] text-[#fbfaf6]">
          {selected.title}
        </h2>
        <p className="mt-2 font-sans text-sm leading-relaxed text-[#e6eaf6]">
          {selected.summary}
        </p>

        <div role="tablist" aria-label="Fallback chapter preview" className="mt-4 flex gap-2">
          {FALLBACK_CHAPTERS.map((chapter, index) => {
            const isSelected = chapter.id === selected.id;
            return (
              <button
                key={chapter.id}
                type="button"
                role="tab"
                aria-selected={isSelected}
                onClick={() => {
                  setSelectedId(chapter.id);
                  scrollToChapter(chapter.id, reducedMotion);
                }}
                className={`rounded-full border px-3 py-1 font-display text-xs font-bold uppercase tracking-[0.12em] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#fbfaf6] ${
                  isSelected
                    ? 'border-[#fbfaf6] bg-[#fbfaf6] text-[#0a1228]'
                    : 'border-[#fbfaf6]/35 text-[#fbfaf6] hover:border-[#fbfaf6]'
                }`}
              >
                0{index + 1}
              </button>
            );
          })}
        </div>
      </aside>
    </>
  );
}
