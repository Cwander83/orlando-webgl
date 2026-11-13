'use client';

import type * as THREE from 'three';

export interface InkSkyDomeProps {
  material: THREE.ShaderMaterial;
}

export function InkSkyDome({ material }: InkSkyDomeProps) {
  return (
    <mesh name="ink_sky_dome" material={material} frustumCulled={false} renderOrder={-1}>
      <sphereGeometry args={[180, 32, 16]} />
    </mesh>
  );
}
