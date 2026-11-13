import { describe, expect, it } from 'vitest';
import { CHAPTERS, getChapterById, sampleScrollTimeline } from '@/lib/chapters';

describe('chapters timeline', () => {
  it('defines all five canonical chapters in contiguous 0..1 scroll ranges', () => {
    expect(CHAPTERS.map((c) => c.id)).toEqual(['dawn', 'golden', 'storm', 'night', 'explore']);
    expect(CHAPTERS[0].scrollRange[0]).toBe(0);
    expect(CHAPTERS[CHAPTERS.length - 1].scrollRange[1]).toBe(1);

    for (let i = 0; i < CHAPTERS.length; i += 1) {
      const ch = CHAPTERS[i];
      expect(ch.index).toBe(i);
      expect(ch.scrollRange[0]).toBeLessThan(ch.scrollRange[1]);
      if (i > 0) {
        expect(ch.scrollRange[0]).toBeCloseTo(CHAPTERS[i - 1].scrollRange[1], 6);
      }
      const sunLen = Math.hypot(...ch.sunDirection);
      expect(sunLen).toBeCloseTo(1, 5);
    }
  });

  it('samples chapter boundaries and clamps out-of-range progress', () => {
    const start = sampleScrollTimeline(-0.5);
    expect(start.chapterId).toBe('dawn');
    expect(start.cameraPos).toEqual(CHAPTERS[0].cameraPos);
    expect(start.stormIntensity).toBe(0);

    const end = sampleScrollTimeline(1.5);
    expect(end.chapterId).toBe('explore');
    expect(end.cameraPos).toEqual(CHAPTERS[4].cameraPos);

    const nanSample = sampleScrollTimeline(Number.NaN);
    expect(nanSample.chapterId).toBe('dawn');
    expect(nanSample.cameraPos).toEqual(CHAPTERS[0].cameraPos);
  });

  it('peaks storm intensity in chapter 03 and keeps sunDirection normalized', () => {
    const golden = sampleScrollTimeline(0.35);
    expect(golden.chapterId).toBe('golden');

    const storm = sampleScrollTimeline(0.625);
    expect(storm.chapterId).toBe('storm');
    expect(storm.stormIntensity).toBeGreaterThanOrEqual(0.9);

    const night = sampleScrollTimeline(0.825);
    expect(night.chapterId).toBe('night');
    expect(night.timeOfDay).toBeGreaterThanOrEqual(0.8);

    for (const p of [0, 0.12, 0.25, 0.37, 0.5, 0.625, 0.75, 0.88, 1.0]) {
      const sample = sampleScrollTimeline(p);
      expect(Math.hypot(...sample.sunDirection)).toBeCloseTo(1, 5);
    }
  });

  it('resolves chapters by id', () => {
    expect(getChapterById('storm').title).toContain('Florida Squall');
    expect(getChapterById('night').index).toBe(3);
  });
});
