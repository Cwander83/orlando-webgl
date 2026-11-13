'use client';

import { useEffect, useMemo } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';

export interface LakeEolaWaterProps {
  geometry?: THREE.BufferGeometry;
  material: THREE.ShaderMaterial;
  onPointerGround?: (pt: { x: number; z: number } | null) => void;
}

function createFallbackLakeGeometry(radius = 16, segments = 48): THREE.BufferGeometry {
  const geo = new THREE.CircleGeometry(radius, segments);
  geo.rotateX(-Math.PI / 2);

  const posAttr = geo.getAttribute('position');
  const uvAttr = geo.getAttribute('uv');
  for (let i = 0; i < posAttr.count; i += 1) {
    const x = posAttr.getX(i);
    const z = posAttr.getZ(i);
    const r = Math.hypot(x, z);
    const shoreDist = THREE.MathUtils.clamp(1 - r / radius, 0, 1);
    uvAttr.setXY(i, shoreDist, 0.5);
  }
  uvAttr.needsUpdate = true;
  return geo;
}

export function LakeEolaWater({
  geometry,
  material,
  onPointerGround,
}: LakeEolaWaterProps) {
  const fallbackGeometry = useMemo(() => {
    if (geometry) return null;
    return createFallbackLakeGeometry();
  }, [geometry]);

  useEffect(() => {
    return () => {
      fallbackGeometry?.dispose();
    };
  }, [fallbackGeometry]);

  const activeGeometry = geometry ?? fallbackGeometry;
  if (!activeGeometry) return null;

  const handlePointerMove = (event: ThreeEvent<PointerEvent>) => {
    onPointerGround?.({ x: event.point.x, z: event.point.z });
  };

  const handlePointerLeave = () => {
    onPointerGround?.(null);
  };

  return (
    <mesh
      name="lake_eola_water"
      geometry={activeGeometry}
      material={material}
      position={geometry ? [0, 0, 0] : [0, 0.05, 0]}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
    />
  );
}
