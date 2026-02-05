import { useRef, useEffect, useCallback } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore } from '../../store/gameStore';
import { TracerLine } from './TracerLine';
import { BulletDecal } from './BulletDecal';
import { HitSpark } from './HitSpark';

// GC 방지 재사용 객체
const _rayOrigin = new THREE.Vector3();
const _rayDirection = new THREE.Vector3();
const _muzzleWorldPos = new THREE.Vector3();
const _aimPoint = new THREE.Vector3();
const _bulletDirection = new THREE.Vector3();
const _raycaster = new THREE.Raycaster();

// 조준점 거리 (충돌 없을 때)
const AIM_DISTANCE = 500;

// 무기별 발사 간격 (밀리초)
const WEAPON_FIRE_INTERVALS: Record<string, number> = {
  rifle: 1000 / 20,
  shotgun: 1000 / 2,
  sniper: 1000 / 1,
};

// 레이캐스트 타겟 캐시 갱신 간격 (밀리초)
const RAYCAST_CACHE_INTERVAL = 500;

// 통합 이펙트 매니저
export function BulletEffects() {
  const { camera, scene } = useThree();

  // 이펙트 refs
  const tracerRef = useRef<{ spawn: (start: THREE.Vector3, direction: THREE.Vector3) => void } | null>(null);
  const decalRef = useRef<{ spawn: (position: THREE.Vector3, normal: THREE.Vector3) => void } | null>(null);
  const sparkRef = useRef<{ spawn: (position: THREE.Vector3, normal: THREE.Vector3) => void } | null>(null);

  // 발사 상태 추적
  const stateRef = useRef({
    firing: false,
    lastFireTime: 0,
    raycastTargets: [] as THREE.Object3D[],
    lastCacheTime: 0,
  });

  // 마우스 이벤트 (발사 상태 추적)
  useEffect(() => {
    const state = stateRef.current;
    const onMouseDown = (e: MouseEvent) => {
      if (e.button === 0) state.firing = true;
    };
    const onMouseUp = (e: MouseEvent) => {
      if (e.button === 0) state.firing = false;
    };

    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  // 총알 충돌 시 콜백
  const handleBulletHit = useCallback((point: THREE.Vector3, normal: THREE.Vector3) => {
    decalRef.current?.spawn(point, normal);
    sparkRef.current?.spawn(point, normal);
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

  // 매 프레임: 발사 체크
  useFrame(() => {
    const store = useGameStore.getState();
    if (store.gameMode !== 'gunGame') return;

    const state = stateRef.current;
    if (!state.firing) return;

    const now = performance.now();

    // 레이캐스트 캐시 갱신 (일정 간격마다)
    if (now - state.lastCacheTime > RAYCAST_CACHE_INTERVAL) {
      updateRaycastCache();
      state.lastCacheTime = now;
    }

    // 발사 간격 체크
    const fireInterval = WEAPON_FIRE_INTERVALS[store.weaponType];
    if (now - state.lastFireTime < fireInterval) return;
    state.lastFireTime = now;

    // 총구 월드 위치
    const muzzlePos = store.muzzleWorldPos;
    _muzzleWorldPos.set(muzzlePos[0], muzzlePos[1], muzzlePos[2]);

    // 조준점 계산
    _rayOrigin.copy(camera.position);
    camera.getWorldDirection(_rayDirection);
    _raycaster.set(_rayOrigin, _rayDirection);
    _raycaster.far = AIM_DISTANCE;

    const intersects = _raycaster.intersectObjects(state.raycastTargets, false);

    if (intersects.length > 0) {
      _aimPoint.copy(intersects[0].point);
    } else {
      _aimPoint.copy(_rayOrigin).addScaledVector(_rayDirection, AIM_DISTANCE);
    }

    // 총구 → 조준점 방향
    _bulletDirection.subVectors(_aimPoint, _muzzleWorldPos).normalize();

    // 총알 생성
    tracerRef.current?.spawn(_muzzleWorldPos, _bulletDirection);
  });

  return (
    <>
      <TracerLine tracerRef={tracerRef} onHit={handleBulletHit} />
      <BulletDecal decalRef={decalRef} />
      <HitSpark sparkRef={sparkRef} />
    </>
  );
}
