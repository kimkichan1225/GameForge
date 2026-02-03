import { useRef, useMemo, useEffect, memo } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF, useAnimations, Html } from '@react-three/drei';
import { SkeletonUtils } from 'three-stdlib';
import * as THREE from 'three';

interface RemotePlayerProps {
  id: string;
  nickname: string;
  color?: string;  // 플레이어 색상 ID
  position: { x: number; y: number; z: number };
  velocity: { x: number; y: number; z: number };
  animation: string;
  checkpoint: number;
  finished: boolean;
}

const _targetPos = new THREE.Vector3();
const _yAxis = new THREE.Vector3(0, 1, 0);
const _targetQuat = new THREE.Quaternion();

// 색상 ID → hex 매핑
const COLOR_MAP: Record<string, string> = {
  red: '#FF4444',
  blue: '#4444FF',
  yellow: '#FFFF00',
  green: '#44FF44',
  white: '#FFFFFF',
  black: '#333333',
  orange: '#FF8800',
  purple: '#AA44FF',
};

// 색상을 적용할 material 이름들
const COLOR_MATERIALS = ['Main.002', 'Grey.002', 'Helmet.002'];

export const RemotePlayer = memo(function RemotePlayer({
  nickname,
  color,
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

  // 색상 적용 (material 메모리 관리 포함)
  const appliedMaterials = useRef<THREE.MeshStandardMaterial[]>([]);

  useEffect(() => {
    if (!color || !clonedScene) return;

    const hexColor = COLOR_MAP[color] || '#FFFFFF';
    const threeColor = new THREE.Color(hexColor);

    // 이전에 생성한 materials 정리
    appliedMaterials.current.forEach(mat => mat.dispose());
    appliedMaterials.current = [];

    clonedScene.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material) {
        const mat = child.material as THREE.MeshStandardMaterial;
        if (COLOR_MATERIALS.includes(mat.name)) {
          const newMat = mat.clone();
          newMat.color = threeColor;
          child.material = newMat;
          appliedMaterials.current.push(newMat);
        }
      }
    });

    return () => {
      appliedMaterials.current.forEach(mat => mat.dispose());
      appliedMaterials.current = [];
    };
  }, [color, clonedScene]);

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

    // 위치 값 유효성 검사
    const posX = typeof position?.x === 'number' && isFinite(position.x) ? position.x : 0;
    const posY = typeof position?.y === 'number' && isFinite(position.y) ? position.y : 0;
    const posZ = typeof position?.z === 'number' && isFinite(position.z) ? position.z : 0;

    // Initialize lerped position on first frame
    if (!lerpedPos.current) {
      lerpedPos.current = new THREE.Vector3(posX, posY, posZ);
    }

    // Interpolate position (frame-rate independent)
    // Using exponential decay: factor = 1 - e^(-speed * dt)
    const lerpSpeed = 10; // Higher = faster catch-up
    const lerpFactor = 1 - Math.exp(-lerpSpeed * dt);

    _targetPos.set(posX, posY, posZ);
    lerpedPos.current.lerp(_targetPos, lerpFactor);
    group.current.position.copy(lerpedPos.current);

    // Play animation received from server (유효한 애니메이션만)
    if (animation && typeof animation === 'string' && animMap[animation]) {
      playAnim(animation);
    }

    // Rotate to face movement direction (frame-rate independent)
    const velX = typeof velocity?.x === 'number' && isFinite(velocity.x) ? velocity.x : 0;
    const velZ = typeof velocity?.z === 'number' && isFinite(velocity.z) ? velocity.z : 0;
    const speed = Math.sqrt(velX * velX + velZ * velZ);
    if (speed > 0.5) {
      const angle = Math.atan2(velX, velZ);
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
