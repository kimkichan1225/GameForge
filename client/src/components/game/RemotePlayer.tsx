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
  animation: string;
  checkpoint: number;
  finished: boolean;
}

const _targetPos = new THREE.Vector3();
const _yAxis = new THREE.Vector3(0, 1, 0);
const _targetQuat = new THREE.Quaternion();

export const RemotePlayer = memo(function RemotePlayer({
  nickname,
  position,
  velocity,
  animation,
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

  // Get animation name map - all animations
  const animMap = useMemo(() => {
    const map: Record<string, string> = {};
    const targets = ['Idle', 'Walk', 'Run', 'Jump', 'SitPose', 'SitWalk', 'CrawlPose', 'Crawl', 'Roll', 'Dead'];

    for (const target of targets) {
      const found = names.find((n) => {
        const parts = n.split('|');
        return parts[parts.length - 1].toLowerCase() === target.toLowerCase();
      }) || names.find((n) => n.toLowerCase().includes(target.toLowerCase()));
      if (found) map[target] = found;
    }

    return map;
  }, [names]);

  // Initialize animation
  useEffect(() => {
    if (names.length > 0 && !currentAnim.current) {
      playAnim('Idle');
    }
  }, [names]);

  const playAnim = (name: string) => {
    if (currentAnim.current === name || !animMap[name]) return;

    const clipName = animMap[name];
    const action = actions[clipName];
    if (!action) return;

    const prevClip = animMap[currentAnim.current];
    if (prevClip) actions[prevClip]?.fadeOut(0.2);

    action.reset().fadeIn(0.2).play();

    // One-shot animations
    if (name === 'Jump' || name === 'Roll' || name === 'Dead') {
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
      if (name === 'Roll') action.timeScale = 2.3;
    } else {
      action.setLoop(THREE.LoopRepeat, Infinity);
    }

    currentAnim.current = name;
  };

  useFrame((_, dt) => {
    if (!group.current) return;

    // Initialize lerped position on first frame
    if (!lerpedPos.current) {
      lerpedPos.current = new THREE.Vector3(position.x, position.y, position.z);
    }

    // Interpolate position (frame-rate independent)
    // Using exponential decay: factor = 1 - e^(-speed * dt)
    const lerpSpeed = 10; // Higher = faster catch-up
    const lerpFactor = 1 - Math.exp(-lerpSpeed * dt);

    _targetPos.set(position.x, position.y, position.z);
    lerpedPos.current.lerp(_targetPos, lerpFactor);
    group.current.position.copy(lerpedPos.current);

    // Play animation received from server
    if (animation) {
      playAnim(animation);
    }

    // Rotate to face movement direction (frame-rate independent)
    const speed = Math.sqrt(velocity.x * velocity.x + velocity.z * velocity.z);
    if (speed > 0.5) {
      const angle = Math.atan2(velocity.x, velocity.z);
      _targetQuat.setFromAxisAngle(_yAxis, angle);
      const rotLerpFactor = 1 - Math.exp(-8 * dt);
      clonedScene.quaternion.slerp(_targetQuat, rotLerpFactor);
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
