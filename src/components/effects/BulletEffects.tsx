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
  rifle: 1000 / 20,    // 10발/초 → 100ms
  shotgun: 1000 / 2,   // 2발/초 → 500ms
  sniper: 1000 / 1,    // 1발/초 → 1000ms
};

// 통합 이펙트 매니저
export function BulletEffects() {
  const { camera, scene } = useThree();

  // 이펙트 refs
  const tracerRef = useRef<{ spawn: (start: THREE.Vector3, direction: THREE.Vector3) => void } | null>(null);
  const decalRef = useRef<{ spawn: (position: THREE.Vector3, normal: THREE.Vector3) => void } | null>(null);
  const sparkRef = useRef<{ spawn: (position: THREE.Vector3, normal: THREE.Vector3) => void } | null>(null);

  // 발사 상태 추적
  const fireStateRef = useRef({
    firing: false,
    lastFireTime: 0,
  });

  // 마우스 이벤트 (발사 상태 추적)
  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      if (e.button === 0) fireStateRef.current.firing = true;
    };
    const onMouseUp = (e: MouseEvent) => {
      if (e.button === 0) fireStateRef.current.firing = false;
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
    if (decalRef.current) {
      decalRef.current.spawn(point, normal);
    }
    if (sparkRef.current) {
      sparkRef.current.spawn(point, normal);
    }
  }, []);

  // 레이캐스트 대상 필터링
  const getRaycastTargets = useCallback(() => {
    const targets: THREE.Object3D[] = [];
    scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh &&
          !obj.userData?.isPlayer &&
          !obj.userData?.isEffect) {
        targets.push(obj);
      }
    });
    return targets;
  }, [scene]);

  // 매 프레임: 발사 체크
  useFrame(() => {
    const store = useGameStore.getState();

    // gunGame 모드에서만 동작
    if (store.gameMode !== 'gunGame') return;

    const fireState = fireStateRef.current;
    if (!fireState.firing) return;

    // 발사 간격 체크
    const now = performance.now();
    const fireInterval = WEAPON_FIRE_INTERVALS[store.weaponType];
    if (now - fireState.lastFireTime < fireInterval) return;
    fireState.lastFireTime = now;

    // 총구 월드 위치 (GunPlayer에서 업데이트)
    const muzzlePos = store.muzzleWorldPos;
    _muzzleWorldPos.set(muzzlePos[0], muzzlePos[1], muzzlePos[2]);

    // 조준점 계산: 카메라에서 레이캐스트하여 조준 위치 찾기
    _rayOrigin.copy(camera.position);
    camera.getWorldDirection(_rayDirection);
    _raycaster.set(_rayOrigin, _rayDirection);
    _raycaster.far = AIM_DISTANCE;

    const raycastTargets = getRaycastTargets();
    const intersects = _raycaster.intersectObjects(raycastTargets, false);

    if (intersects.length > 0) {
      // 조준점에 뭔가 있으면 그 지점으로
      _aimPoint.copy(intersects[0].point);
    } else {
      // 없으면 카메라 방향으로 먼 지점
      _aimPoint.copy(_rayOrigin).addScaledVector(_rayDirection, AIM_DISTANCE);
    }

    // 총구 → 조준점 방향 계산
    _bulletDirection.subVectors(_aimPoint, _muzzleWorldPos).normalize();

    // 총알 생성 (충돌 감지는 TracerLine에서 처리)
    if (tracerRef.current) {
      tracerRef.current.spawn(_muzzleWorldPos.clone(), _bulletDirection.clone());
    }
  });

  return (
    <>
      <TracerLine tracerRef={tracerRef} onHit={handleBulletHit} />
      <BulletDecal decalRef={decalRef} />
      <HitSpark sparkRef={sparkRef} />
    </>
  );
}
