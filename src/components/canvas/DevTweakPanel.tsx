'use client';

import { useEffect, useState, type ComponentType } from 'react';
import { sceneMutableState, setHudState } from '@/lib/scene-store';

type LevaModule = typeof import('leva');

function DevLevaControls({ leva }: { leva: LevaModule }) {
  leva.useControls('Orlando Atmosphere', {
    timeOfDay: {
      value: sceneMutableState.targetTimeOfDay,
      min: 0,
      max: 1,
      step: 0.01,
      onChange: (val: number) => {
        sceneMutableState.targetTimeOfDay = val;
        setHudState({ manualTimeOfDay: val });
      },
    },
    stormIntensity: {
      value: sceneMutableState.targetStormIntensity,
      min: 0,
      max: 1,
      step: 0.01,
      onChange: (val: number) => {
        sceneMutableState.targetStormIntensity = val;
        setHudState({ manualStorm: val > 0.1 });
      },
    },
    inkReveal: {
      value: 1,
      min: 0,
      max: 1,
      step: 0.01,
      onChange: (val: number) => {
        sceneMutableState.inkReveal = val;
      },
    },
  });

  const LevaPanel = leva.Leva as ComponentType<{ collapsed?: boolean }>;
  return <LevaPanel collapsed />;
}

export function DevTweakPanel() {
  if (process.env.NODE_ENV !== 'development') {
    return null;
  }

  return <DevTweakLoader />;
}

function DevTweakLoader() {
  const [levaMod, setLevaMod] = useState<LevaModule | null>(null);

  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return;
    let active = true;
    void import('leva').then((mod) => {
      if (active) setLevaMod(mod);
    });
    return () => {
      active = false;
    };
  }, []);

  if (process.env.NODE_ENV !== 'development' || !levaMod) {
    return null;
  }

  return <DevLevaControls leva={levaMod} />;
}
