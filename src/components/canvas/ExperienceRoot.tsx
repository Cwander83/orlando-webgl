'use client';

import {
  Component,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Canvas } from '@react-three/fiber';
import * as THREE from 'three';
import { detectInitialQualityTier, getTierSettings } from '@/lib/gpu-tier';
import { sceneMutableState, setHudState, useHudStore } from '@/lib/scene-store';
import {
  createInkSkyMaterial,
  createLakeWaterMaterial,
  createStylizedCityMaterial,
} from '@/lib/shader-materials';
import { StaticDioramaFallback } from '@/components/dom/StaticDioramaFallback';
import { CameraRig } from './CameraRig';
import { DevTweakPanel } from './DevTweakPanel';
import { InkSkyDome } from './InkSkyDome';
import { OrlandoDiorama } from './OrlandoDiorama';
import { PostEffects, type MainPassStats } from './PostEffects';
import { SceneDirector } from './SceneDirector';
import { StormSystem } from './StormSystem';

interface ErrorBoundaryProps {
  onError: () => void;
  fallback: ReactNode;
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

class CanvasErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(): void {
    this.props.onError();
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

function SceneContent() {
  const { qualityTier, reducedMotion } = useHudStore();
  const tierSettings = getTierSettings(qualityTier);

  const cameraJumpDeltaRef = useRef(0);
  const mainPassStatsRef = useRef<MainPassStats | null>(null);

  const materials = useMemo(
    () => ({
      sky: createInkSkyMaterial(),
      water: createLakeWaterMaterial(),
      city: createStylizedCityMaterial(),
    }),
    []
  );

  useEffect(() => {
    return () => {
      materials.sky.dispose();
      materials.water.dispose();
      materials.city.dispose();
    };
  }, [materials]);

  const handlePointerGround = useCallback((pt: { x: number; z: number } | null) => {
    if (pt) {
      sceneMutableState.pointerWorld.x = pt.x;
      sceneMutableState.pointerWorld.z = pt.z;
      sceneMutableState.pointerActive = 1;
    } else {
      sceneMutableState.pointerActive = 0;
    }
  }, []);

  return (
    <>
      <CameraRig cameraJumpDeltaRef={cameraJumpDeltaRef} />

      <SceneDirector
        skyMaterial={materials.sky}
        waterMaterial={materials.water}
        cityMaterial={materials.city}
        initialTier={qualityTier}
        cameraJumpDeltaRef={cameraJumpDeltaRef}
        mainPassStatsRef={mainPassStatsRef}
      />

      <InkSkyDome material={materials.sky} />

      <Suspense fallback={null}>
        <OrlandoDiorama
          cityMaterial={materials.city}
          waterMaterial={materials.water}
          onPointerGround={handlePointerGround}
        />
      </Suspense>

      <StormSystem
        rainCount={tierSettings.rainCount}
        stormIntensity={0}
        reducedMotion={reducedMotion}
      />

      <PostEffects enabled={tierSettings.bloom} mainPassStatsRef={mainPassStatsRef} />
    </>
  );
}

export function ExperienceRoot() {
  const { qualityTier } = useHudStore();
  const [hydratedAfterPaint, setHydratedAfterPaint] = useState(false);
  const cleanupContextRef = useRef<(() => void) | null>(null);
  const canvasWrapperRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    let rafId = 0;

    // Defer WebGL probing & <Canvas> mount until after initial paint so <h1> LCP is immediate
    rafId = window.requestAnimationFrame(() => {
      if (cancelled) return;
      let detectedTier: ReturnType<typeof detectInitialQualityTier> = 'fallback';
      try {
        const probeCanvas = document.createElement('canvas');
        const probeGl = probeCanvas.getContext('webgl2') as WebGL2RenderingContext | null;
        detectedTier = detectInitialQualityTier(probeGl);
      } catch {
        detectedTier = 'fallback';
      }

      setHudState({ qualityTier: detectedTier });
      setHydratedAfterPaint(true);
    });

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(rafId);
      cleanupContextRef.current?.();
      cleanupContextRef.current = null;
    };
  }, []);

  const attachContextLossListener = useCallback((dom: HTMLCanvasElement | null) => {
    if (!dom) return;
    cleanupContextRef.current?.();

    const onContextLost = (event: Event) => {
      event.preventDefault();
      setHudState({ qualityTier: 'fallback' });
    };

    dom.addEventListener('webglcontextlost', onContextLost);
    cleanupContextRef.current = () => {
      dom.removeEventListener('webglcontextlost', onContextLost);
    };
  }, []);

  useEffect(() => {
    if (!hydratedAfterPaint || qualityTier === 'fallback') return;
    const canvasEl = canvasWrapperRef.current?.querySelector('canvas') ?? null;
    attachContextLossListener(canvasEl);
  }, [hydratedAfterPaint, qualityTier, attachContextLossListener]);

  const handleFallback = useCallback(() => {
    setHudState({ qualityTier: 'fallback' });
  }, []);

  const handleCanvasCreated = useCallback(
    ({ gl }: { gl: THREE.WebGLRenderer }) => {
      attachContextLossListener(gl.domElement);
    },
    [attachContextLossListener]
  );

  if (!hydratedAfterPaint) {
    return null;
  }

  if (qualityTier === 'fallback') {
    return <StaticDioramaFallback />;
  }

  const tierSettings = getTierSettings(qualityTier);

  return (
    <>
      <DevTweakPanel />
      <CanvasErrorBoundary onError={handleFallback} fallback={<StaticDioramaFallback />}>
        <div ref={canvasWrapperRef} aria-hidden="true" className="fixed inset-0 z-0">
          <Canvas
            dpr={tierSettings.dpr}
            camera={{ fov: 46, near: 0.5, far: 420, position: [22, 3.5, 26] }}
            gl={{
              antialias: tierSettings.antialias,
              alpha: false,
              powerPreference: 'high-performance',
              toneMapping: THREE.NoToneMapping,
            }}
            onCreated={handleCanvasCreated}
          >
            <SceneContent />
          </Canvas>
        </div>
      </CanvasErrorBoundary>
    </>
  );
}
