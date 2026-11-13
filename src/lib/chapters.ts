export type ChapterId = 'dawn' | 'golden' | 'storm' | 'night' | 'explore';
export type SceneMode = 'scroll' | 'explore' | 'live';
export type QualityTier = 'high' | 'medium' | 'low' | 'fallback';

export interface ChapterPreset {
  id: ChapterId;
  index: number;
  eyebrow: string;
  title: string;
  summary: string;
  scrollRange: [number, number];
  cameraPos: [number, number, number];
  cameraTarget: [number, number, number];
  timeOfDay: number;
  stormIntensity: number;
  sunDirection: [number, number, number];
}

export interface TimelineSample {
  chapterId: ChapterId;
  cameraPos: [number, number, number];
  cameraTarget: [number, number, number];
  timeOfDay: number;
  stormIntensity: number;
  sunDirection: [number, number, number];
}

function normalizeVec3(v: readonly [number, number, number]): [number, number, number] {
  const len = Math.hypot(v[0], v[1], v[2]);
  if (len === 0) return [0, 1, 0];
  return [v[0] / len, v[1] / len, v[2] / len];
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpVec3(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
  t: number
): [number, number, number] {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

function smoothstep01(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
}

export const CHAPTERS: readonly ChapterPreset[] = [
  {
    id: 'dawn',
    index: 0,
    eyebrow: '01 / First Light',
    title: 'First Light on Lake Eola',
    summary:
      'Ink recedes across the Linton E. Allen Fountain as coral dawn skims Lake Eola toward 200 S Orange.',
    scrollRange: [0.0, 0.25],
    cameraPos: [22, 3.5, 26],
    cameraTarget: [0, 6, 0],
    timeOfDay: 0.12,
    stormIntensity: 0.0,
    sunDirection: normalizeVec3([0.78, 0.18, 0.6]),
  },
  {
    id: 'golden',
    index: 1,
    eyebrow: '02 / Golden Hour',
    title: 'Golden Hour on Orange Ave',
    summary:
      'Low copper sun climbs above The Vue, grazing 200 S Orange turrets and Bank of America’s stepped spire.',
    scrollRange: [0.25, 0.5],
    cameraPos: [-28, 22, 30],
    cameraTarget: [-6, 14, -4],
    timeOfDay: 0.36,
    stormIntensity: 0.05,
    sunDirection: normalizeVec3([-0.72, 0.34, 0.6]),
  },
  {
    id: 'storm',
    index: 2,
    eyebrow: '03 / Florida Squall',
    title: '4 PM Florida Squall',
    summary:
      'Cumulus clouds bruise to deep ink; afternoon rain rings ripple the lake while lightning rims the towers.',
    scrollRange: [0.5, 0.75],
    cameraPos: [-38, 30, -24],
    cameraTarget: [0, 10, 0],
    timeOfDay: 0.58,
    stormIntensity: 0.95,
    sunDirection: normalizeVec3([-0.45, 0.52, -0.72]),
  },
  {
    id: 'night',
    index: 3,
    eyebrow: '04 / Ink & Gold',
    title: 'City in Ink & Gold',
    summary:
      'Warm cream and amber window grids wake floor by floor above a luminous Lake Eola fountain.',
    scrollRange: [0.75, 0.9],
    cameraPos: [32, 26, -28],
    cameraTarget: [-2, 12, 0],
    timeOfDay: 0.85,
    stormIntensity: 0.05,
    sunDirection: normalizeVec3([0.3, -0.45, -0.84]),
  },
  {
    id: 'explore',
    index: 4,
    eyebrow: '05 / Explore',
    title: 'Yours to Orbit',
    summary:
      'Take the camera around Downtown Orlando, scrub solar time, or sync directly with Live Orlando weather.',
    scrollRange: [0.9, 1.0],
    cameraPos: [36, 28, 32],
    cameraTarget: [0, 8, 0],
    timeOfDay: 0.82,
    stormIntensity: 0.0,
    sunDirection: normalizeVec3([0.35, -0.35, 0.87]),
  },
] as const;

const KEYFRAME_ANCHORS = [0.0, 0.35, 0.625, 0.825, 1.0] as const;

export function getChapterById(id: ChapterId): ChapterPreset {
  return CHAPTERS.find((chapter) => chapter.id === id) ?? CHAPTERS[0];
}

export function resolveChapterForProgress(progress: number): ChapterId {
  const p = Number.isFinite(progress) ? Math.min(1, Math.max(0, progress)) : 0;
  for (let i = 0; i < CHAPTERS.length; i += 1) {
    const [start, end] = CHAPTERS[i].scrollRange;
    if (i === CHAPTERS.length - 1) {
      if (p >= start) return CHAPTERS[i].id;
    } else if (p >= start && p < end) {
      return CHAPTERS[i].id;
    }
  }
  return 'dawn';
}

export function sampleScrollTimeline(progress: number): TimelineSample {
  const p = Number.isFinite(progress) ? Math.min(1, Math.max(0, progress)) : 0;
  const chapterId = resolveChapterForProgress(p);

  let segIndex = 0;
  for (let i = 0; i < KEYFRAME_ANCHORS.length - 1; i += 1) {
    if (p >= KEYFRAME_ANCHORS[i]) {
      segIndex = i;
    }
  }

  const startAnchor = KEYFRAME_ANCHORS[segIndex];
  const endAnchor = KEYFRAME_ANCHORS[segIndex + 1];
  const rawT = endAnchor > startAnchor ? (p - startAnchor) / (endAnchor - startAnchor) : 0;
  const t = smoothstep01(rawT);

  const from = CHAPTERS[segIndex];
  const to = CHAPTERS[segIndex + 1];

  return {
    chapterId,
    cameraPos: lerpVec3(from.cameraPos, to.cameraPos, t),
    cameraTarget: lerpVec3(from.cameraTarget, to.cameraTarget, t),
    timeOfDay: lerp(from.timeOfDay, to.timeOfDay, t),
    stormIntensity: lerp(from.stormIntensity, to.stormIntensity, t),
    sunDirection: normalizeVec3(lerpVec3(from.sunDirection, to.sunDirection, t)),
  };
}
