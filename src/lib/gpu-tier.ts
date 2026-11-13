import type { QualityTier } from './chapters';

export interface TierSettings {
  dpr: [number, number];
  bloom: boolean;
  rainCount: number;
  waterQuality: 0 | 1 | 2;
  antialias: boolean;
}

const TIER_SETTINGS_MAP: Record<QualityTier, TierSettings> = {
  high: {
    dpr: [1, 1.75],
    bloom: true,
    rainCount: 1200,
    waterQuality: 2,
    antialias: true,
  },
  medium: {
    dpr: [1, 1.25],
    bloom: true,
    rainCount: 500,
    waterQuality: 1,
    antialias: false,
  },
  low: {
    dpr: [1, 1],
    bloom: false,
    rainCount: 150,
    waterQuality: 0,
    antialias: false,
  },
  fallback: {
    dpr: [1, 1],
    bloom: false,
    rainCount: 0,
    waterQuality: 0,
    antialias: false,
  },
};

export function getTierSettings(tier: QualityTier): TierSettings {
  const cfg = TIER_SETTINGS_MAP[tier];
  return {
    ...cfg,
    dpr: [cfg.dpr[0], cfg.dpr[1]],
  };
}

const SOFTWARE_RENDERER_RE = /SwiftShader|llvmpipe|Software|Microsoft Basic Render/i;
const WEAK_MOBILE_RE = /Mali-4|Adreno \(TM\) [345]\d\d|PowerVR SGX/i;
const HIGH_GPU_RE = /Apple M\d|Apple GPU|RTX|GeForce|Radeon RX|Radeon Pro|Arc A/i;
const INTEGRATED_GPU_RE = /Intel|Iris|UHD|Adreno|Mali|ANGLE/i;

function readRendererString(
  gl: WebGL2RenderingContext | WebGLRenderingContext,
  explicitInfo?: string
): string {
  if (typeof explicitInfo === 'string' && explicitInfo.length > 0) {
    return explicitInfo;
  }
  try {
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    if (ext) {
      const unmasked = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL);
      if (typeof unmasked === 'string' && unmasked.length > 0) {
        return unmasked;
      }
    }
    const fallbackRenderer = gl.getParameter(gl.RENDERER);
    return typeof fallbackRenderer === 'string' ? fallbackRenderer : '';
  } catch {
    return '';
  }
}

export function detectInitialQualityTier(
  gl?: WebGL2RenderingContext | WebGLRenderingContext | null,
  rendererInfo?: string
): QualityTier {
  if (!gl) {
    return 'fallback';
  }

  const info = readRendererString(gl, rendererInfo);
  if (SOFTWARE_RENDERER_RE.test(info)) {
    return 'fallback';
  }

  const isWebGL2 =
    (typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext) ||
    typeof (gl as WebGL2RenderingContext).createVertexArray === 'function';

  if (!isWebGL2) {
    return 'low';
  }

  if (WEAK_MOBILE_RE.test(info)) {
    return 'low';
  }

  if (HIGH_GPU_RE.test(info)) {
    return 'high';
  }

  if (INTEGRATED_GPU_RE.test(info)) {
    return 'medium';
  }

  try {
    const maxTex = Number(gl.getParameter(gl.MAX_TEXTURE_SIZE)) || 0;
    if (maxTex > 0 && maxTex < 4096) {
      return 'low';
    }
  } catch {
    // Ignore capability read errors on mock/minimal contexts
  }

  return 'high';
}

const DOWNGRADE_WINDOW_MS = 2000;
const POST_RESUME_GRACE_MS = 500;
const MIN_ACCEPTABLE_FPS = 45;

function nextLowerTier(tier: QualityTier): QualityTier | null {
  if (tier === 'high') return 'medium';
  if (tier === 'medium') return 'low';
  return null;
}

export function createRollingFpsMonitor(options: {
  initialTier: QualityTier;
  onDowngrade: (nextTier: QualityTier) => void;
}): {
  recordFrame: (deltaMs: number, nowMs: number, isDocumentHidden: boolean) => void;
  notifyVisibilityChange: (nowMs: number, isDocumentHidden: boolean) => void;
  getCurrentTier: () => QualityTier;
} {
  let currentTier: QualityTier = options.initialTier;
  let wasHidden = false;
  let resumeGraceUntilMs = -Infinity;
  let samples: { nowMs: number; deltaMs: number }[] = [];

  function resetWindow(): void {
    samples = [];
  }

  function notifyVisibilityChange(nowMs: number, isDocumentHidden: boolean): void {
    resetWindow();
    if (isDocumentHidden) {
      wasHidden = true;
    } else {
      wasHidden = false;
      resumeGraceUntilMs = nowMs + POST_RESUME_GRACE_MS;
    }
  }

  function recordFrame(deltaMs: number, nowMs: number, isDocumentHidden: boolean): void {
    if (currentTier === 'low' || currentTier === 'fallback') {
      return;
    }

    if (isDocumentHidden) {
      if (!wasHidden) {
        wasHidden = true;
      }
      resetWindow();
      return;
    }

    if (wasHidden) {
      wasHidden = false;
      resumeGraceUntilMs = nowMs + POST_RESUME_GRACE_MS;
      resetWindow();
      return;
    }

    if (nowMs < resumeGraceUntilMs) {
      return;
    }

    if (!Number.isFinite(deltaMs) || deltaMs <= 0 || deltaMs > 1000) {
      return;
    }

    samples.push({ nowMs, deltaMs });

    const cutoff = nowMs - DOWNGRADE_WINDOW_MS;
    while (samples.length > 0 && samples[0].nowMs < cutoff) {
      samples.shift();
    }

    if (samples.length < 10) {
      return;
    }

    const totalDeltaMs = samples.reduce((sum, s) => sum + s.deltaMs, 0);
    const spanMs = Math.max(nowMs - samples[0].nowMs + samples[0].deltaMs, totalDeltaMs);
    if (spanMs < DOWNGRADE_WINDOW_MS) {
      return;
    }

    const avgFps = (samples.length * 1000) / totalDeltaMs;
    if (avgFps < MIN_ACCEPTABLE_FPS) {
      const next = nextLowerTier(currentTier);
      if (next) {
        currentTier = next;
        resetWindow();
        options.onDowngrade(next);
      }
    }
  }

  return {
    recordFrame,
    notifyVisibilityChange,
    getCurrentTier: () => currentTier,
  };
}
