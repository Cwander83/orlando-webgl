'use client';

import { CHAPTERS, type ChapterId } from '@/lib/chapters';
import { useHudStore } from '@/lib/scene-store';
import { scrollToChapter } from '@/lib/scroll-rig';

const NAV_CHAPTERS: readonly { id: ChapterId; shortLabel: string }[] = [
  { id: 'dawn', shortLabel: '01 Dawn' },
  { id: 'golden', shortLabel: '02 Golden' },
  { id: 'storm', shortLabel: '03 Storm' },
  { id: 'night', shortLabel: '04 Night' },
  { id: 'explore', shortLabel: '05 Explore' },
];

export function TopNav() {
  const { activeChapter, reducedMotion } = useHudStore();

  return (
    <>
      <a
        href="#story-chapters"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-full focus:bg-[#060a1c] focus:px-4 focus:py-2 focus:font-display focus:text-xs focus:font-bold focus:uppercase focus:tracking-[0.18em] focus:text-[#fbfaf6] focus:outline-2 focus:outline-offset-2 focus:outline-[#fbfaf6]"
      >
        Skip to story
      </a>

      <header
        id="site-nav"
        style={{ mixBlendMode: 'difference' }}
        className="fixed inset-x-0 top-0 z-50 px-5 py-4 sm:px-8 lg:px-12"
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 text-[#fbfaf6]">
          <a
            href="#chapter-dawn"
            onClick={(event) => {
              event.preventDefault();
              scrollToChapter('dawn', reducedMotion);
            }}
            className="font-display text-xs font-extrabold uppercase tracking-[0.26em] text-[#fbfaf6] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#fbfaf6] sm:text-sm"
          >
            Orlando <span className="opacity-70">//</span> Ink &amp; Light
          </a>

          <nav aria-label="Story chapters" className="hidden items-center gap-5 md:flex">
            {NAV_CHAPTERS.map((item) => {
              const isActive = activeChapter === item.id;
              const fullTitle = CHAPTERS.find((c) => c.id === item.id)?.title ?? item.shortLabel;
              return (
                <a
                  key={item.id}
                  href={`#chapter-${item.id}`}
                  aria-label={`${item.shortLabel}: ${fullTitle}`}
                  aria-current={isActive ? 'location' : undefined}
                  onClick={(event) => {
                    event.preventDefault();
                    scrollToChapter(item.id, reducedMotion);
                  }}
                  className={`font-display text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[#fbfaf6] transition-opacity focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#fbfaf6] ${
                    isActive ? 'underline decoration-2 underline-offset-4 opacity-100' : 'opacity-75 hover:opacity-100'
                  }`}
                >
                  {item.shortLabel}
                </a>
              );
            })}
          </nav>

          <a
            href="https://chriswander.com"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full border border-[#fbfaf6]/60 px-4 py-1.5 font-display text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-[#fbfaf6] transition-colors hover:bg-[#fbfaf6] hover:text-[#0a1228] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#fbfaf6]"
          >
            chriswander.com ↗
          </a>
        </div>
      </header>
    </>
  );
}
