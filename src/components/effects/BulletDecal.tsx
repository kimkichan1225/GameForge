import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// 탄흔 데칼 풀 크기
const POOL_SIZE = 50;
const DECAL_LIFETIME = 8;  // 수명 (초)
const DECAL_SIZE = 0.1;    // 탄흔 크기

// GC 방지 재사용 객체
const _matrix = new THREE.Matrix4();
const _position = new THREE.Vector3();
const _quaternion = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _lookAt = new THREE.Vector3();

interface DecalInstance {
  active: boolean;
  age: number;
  position: THREE.Vector3;
  normal: THREE.Vector3;
  rotation: number;  // Z축 랜덤 회전
}

// 탄흔 텍스처 생성 (원형 그라데이션)
const createDecalTexture = () => {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;

  // 방사형 그라데이션 (중심이 어둡고 바깥이 투명)
  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(20, 20, 20, 1)');
  gradient.addColorStop(0.3, 'rgba(40, 40, 40, 0.9)');
  gradient.addColorStop(0.7, 'rgba(30, 30, 30, 0.5)');
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);

  const texture = new THREE.CanvasTexture(canvas);
  return texture;
};

const DECAL_TEXTURE = createDecalTexture();

// 탄흔 데칼 컴포넌트
export function BulletDecal({ decalRef }: { decalRef: React.MutableRefObject<{ spawn: (position: THREE.Vector3, normal: THREE.Vector3) => void } | null> }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);

  // 풀 상태
  const poolRef = useRef<DecalInstance[]>([]);

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

  // 데칼 생성 함수 노출
  useMemo(() => {
    decalRef.current = {
      spawn: (position: THREE.Vector3, normal: THREE.Vector3) => {
        const pool = poolRef.current;
        // 가장 오래된 데칼 재사용 (풀이 가득 차면)
        let decal = pool.find(d => !d.active);
        if (!decal) {
          // 가장 오래된 것 찾기
          decal = pool.reduce((oldest, current) =>
            current.age > oldest.age ? current : oldest
          );
        }

        decal.active = true;
        decal.age = 0;
        decal.position.copy(position);
        decal.position.y += 0.001;  // Z-fighting 방지
        decal.normal.copy(normal);
        decal.rotation = Math.random() * Math.PI * 2;  // 랜덤 Z 회전
      }
    };
  }, [decalRef]);

  // Geometry: 평면
  const geometry = useMemo(() => {
    const geo = new THREE.PlaneGeometry(DECAL_SIZE, DECAL_SIZE);
    return geo;
  }, []);

  // Material: 투명 텍스처
  const material = useMemo(() => {
    return new THREE.MeshBasicMaterial({
      map: DECAL_TEXTURE,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
    });
  }, []);

  // 매 프레임 업데이트
  useFrame((_, dt) => {
    if (!meshRef.current) return;

    const pool = poolRef.current;
    const mesh = meshRef.current;

    for (let i = 0; i < POOL_SIZE; i++) {
      const decal = pool[i];

      if (decal.active) {
        decal.age += dt;

        if (decal.age >= DECAL_LIFETIME) {
          decal.active = false;
          // 숨김 처리
          _matrix.makeScale(0, 0, 0);
          mesh.setMatrixAt(i, _matrix);
        } else {
          // 위치 설정
          _position.copy(decal.position);

          // 법선 방향으로 회전 (표면에 평행하게)
          _lookAt.copy(decal.position).add(decal.normal);
          _quaternion.setFromRotationMatrix(
            new THREE.Matrix4().lookAt(decal.position, _lookAt, new THREE.Vector3(0, 0, 1))
          );

          // 추가 Z축 회전 (랜덤)
          const zRotation = new THREE.Quaternion().setFromAxisAngle(
            new THREE.Vector3(0, 0, 1),
            decal.rotation
          );
          _quaternion.multiply(zRotation);

          // 페이드 아웃 (마지막 2초)
          let fadeScale = 1;
          const fadeStart = DECAL_LIFETIME - 2;
          if (decal.age > fadeStart) {
            fadeScale = 1 - (decal.age - fadeStart) / 2;
          }

          _scale.set(fadeScale, fadeScale, fadeScale);

          // 변환 행렬 구성
          _matrix.compose(_position, _quaternion, _scale);
          mesh.setMatrixAt(i, _matrix);
        }
      } else {
        // 비활성: 숨김
        _matrix.makeScale(0, 0, 0);
        mesh.setMatrixAt(i, _matrix);
      }
    }

    mesh.instanceMatrix.needsUpdate = true;
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
