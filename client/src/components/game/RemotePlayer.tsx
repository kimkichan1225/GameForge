import { useRef, useMemo, useEffect, memo } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF, useAnimations, Html } from '@react-three/drei';
import { SkeletonUtils } from 'three-stdlib';
import * as THREE from 'three';

interface RemotePlayerProps {
  id: string;
  nickname: string;
  position: { x: number; y: number; z: number };
  velocity: { x: number; y: number; z: number };
  checkpoint: number;
  finished: boolean;
}

const _targetPos = new THREE.Vector3();
const _currentVel = new THREE.Vector3();
const _yAxis = new THREE.Vector3(0, 1, 0);
const _targetQuat = new THREE.Quaternion();

export const RemotePlayer = memo(function RemotePlayer({
  id,
  nickname,
  position,
  velocity,
}: RemotePlayerProps) {
  const group = useRef<THREE.Group>(null!);
  const { scene, animations } = useGLTF('/Runtest.glb');

  // Clone scene properly with SkeletonUtils
  const clonedScene = useMemo(() => {
    const clone = SkeletonUtils.clone(scene);
    return clone;
  }, [scene]);

  const { actions, names } = useAnimations(animations, clonedScene);

  const currentAnim = useRef('');
  const lerpedPos = useRef<THREE.Vector3 | null>(null);

  // Initialize animation
  useEffect(() => {
    if (names.length > 0 && !currentAnim.current) {
      playAnim('Idle');
    }
  }, [names]);

  // Get animation name map
  const animMap = useMemo(() => {
    const map: Record<string, string> = {};
    const targets = ['Idle', 'Walk', 'Run'];

    for (const target of targets) {
      const found = names.find((n) => {
        const parts = n.split('|');
        return parts[parts.length - 1].toLowerCase() === target.toLowerCase();
      });
      if (found) map[target] = found;
    }

    return map;
  }, [names]);

  const playAnim = (name: string) => {
    if (currentAnim.current === name || !animMap[name]) return;

    const clipName = animMap[name];
    const action = actions[clipName];
    if (!action) return;

    const prevClip = animMap[currentAnim.current];
    if (prevClip) actions[prevClip]?.fadeOut(0.2);

    action.reset().fadeIn(0.2).play();
    action.setLoop(THREE.LoopRepeat, Infinity);

    currentAnim.current = name;
  };

  useFrame(() => {
    if (!group.current) return;

    // Initialize lerped position on first frame
    if (!lerpedPos.current) {
      lerpedPos.current = new THREE.Vector3(position.x, position.y, position.z);
    }

    // Interpolate position
    _targetPos.set(position.x, position.y, position.z);
    lerpedPos.current.lerp(_targetPos, 0.15);
    group.current.position.copy(lerpedPos.current);

    // Update velocity for animation and rotation
    _currentVel.set(velocity.x, 0, velocity.z);
    const speed = _currentVel.length();

    // Update animation based on speed
    if (speed < 0.5) {
      playAnim('Idle');
    } else if (speed < 5) {
      playAnim('Walk');
    } else {
      playAnim('Run');
    }

    // Rotate to face movement direction
    if (speed > 0.5) {
      const angle = Math.atan2(velocity.x, velocity.z);
      _targetQuat.setFromAxisAngle(_yAxis, angle);
      clonedScene.quaternion.slerp(_targetQuat, 0.1);
    }
  });

  return (
    <group ref={group}>
      <primitive object={clonedScene} />
      {/* Nickname label */}
      <Html
        position={[0, 2.5, 0]}
        center
        distanceFactor={10}
        style={{ pointerEvents: 'none' }}
      >
        <div className="px-2 py-1 bg-slate-900/80 rounded text-white text-sm whitespace-nowrap">
          {nickname}
        </div>
      </Html>
    </group>
  );
});
