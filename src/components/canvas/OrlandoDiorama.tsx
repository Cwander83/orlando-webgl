'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import * as THREE from 'three';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { getHudState, sceneMutableState } from '@/lib/scene-store';
import { LakeEolaWater } from './LakeEolaWater';

const DIORAMA_URL = '/models/orlando-diorama.glb';

const CITY_MESH_NAMES = new Set([
  'fountain_lake_eola',
  'tower_200_s_orange',
  'tower_bank_of_america',
  'tower_55_west',
  'tower_vue_lake_eola',
  'tower_city_hall',
  'skyline_context_merged',
]);

export interface OrlandoDioramaProps {
  cityMaterial: THREE.ShaderMaterial;
  waterMaterial: THREE.ShaderMaterial;
  onPointerGround?: (pt: { x: number; z: number } | null) => void;
}

interface ExtractedMesh {
  name: string;
  geometry: THREE.BufferGeometry;
  position: THREE.Vector3;
  rotation: THREE.Euler;
  scale: THREE.Vector3;
}

function configureMeshoptLoader(loader: GLTFLoader): void {
  loader.setMeshoptDecoder(MeshoptDecoder);
}

const EMERALD_GLOW = new THREE.Color('#42e3b8');
const CREAM_GLOW = new THREE.Color('#fbfaf6');

export function OrlandoDiorama({
  cityMaterial,
  waterMaterial,
  onPointerGround,
}: OrlandoDioramaProps) {
  const gltf = useLoader(GLTFLoader, DIORAMA_URL, configureMeshoptLoader) as GLTF;

  const { cityMeshes, basinGeometry } = useMemo(() => {
    const meshes: ExtractedMesh[] = [];
    let basin: THREE.BufferGeometry | undefined;

    gltf.scene.updateMatrixWorld(true);
    gltf.scene.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      if (obj.name === 'lake_eola_basin') {
        basin = obj.geometry;
        return;
      }
      if (CITY_MESH_NAMES.has(obj.name) || obj.name.length > 0) {
        meshes.push({
          name: obj.name,
          geometry: obj.geometry,
          position: obj.position.clone(),
          rotation: obj.rotation.clone(),
          scale: obj.scale.clone(),
        });
      }
    });

    return { cityMeshes: meshes, basinGeometry: basin };
  }, [gltf]);

  const plumeGeometry = useMemo(() => {
    return new THREE.CylinderGeometry(0.14, 0.85, 4.4, 16, 1, true);
  }, []);

  const plumeMaterial = useMemo(() => {
    return new THREE.MeshBasicMaterial({
      color: EMERALD_GLOW.clone(),
      transparent: true,
      opacity: 0.14,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
  }, []);

  useEffect(() => {
    return () => {
      plumeGeometry.dispose();
      plumeMaterial.dispose();
    };
  }, [plumeGeometry, plumeMaterial]);

  const plumeRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    const t = THREE.MathUtils.clamp(sceneMutableState.dampedTimeOfDay, 0, 1);
    const storm = THREE.MathUtils.clamp(sceneMutableState.dampedStormIntensity, 0, 1);
    const { reducedMotion } = getHudState();

    // Strongest during Golden Hour (0.28..0.48) and Night (0.68..0.95)
    const goldenGlow =
      THREE.MathUtils.smoothstep(t, 0.2, 0.36) * (1 - THREE.MathUtils.smoothstep(t, 0.44, 0.58));
    const nightGlow = THREE.MathUtils.smoothstep(t, 0.64, 0.86);
    const stormMute = 1 - storm * 0.45;
    const inkReveal = THREE.MathUtils.clamp(sceneMutableState.inkReveal, 0, 1);

    const pulse = reducedMotion ? 1 : 0.94 + Math.sin(state.clock.elapsedTime * 2.4) * 0.06;
    const targetOpacity = (0.06 + goldenGlow * 0.26 + nightGlow * 0.48) * stormMute * inkReveal;

    plumeMaterial.opacity = targetOpacity;
    plumeMaterial.color.lerpColors(EMERALD_GLOW, CREAM_GLOW, goldenGlow * 0.65 + 0.18);

    if (plumeRef.current) {
      plumeRef.current.visible = targetOpacity > 0.01;
      plumeRef.current.scale.set(1, pulse, 1);
    }
  });

  return (
    <group name="orlando_diorama">
      {cityMeshes.map((mesh) => (
        <mesh
          key={mesh.name}
          name={mesh.name}
          geometry={mesh.geometry}
          material={cityMaterial}
          position={mesh.position}
          rotation={mesh.rotation}
          scale={mesh.scale}
        />
      ))}

      <LakeEolaWater
        geometry={basinGeometry}
        material={waterMaterial}
        onPointerGround={onPointerGround}
      />

      <mesh
        ref={plumeRef}
        name="fountain_plume_accent"
        geometry={plumeGeometry}
        material={plumeMaterial}
        position={[0, 3.85, 0]}
        renderOrder={4}
      />
    </group>
  );
}
