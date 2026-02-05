import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// 탄흔 데칼 풀 크기
const POOL_SIZE = 50;
const DECAL_LIFETIME = 8;
const DECAL_SIZE = 0.1;

// GC 방지 재사용 객체 (파일 스코프)
const _matrix = new THREE.Matrix4();
const _lookAtMatrix = new THREE.Matrix4();
const _position = new THREE.Vector3();
const _quaternion = new THREE.Quaternion();
const _zRotation = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _lookAt = new THREE.Vector3();
const _zAxis = new THREE.Vector3(0, 0, 1);

interface DecalInstance {
  active: boolean;
  age: number;
  position: THREE.Vector3;
  normal: THREE.Vector3;
  rotation: number;
}

// 탄흔 텍스처 생성 (한 번만)
const createDecalTexture = () => {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;

  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(20, 20, 20, 1)');
  gradient.addColorStop(0.3, 'rgba(40, 40, 40, 0.9)');
  gradient.addColorStop(0.7, 'rgba(30, 30, 30, 0.5)');
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);

  return new THREE.CanvasTexture(canvas);
};

const DECAL_TEXTURE = createDecalTexture();

export function BulletDecal({ decalRef }: { decalRef: React.MutableRefObject<{ spawn: (position: THREE.Vector3, normal: THREE.Vector3) => void } | null> }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const poolRef = useRef<DecalInstance[]>([]);

  // 상태 관리
  const stateRef = useRef({
    hasActiveDecals: false,
    activeCount: 0,
  });

  // 풀 초기화
  useMemo(() => {
    poolRef.current = Array.from({ length: POOL_SIZE }, () => ({
      active: false,
      age: 0,
      position: new THREE.Vector3(),
      normal: new THREE.Vector3(0, 1, 0),
      rotation: 0,
    }));
  }, []);

  // 데칼 생성 함수
  useMemo(() => {
    decalRef.current = {
      spawn: (position: THREE.Vector3, normal: THREE.Vector3) => {
        const pool = poolRef.current;
        let decal = pool.find(d => !d.active);

        if (!decal) {
          decal = pool.reduce((oldest, current) =>
            current.age > oldest.age ? current : oldest
          );
        }

        decal.active = true;
        decal.age = 0;
        decal.position.copy(position);
        decal.position.y += 0.001;
        decal.normal.copy(normal);
        decal.rotation = Math.random() * Math.PI * 2;

        stateRef.current.hasActiveDecals = true;
        stateRef.current.activeCount++;
      }
    };
  }, [decalRef]);

  // Geometry & Material
  const geometry = useMemo(() => new THREE.PlaneGeometry(DECAL_SIZE, DECAL_SIZE), []);

  const material = useMemo(() => new THREE.MeshBasicMaterial({
    map: DECAL_TEXTURE,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
  }), []);

  // 매 프레임 업데이트
  useFrame((_, dt) => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const state = stateRef.current;
    if (!state.hasActiveDecals) return;

    const pool = poolRef.current;
    let hasActive = false;
    let needsUpdate = false;

    for (let i = 0; i < POOL_SIZE; i++) {
      const decal = pool[i];

      if (decal.active) {
        decal.age += dt;

        if (decal.age >= DECAL_LIFETIME) {
          decal.active = false;
          _matrix.makeScale(0, 0, 0);
          mesh.setMatrixAt(i, _matrix);
          needsUpdate = true;
        } else {
          hasActive = true;
          needsUpdate = true;

          _position.copy(decal.position);
          _lookAt.copy(decal.position).add(decal.normal);

          _lookAtMatrix.lookAt(decal.position, _lookAt, _zAxis);
          _quaternion.setFromRotationMatrix(_lookAtMatrix);

          _zRotation.setFromAxisAngle(_zAxis, decal.rotation);
          _quaternion.multiply(_zRotation);

          // 페이드 아웃
          let fadeScale = 1;
          const fadeStart = DECAL_LIFETIME - 2;
          if (decal.age > fadeStart) {
            fadeScale = 1 - (decal.age - fadeStart) / 2;
          }

          _scale.set(fadeScale, fadeScale, fadeScale);
          _matrix.compose(_position, _quaternion, _scale);
          mesh.setMatrixAt(i, _matrix);
        }
      }
    }

    state.hasActiveDecals = hasActive;

    if (needsUpdate) {
      mesh.instanceMatrix.needsUpdate = true;
    }
  });

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, POOL_SIZE]}
      frustumCulled={false}
      userData={{ isEffect: true }}
    />
  );
}
