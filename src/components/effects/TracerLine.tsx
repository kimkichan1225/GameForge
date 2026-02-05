import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// 총알 풀 크기
const POOL_SIZE = 20;
const BULLET_SPEED = 300;       // 총알 속도 (m/s)
const BULLET_LENGTH = 0.3;      // 총알 길이
const BULLET_RADIUS = 0.015;    // 총알 반지름

// GC 방지 재사용 객체
const _position = new THREE.Vector3();
const _quaternion = new THREE.Quaternion();
const _scale = new THREE.Vector3(1, 1, 1);
const _matrix = new THREE.Matrix4();
const _lookTarget = new THREE.Vector3();

interface BulletInstance {
  active: boolean;
  position: THREE.Vector3;
  direction: THREE.Vector3;
  distance: number;      // 이동한 거리
  maxDistance: number;   // 최대 거리 (충돌 지점까지)
}

// 총알 트레이서 컴포넌트
export function TracerLine({ tracerRef }: { tracerRef: React.MutableRefObject<{ spawn: (start: THREE.Vector3, end: THREE.Vector3) => void } | null> }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);

  // 풀 상태
  const poolRef = useRef<BulletInstance[]>([]);

  // 풀 초기화
  useMemo(() => {
    poolRef.current = Array.from({ length: POOL_SIZE }, () => ({
      active: false,
      position: new THREE.Vector3(),
      direction: new THREE.Vector3(),
      distance: 0,
      maxDistance: 0,
    }));
  }, []);

  // 총알 생성 함수 노출
  useMemo(() => {
    tracerRef.current = {
      spawn: (start: THREE.Vector3, end: THREE.Vector3) => {
        const pool = poolRef.current;
        const bullet = pool.find(b => !b.active);
        if (!bullet) return;

        bullet.active = true;
        bullet.position.copy(start);
        bullet.direction.subVectors(end, start).normalize();
        bullet.distance = 0;
        bullet.maxDistance = start.distanceTo(end);
      }
    };
  }, [tracerRef]);

  // Geometry: 원기둥 (Y축 방향, 나중에 회전)
  const geometry = useMemo(() => {
    const geo = new THREE.CylinderGeometry(BULLET_RADIUS, BULLET_RADIUS, BULLET_LENGTH, 6);
    // Y축 → Z축 방향으로 회전 (총알이 앞으로 나가도록)
    geo.rotateX(Math.PI / 2);
    return geo;
  }, []);

  // Material: 밝은 노란색
  const material = useMemo(() => {
    return new THREE.MeshBasicMaterial({
      color: 0xffdd44,
    });
  }, []);

  // 매 프레임 업데이트
  useFrame((_, dt) => {
    if (!meshRef.current) return;

    const pool = poolRef.current;
    const mesh = meshRef.current;
    const moveDistance = BULLET_SPEED * dt;

    for (let i = 0; i < POOL_SIZE; i++) {
      const bullet = pool[i];

      if (bullet.active) {
        // 총알 이동
        bullet.distance += moveDistance;

        // 최대 거리 도달 시 비활성화
        if (bullet.distance >= bullet.maxDistance) {
          bullet.active = false;
          _matrix.makeScale(0, 0, 0);
          mesh.setMatrixAt(i, _matrix);
        } else {
          // 현재 위치 계산
          _position.copy(bullet.position).addScaledVector(bullet.direction, bullet.distance);

          // 총알 방향으로 회전
          _lookTarget.copy(_position).add(bullet.direction);
          _matrix.lookAt(_position, _lookTarget, new THREE.Vector3(0, 1, 0));
          _quaternion.setFromRotationMatrix(_matrix);

          // 행렬 구성
          _scale.set(1, 1, 1);
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
