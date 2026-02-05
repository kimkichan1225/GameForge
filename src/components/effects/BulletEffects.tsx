import { useRef, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore } from '../../store/gameStore';
import { TracerLine } from './TracerLine';
import { BulletDecal } from './BulletDecal';
import { HitSpark } from './HitSpark';

// GC 방지 재사용 객체
const _raycaster = new THREE.Raycaster();
const _rayOrigin = new THREE.Vector3();
const _rayDirection = new THREE.Vector3();
const _hitPoint = new THREE.Vector3();
const _hitNormal = new THREE.Vector3();
const _muzzleWorldPos = new THREE.Vector3();

// 무기별 발사 간격 (밀리초)
const WEAPON_FIRE_INTERVALS: Record<string, number> = {
  rifle: 1000 / 30,    // 60 flashSpeed / 2 = 30 shots/sec → ~33ms
  shotgun: 1000 / 15,  // 30 flashSpeed / 2 = 15 shots/sec → ~67ms
  sniper: 1000 / 10,   // 20 flashSpeed / 2 = 10 shots/sec → ~100ms
};

// 최대 레이캐스트 거리
const MAX_RAYCAST_DISTANCE = 500;

// 통합 이펙트 매니저
export function BulletEffects() {
  const { scene, camera } = useThree();

  // 이펙트 refs
  const tracerRef = useRef<{ spawn: (start: THREE.Vector3, end: THREE.Vector3) => void } | null>(null);
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

  // 매 프레임 레이캐스트 및 이펙트 생성
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

    // 레이캐스트 설정 (카메라 중앙에서 발사)
    _rayOrigin.copy(camera.position);
    camera.getWorldDirection(_rayDirection);

    _raycaster.set(_rayOrigin, _rayDirection);
    _raycaster.far = MAX_RAYCAST_DISTANCE;
    _raycaster.camera = camera as THREE.Camera;  // Sprite 레이캐스트용

    // 레이캐스트 대상 필터링 (Mesh만, Sprite/Points/Line/이펙트 제외)
    const raycastTargets: THREE.Object3D[] = [];
    scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh &&
          !obj.userData?.isPlayer &&
          !obj.userData?.isEffect) {
        raycastTargets.push(obj);
      }
    });

    // 레이캐스트 수행
    const intersects = _raycaster.intersectObjects(raycastTargets, false);
    const hit = intersects[0];

    // 총구 월드 위치 (GunPlayer에서 업데이트)
    const muzzlePos = store.muzzleWorldPos;
    _muzzleWorldPos.set(muzzlePos[0], muzzlePos[1], muzzlePos[2]);

    if (hit) {
      // 충돌 지점 및 법선
      _hitPoint.copy(hit.point);
      if (hit.face) {
        _hitNormal.copy(hit.face.normal);
        // 월드 좌표계로 변환
        _hitNormal.transformDirection(hit.object.matrixWorld);
      } else {
        _hitNormal.set(0, 1, 0);  // 기본값: 위 방향
      }

      // 이펙트 생성
      if (tracerRef.current) {
        tracerRef.current.spawn(_muzzleWorldPos.clone(), _hitPoint.clone());
      }
      if (decalRef.current) {
        decalRef.current.spawn(_hitPoint.clone(), _hitNormal.clone());
      }
      if (sparkRef.current) {
        sparkRef.current.spawn(_hitPoint.clone(), _hitNormal.clone());
      }
    } else {
      // 충돌 없음: 최대 거리 지점에 트레이서만 생성
      _hitPoint.copy(_rayOrigin).addScaledVector(_rayDirection, MAX_RAYCAST_DISTANCE);

      if (tracerRef.current) {
        tracerRef.current.spawn(_muzzleWorldPos.clone(), _hitPoint.clone());
      }
    }
  });

  return (
    <>
      <TracerLine tracerRef={tracerRef} />
      <BulletDecal decalRef={decalRef} />
      <HitSpark sparkRef={sparkRef} />
    </>
  );
}
