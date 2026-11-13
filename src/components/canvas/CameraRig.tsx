'use client';

import { useEffect, useRef, type MutableRefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { getChapterById, sampleScrollTimeline, type SceneMode } from '@/lib/chapters';
import { getHudState, sceneMutableState } from '@/lib/scene-store';

export interface CameraRigProps {
  cameraJumpDeltaRef: MutableRefObject<number>;
}

const HANDOFF_DURATION_SEC = 0.4;
const MIN_POLAR = 0.25;
const MAX_POLAR = 1.42;
const MIN_DISTANCE = 18;
const MAX_DISTANCE = 85;

function isEditableElement(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

export function CameraRig({ cameraJumpDeltaRef }: CameraRigProps) {
  const { camera, gl } = useThree();
  const controlsRef = useRef<OrbitControls | null>(null);

  const stateRef = useRef({
    initialized: false,
    prevMode: 'scroll' as SceneMode,
    handoffActive: false,
    handoffDirection: 'to-orbit' as 'to-orbit' | 'to-scroll',
    handoffElapsed: 0,
    handoffStartPos: new THREE.Vector3(),
    handoffStartQuat: new THREE.Quaternion(),
    handoffStartTarget: new THREE.Vector3(),
    orbitDestPos: new THREE.Vector3(),
    orbitDestQuat: new THREE.Quaternion(),
    currentLookAt: new THREE.Vector3(0, 6, 0),
    prevCameraPos: new THREE.Vector3(),
    scratchPos: new THREE.Vector3(),
    scratchTarget: new THREE.Vector3(),
    scratchMat: new THREE.Matrix4(),
    scratchQuat: new THREE.Quaternion(),
    spherical: new THREE.Spherical(),
    offset: new THREE.Vector3(),
  });

  useEffect(() => {
    const s = stateRef.current;
    if (!s.initialized) {
      const dawn = getChapterById('dawn');
      camera.position.set(dawn.cameraPos[0], dawn.cameraPos[1], dawn.cameraPos[2]);
      s.currentLookAt.set(dawn.cameraTarget[0], dawn.cameraTarget[1], dawn.cameraTarget[2]);
      camera.lookAt(s.currentLookAt);
      s.prevCameraPos.copy(camera.position);
      s.initialized = true;
    }

    const controls = new OrbitControls(camera, gl.domElement);
    controls.minPolarAngle = MIN_POLAR;
    controls.maxPolarAngle = MAX_POLAR;
    controls.minDistance = MIN_DISTANCE;
    controls.maxDistance = MAX_DISTANCE;
    controls.enablePan = false;
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.target.copy(s.currentLookAt);
    controls.enabled = false;
    controlsRef.current = controls;

    return () => {
      controls.dispose();
      controlsRef.current = null;
    };
  }, [camera, gl]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isEditableElement(event.target)) return;

      const { mode } = getHudState();
      if (mode !== 'explore' && mode !== 'live') return;

      const controls = controlsRef.current;
      if (!controls) return;

      const s = stateRef.current;
      let handled = false;
      let dTheta = 0;
      let dPhi = 0;
      let dRadius = 0;

      if (event.key === 'ArrowLeft') {
        dTheta = 0.08;
        handled = true;
      } else if (event.key === 'ArrowRight') {
        dTheta = -0.08;
        handled = true;
      } else if (event.key === 'ArrowUp') {
        dPhi = -0.06;
        handled = true;
      } else if (event.key === 'ArrowDown') {
        dPhi = 0.06;
        handled = true;
      } else if (event.key === '+' || event.key === '=') {
        dRadius = -3.0;
        handled = true;
      } else if (event.key === '-' || event.key === '_') {
        dRadius = 3.0;
        handled = true;
      }

      if (!handled) return;
      event.preventDefault();

      // Finish any in-flight handoff cleanly if user starts orbiting via keyboard
      if (s.handoffActive) {
        s.handoffActive = false;
        controls.enabled = true;
      }

      s.offset.copy(camera.position).sub(controls.target);
      s.spherical.setFromVector3(s.offset);
      s.spherical.theta += dTheta;
      s.spherical.phi = THREE.MathUtils.clamp(s.spherical.phi + dPhi, MIN_POLAR, MAX_POLAR);
      s.spherical.radius = THREE.MathUtils.clamp(
        s.spherical.radius + dRadius,
        MIN_DISTANCE,
        MAX_DISTANCE
      );
      s.offset.setFromSpherical(s.spherical);
      camera.position.copy(controls.target).add(s.offset);
      camera.lookAt(controls.target);
      controls.update();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [camera]);

  useFrame((_, delta) => {
    const controls = controlsRef.current;
    const s = stateRef.current;
    const hud = getHudState();
    const stepDelta = Math.min(delta, 0.05);

    // Detect mode transition between scroll <-> explore/live
    if (s.prevMode !== hud.mode) {
      const wasOrbit = s.prevMode === 'explore' || s.prevMode === 'live';
      const isOrbit = hud.mode === 'explore' || hud.mode === 'live';

      if (!wasOrbit && isOrbit) {
        s.handoffDirection = 'to-orbit';
        s.handoffStartPos.copy(camera.position);
        s.handoffStartQuat.copy(camera.quaternion);
        s.handoffStartTarget.copy(s.currentLookAt);
        s.handoffElapsed = 0;

        if (controls) {
          controls.target.copy(s.currentLookAt);
          const prevDamping = controls.enableDamping;
          controls.enableDamping = false;
          controls.enabled = true;
          controls.update();
          s.orbitDestPos.copy(camera.position);
          s.orbitDestQuat.copy(camera.quaternion);
          controls.enableDamping = prevDamping;

          if (!hud.reducedMotion) {
            camera.position.copy(s.handoffStartPos);
            camera.quaternion.copy(s.handoffStartQuat);
            controls.enabled = false;
            s.handoffActive = true;
          } else {
            s.handoffActive = false;
          }
        }
      } else if (wasOrbit && !isOrbit) {
        s.handoffDirection = 'to-scroll';
        s.handoffStartPos.copy(camera.position);
        s.handoffStartQuat.copy(camera.quaternion);
        s.handoffStartTarget.copy(controls ? controls.target : s.currentLookAt);
        s.handoffElapsed = 0;

        if (controls) {
          controls.enabled = false;
        }
        s.handoffActive = !hud.reducedMotion;
      }

      s.prevMode = hud.mode;
    }

    if (s.handoffActive) {
      s.handoffElapsed += Math.min(stepDelta, 0.02);
      const rawT = THREE.MathUtils.clamp(s.handoffElapsed / HANDOFF_DURATION_SEC, 0, 1);
      const blend = rawT * rawT * (3 - 2 * rawT);

      if (s.handoffDirection === 'to-orbit') {
        camera.position.lerpVectors(s.handoffStartPos, s.orbitDestPos, blend);
        camera.quaternion.slerpQuaternions(s.handoffStartQuat, s.orbitDestQuat, blend);

        if (rawT >= 1) {
          s.handoffActive = false;
          if (controls) {
            controls.enabled = true;
            controls.update();
          }
        }
      } else {
        const sample = sampleScrollTimeline(sceneMutableState.scrollProgress);
        s.scratchPos.set(sample.cameraPos[0], sample.cameraPos[1], sample.cameraPos[2]);
        s.scratchTarget.set(
          sample.cameraTarget[0],
          sample.cameraTarget[1],
          sample.cameraTarget[2]
        );
        s.scratchMat.lookAt(s.scratchPos, s.scratchTarget, camera.up);
        s.scratchQuat.setFromRotationMatrix(s.scratchMat);

        camera.position.lerpVectors(s.handoffStartPos, s.scratchPos, blend);
        camera.quaternion.slerpQuaternions(s.handoffStartQuat, s.scratchQuat, blend);
        s.currentLookAt.lerpVectors(s.handoffStartTarget, s.scratchTarget, blend);

        if (rawT >= 1) {
          s.handoffActive = false;
        }
      }
    } else if (hud.mode === 'scroll') {
      if (controls && controls.enabled) {
        controls.enabled = false;
      }

      if (hud.reducedMotion) {
        const preset = getChapterById(hud.activeChapter);
        camera.position.set(preset.cameraPos[0], preset.cameraPos[1], preset.cameraPos[2]);
        s.currentLookAt.set(
          preset.cameraTarget[0],
          preset.cameraTarget[1],
          preset.cameraTarget[2]
        );
        camera.lookAt(s.currentLookAt);
      } else {
        const sample = sampleScrollTimeline(sceneMutableState.scrollProgress);
        s.scratchPos.set(sample.cameraPos[0], sample.cameraPos[1], sample.cameraPos[2]);
        s.scratchTarget.set(
          sample.cameraTarget[0],
          sample.cameraTarget[1],
          sample.cameraTarget[2]
        );

        const dampFactor = 10;
        camera.position.x = THREE.MathUtils.damp(
          camera.position.x,
          s.scratchPos.x,
          dampFactor,
          stepDelta
        );
        camera.position.y = THREE.MathUtils.damp(
          camera.position.y,
          s.scratchPos.y,
          dampFactor,
          stepDelta
        );
        camera.position.z = THREE.MathUtils.damp(
          camera.position.z,
          s.scratchPos.z,
          dampFactor,
          stepDelta
        );

        s.currentLookAt.x = THREE.MathUtils.damp(
          s.currentLookAt.x,
          s.scratchTarget.x,
          dampFactor,
          stepDelta
        );
        s.currentLookAt.y = THREE.MathUtils.damp(
          s.currentLookAt.y,
          s.scratchTarget.y,
          dampFactor,
          stepDelta
        );
        s.currentLookAt.z = THREE.MathUtils.damp(
          s.currentLookAt.z,
          s.scratchTarget.z,
          dampFactor,
          stepDelta
        );

        camera.lookAt(s.currentLookAt);
      }
    } else if (controls) {
      if (!controls.enabled) {
        controls.enabled = true;
      }
      controls.update();
      s.currentLookAt.copy(controls.target);
    }

    cameraJumpDeltaRef.current = camera.position.distanceTo(s.prevCameraPos);
    s.prevCameraPos.copy(camera.position);
  });

  return null;
}
