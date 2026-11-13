import { describe, expect, it, vi } from 'vitest';
import {
  createRollingFpsMonitor,
  detectInitialQualityTier,
  getTierSettings,
} from '@/lib/gpu-tier';

function createMockWebGL2Context(renderer = 'Apple M2'): WebGL2RenderingContext {
  return {
    RENDERER: 0x1f01,
    MAX_TEXTURE_SIZE: 0x0d33,
    createVertexArray: () => ({}) as WebGLVertexArrayObject,
    getExtension: (name: string) =>
      name === 'WEBGL_debug_renderer_info' ? { UNMASKED_RENDERER_WEBGL: 0x9246 } : null,
    getParameter: (param: number) => {
      if (param === 0x9246 || param === 0x1f01) return renderer;
      if (param === 0x0d33) return 16384;
      return null;
    },
  } as unknown as WebGL2RenderingContext;
}

describe('gpu-tier classification and settings', () => {
  it('returns exact pinned settings for every quality tier', () => {
    expect(getTierSettings('high')).toEqual({
      dpr: [1, 1.75],
      bloom: true,
      rainCount: 1200,
      waterQuality: 2,
      antialias: true,
    });
    expect(getTierSettings('medium')).toEqual({
      dpr: [1, 1.25],
      bloom: true,
      rainCount: 500,
      waterQuality: 1,
      antialias: false,
    });
    expect(getTierSettings('low')).toEqual({
      dpr: [1, 1],
      bloom: false,
      rainCount: 150,
      waterQuality: 0,
      antialias: false,
    });
    expect(getTierSettings('fallback')).toEqual({
      dpr: [1, 1],
      bloom: false,
      rainCount: 0,
      waterQuality: 0,
      antialias: false,
    });
  });

  it('classifies null or software renderers as fallback (Review Focus #1)', () => {
    expect(detectInitialQualityTier(null)).toBe('fallback');
    expect(detectInitialQualityTier(undefined)).toBe('fallback');

    const gl = createMockWebGL2Context('Google SwiftShader');
    expect(detectInitialQualityTier(gl)).toBe('fallback');
    expect(detectInitialQualityTier(gl, 'llvmpipe (LLVM 15.0.7, 256 bits)')).toBe('fallback');
    expect(detectInitialQualityTier(gl, 'Microsoft Basic Render Driver (Software)')).toBe(
      'fallback'
    );
  });

  it('classifies hardware WebGL2 GPUs appropriately', () => {
    expect(detectInitialQualityTier(createMockWebGL2Context('Apple M2 Pro'))).toBe('high');
    expect(detectInitialQualityTier(createMockWebGL2Context('Intel(R) Iris(R) Xe Graphics'))).toBe(
      'medium'
    );
  });
});

describe('createRollingFpsMonitor (Review Focus #5)', () => {
  it('downgrades high -> medium -> low after sustained < 45 FPS while active', () => {
    const onDowngrade = vi.fn();
    const monitor = createRollingFpsMonitor({
      initialTier: 'high',
      onDowngrade,
    });

    let now = 1000;
    // Feed 2100ms of 30ms frames (~33.3 FPS)
    for (let i = 0; i < 72; i += 1) {
      now += 30;
      monitor.recordFrame(30, now, false);
    }

    expect(monitor.getCurrentTier()).toBe('medium');
    expect(onDowngrade).toHaveBeenNthCalledWith(1, 'medium');

    // Feed another 2100ms of 30ms frames
    for (let i = 0; i < 72; i += 1) {
      now += 30;
      monitor.recordFrame(30, now, false);
    }

    expect(monitor.getCurrentTier()).toBe('low');
    expect(onDowngrade).toHaveBeenNthCalledWith(2, 'low');

    // Never downgrades below low
    for (let i = 0; i < 80; i += 1) {
      now += 30;
      monitor.recordFrame(30, now, false);
    }
    expect(monitor.getCurrentTier()).toBe('low');
    expect(onDowngrade).toHaveBeenCalledTimes(2);
  });

  it('ignores hidden tab frames and 500ms post-resume grace window', () => {
    const onDowngrade = vi.fn();
    const monitor = createRollingFpsMonitor({
      initialTier: 'high',
      onDowngrade,
    });

    let now = 5000;
    // Hidden tab frames for 3000ms must not trigger downgrade
    for (let i = 0; i < 100; i += 1) {
      now += 30;
      monitor.recordFrame(30, now, true);
    }
    expect(monitor.getCurrentTier()).toBe('high');
    expect(onDowngrade).not.toHaveBeenCalled();

    // Resume visibility and feed slow frames during 500ms grace window + 1800ms active (< 2000ms after grace)
    monitor.notifyVisibilityChange(now, false);
    for (let i = 0; i < 75; i += 1) {
      now += 30; // 75 * 30 = 2250ms total, only 1750ms after 500ms grace
      monitor.recordFrame(30, now, false);
    }
    expect(monitor.getCurrentTier()).toBe('high');
    expect(onDowngrade).not.toHaveBeenCalled();
  });
});
