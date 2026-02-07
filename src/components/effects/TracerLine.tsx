import { useRef, useMemo, useCallback } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

// 총알 풀 크기
const POOL_SIZE = 40;
const MAX_BULLET_DISTANCE = 500;
const RAYCAST_CACHE_INTERVAL = 500;

// 기본 지오메트리 기준 크기 (rifle)
const BASE_RADIUS = 0.015;
const BASE_LENGTH = 0.3;

// 무기별 총알 설정
const BULLET_CONFIG: Record<string, { speed: number; color: THREE.ColorRepresentation; radius: number; length: number }> = {
  rifle:   { speed: 100, color: 0xffdd44, radius: 0.015, length: 0.3 },
  shotgun: { speed: 100, color: 0xffdd44, radius: 0.015, length: 0.3 },
  sniper:  { speed: 200, color: 0xffffff, radius: 0.02,  length: 0.4 },
};

// GC 방지 재사용 객체 (파일 스코프)
const _position = new THREE.Vector3();
const _prevPosition = new THREE.Vector3();
const _quaternion = new THREE.Quaternion();
const _scale = new THREE.Vector3(1, 1, 1);
const _matrix = new THREE.Matrix4();
const _lookTarget = new THREE.Vector3();
const _raycaster = new THREE.Raycaster();
const _hitNormal = new THREE.Vector3();
const _upVector = new THREE.Vector3(0, 1, 0);
const _color = new THREE.Color();

interface BulletInstance {
  active: boolean;
  startPosition: THREE.Vector3;
  position: THREE.Vector3;
  direction: THREE.Vector3;
  distance: number;
  weaponType: string;
}

interface TracerLineProps {
  tracerRef: React.MutableRefObject<{ spawn: (start: THREE.Vector3, direction: THREE.Vector3, weaponType: string) => void } | null>;
  onHit?: (point: THREE.Vector3, normal: THREE.Vector3) => void;
}

export function TracerLine({ tracerRef, onHit }: TracerLineProps) {
  const { scene } = useThree();
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const poolRef = useRef<BulletInstance[]>([]);

  // 상태 관리
  const stateRef = useRef({
    raycastTargets: [] as THREE.Object3D[],
    lastCacheTime: 0,
    hasActiveBullets: false,
  });

  // 풀 초기화
  useMemo(() => {
    poolRef.current = Array.from({ length: POOL_SIZE }, () => ({
      active: false,
      startPosition: new THREE.Vector3(),
      position: new THREE.Vector3(),
      direction: new THREE.Vector3(),
      distance: 0,
      weaponType: 'rifle',
    }));
  }, []);

  // 레이캐스트 타겟 캐시 갱신
  const updateRaycastCache = useCallback(() => {
    const targets: THREE.Object3D[] = [];
    scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh &&
          !obj.userData?.isPlayer &&
          !obj.userData?.isEffect) {
        targets.push(obj);
      }
    });
    stateRef.current.raycastTargets = targets;
  }, [scene]);

  // 총알 생성 함수
  useMemo(() => {
    tracerRef.current = {
      spawn: (start: THREE.Vector3, direction: THREE.Vector3, weaponType: string) => {
        const pool = poolRef.current;
        const idx = pool.findIndex(b => !b.active);
        if (idx === -1) return;

        const bullet = pool[idx];
        bullet.active = true;
        bullet.startPosition.copy(start);
        bullet.position.copy(start);
        bullet.direction.copy(direction).normalize();
        bullet.distance = 0;
        bullet.weaponType = weaponType;
        stateRef.current.hasActiveBullets = true;

        // 인스턴스 색상 설정
        const mesh = meshRef.current;
        if (mesh) {
          const config = BULLET_CONFIG[weaponType] || BULLET_CONFIG.rifle;
          _color.set(config.color);
          mesh.setColorAt(idx, _color);
          if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        }
      }
    };
  }, [tracerRef]);

  // Geometry & Material (한 번만 생성)
  const geometry = useMemo(() => {
    const geo = new THREE.CylinderGeometry(BASE_RADIUS, BASE_RADIUS, BASE_LENGTH, 6);
    geo.rotateX(Math.PI / 2);
    return geo;
  }, []);

  const material = useMemo(() => {
    return new THREE.MeshBasicMaterial({ color: 0xffffff });
  }, []);

  // 매 프레임 업데이트
  useFrame((_, dt) => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const state = stateRef.current;
    const pool = poolRef.current;

    // 활성 총알 없으면 스킵
    if (!state.hasActiveBullets) return;

    const now = performance.now();

    // 레이캐스트 캐시 갱신
    if (now - state.lastCacheTime > RAYCAST_CACHE_INTERVAL) {
      updateRaycastCache();
      state.lastCacheTime = now;
    }

    let hasActive = false;
    let needsUpdate = false;

    for (let i = 0; i < POOL_SIZE; i++) {
      const bullet = pool[i];

      if (bullet.active) {
        hasActive = true;
        needsUpdate = true;

        const config = BULLET_CONFIG[bullet.weaponType] || BULLET_CONFIG.rifle;
        const moveDistance = config.speed * dt;

        // 이전 위치 저장
        _prevPosition.copy(bullet.position);

        // 총알 이동
        bullet.distance += moveDistance;
        bullet.position.copy(bullet.startPosition).addScaledVector(bullet.direction, bullet.distance);

        // 충돌 감지
        _raycaster.set(_prevPosition, bullet.direction);
        _raycaster.far = moveDistance + 0.1;

        const intersects = _raycaster.intersectObjects(state.raycastTargets, false);

        if (intersects.length > 0) {
          const hit = intersects[0];
          bullet.active = false;

          if (hit.face) {
            _hitNormal.copy(hit.face.normal);
            _hitNormal.transformDirection(hit.object.matrixWorld);
          } else {
            _hitNormal.set(0, 1, 0);
          }

          onHit?.(hit.point, _hitNormal);

          _matrix.makeScale(0, 0, 0);
          mesh.setMatrixAt(i, _matrix);
        } else if (bullet.distance >= MAX_BULLET_DISTANCE) {
          bullet.active = false;
          _matrix.makeScale(0, 0, 0);
          mesh.setMatrixAt(i, _matrix);
        } else {
          // 비행 중 (무기별 크기 스케일)
          const sx = config.radius / BASE_RADIUS;
          const sz = config.length / BASE_LENGTH;
          _position.copy(bullet.position);
          _lookTarget.copy(_position).add(bullet.direction);
          _matrix.lookAt(_position, _lookTarget, _upVector);
          _quaternion.setFromRotationMatrix(_matrix);
          _scale.set(sx, sx, sz);
          _matrix.compose(_position, _quaternion, _scale);
          mesh.setMatrixAt(i, _matrix);
        }
      }
    }

    state.hasActiveBullets = hasActive;

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
