import { useRef, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

// 총알 풀 크기
const POOL_SIZE = 20;
const BULLET_SPEED = 100;       // 총알 속도 (m/s)
const BULLET_LENGTH = 0.3;      // 총알 길이
const BULLET_RADIUS = 0.015;    // 총알 반지름
const MAX_BULLET_DISTANCE = 500; // 최대 비행 거리

// GC 방지 재사용 객체
const _position = new THREE.Vector3();
const _prevPosition = new THREE.Vector3();
const _quaternion = new THREE.Quaternion();
const _scale = new THREE.Vector3(1, 1, 1);
const _matrix = new THREE.Matrix4();
const _lookTarget = new THREE.Vector3();
const _raycaster = new THREE.Raycaster();
const _rayDirection = new THREE.Vector3();
const _hitNormal = new THREE.Vector3();

interface BulletInstance {
  active: boolean;
  startPosition: THREE.Vector3;
  position: THREE.Vector3;
  direction: THREE.Vector3;
  distance: number;      // 이동한 거리
}

interface TracerLineProps {
  tracerRef: React.MutableRefObject<{ spawn: (start: THREE.Vector3, direction: THREE.Vector3) => void } | null>;
  onHit?: (point: THREE.Vector3, normal: THREE.Vector3) => void;
}

// 총알 트레이서 컴포넌트
export function TracerLine({ tracerRef, onHit }: TracerLineProps) {
  const { scene } = useThree();
  const meshRef = useRef<THREE.InstancedMesh>(null);

  // 풀 상태
  const poolRef = useRef<BulletInstance[]>([]);

  // 풀 초기화
  useMemo(() => {
    poolRef.current = Array.from({ length: POOL_SIZE }, () => ({
      active: false,
      startPosition: new THREE.Vector3(),
      position: new THREE.Vector3(),
      direction: new THREE.Vector3(),
      distance: 0,
    }));
  }, []);

  // 총알 생성 함수 노출
  useMemo(() => {
    tracerRef.current = {
      spawn: (start: THREE.Vector3, direction: THREE.Vector3) => {
        const pool = poolRef.current;
        const bullet = pool.find(b => !b.active);
        if (!bullet) return;

        bullet.active = true;
        bullet.startPosition.copy(start);
        bullet.position.copy(start);
        bullet.direction.copy(direction).normalize();
        bullet.distance = 0;
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

  // 레이캐스트 대상 필터링 함수
  const getRaycastTargets = useMemo(() => {
    return () => {
      const targets: THREE.Object3D[] = [];
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh &&
            !obj.userData?.isPlayer &&
            !obj.userData?.isEffect) {
          targets.push(obj);
        }
      });
      return targets;
    };
  }, [scene]);

  // 매 프레임 업데이트
  useFrame((_, dt) => {
    if (!meshRef.current) return;

    const pool = poolRef.current;
    const mesh = meshRef.current;
    const moveDistance = BULLET_SPEED * dt;
    const raycastTargets = getRaycastTargets();

    for (let i = 0; i < POOL_SIZE; i++) {
      const bullet = pool[i];

      if (bullet.active) {
        // 이전 위치 저장
        _prevPosition.copy(bullet.position);

        // 총알 이동
        bullet.distance += moveDistance;
        bullet.position.copy(bullet.startPosition).addScaledVector(bullet.direction, bullet.distance);

        // 충돌 감지 (이전 위치 → 현재 위치 레이캐스트)
        _rayDirection.copy(bullet.direction);
        _raycaster.set(_prevPosition, _rayDirection);
        _raycaster.far = moveDistance + 0.1;  // 이동 거리 + 여유

        const intersects = _raycaster.intersectObjects(raycastTargets, false);

        if (intersects.length > 0) {
          // 충돌!
          const hit = intersects[0];
          bullet.active = false;

          // 법선 계산
          if (hit.face) {
            _hitNormal.copy(hit.face.normal);
            _hitNormal.transformDirection(hit.object.matrixWorld);
          } else {
            _hitNormal.set(0, 1, 0);
          }

          // 충돌 콜백
          if (onHit) {
            onHit(hit.point.clone(), _hitNormal.clone());
          }

          _matrix.makeScale(0, 0, 0);
          mesh.setMatrixAt(i, _matrix);
        } else if (bullet.distance >= MAX_BULLET_DISTANCE) {
          // 최대 거리 도달 시 비활성화
          bullet.active = false;
          _matrix.makeScale(0, 0, 0);
          mesh.setMatrixAt(i, _matrix);
        } else {
          // 계속 비행 중
          _position.copy(bullet.position);

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
