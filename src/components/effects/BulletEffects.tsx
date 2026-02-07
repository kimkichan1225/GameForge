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
const _spreadOffset = new THREE.Vector3();
const _raycaster = new THREE.Raycaster();

// 조준점 거리 (충돌 없을 때)
const AIM_DISTANCE = 500;

// 탄퍼짐 설정 (도 단위)
const SPREAD_CONFIG = {
  // 무기별 기본 퍼짐
  baseSpread: {
    rifle: 1.5,
    shotgun: 5.0,
    sniper: 5.0,
  },
  // 조준 상태 배율
  aimMultiplier: {
    none: 1.0,
    hold: 0.5,
    toggle: 0.3,
  },
  // 자세 배율
  postureMultiplier: {
    standing: 1.0,
    sitting: 0.8,
    crawling: 0.6,
  },
  // 이동 상태 가산 (도)
  moveAddition: {
    idle: 0,
    walk: 0.5,
    run: 1.5,
    jump: 3.0,
  },
  // 연사 누적
  accumulationPerShot: 0.2,  // 발당 추가 퍼짐
  accumulationMax: 3.0,      // 최대 누적
  accumulationDecay: 5.0,    // 초당 감소량
};

// 반동 설정
const RECOIL_CONFIG = {
  // 발당 반동 (pitch 증가량, 도)
  recoilPerShot: {
    rifle: 0.3,
    shotgun: 1.5,
    sniper: 2.0,
  },
  // 상태별 반동 배율
  aimMultiplier: {
    none: 1.0,
    hold: 0.6,
    toggle: 0.4,
  },
  postureMultiplier: {
    standing: 1.0,
    sitting: 0.8,
    crawling: 0.6,
  },
  // 반동 복귀 속도 (초당 도)
  recoverySpeed: 5.0,
  // 최대 반동
  maxRecoil: 10.0,
};

// 무기별 발사 간격 (밀리초)
const WEAPON_FIRE_INTERVALS: Record<string, number> = {
  rifle: 1000 / 20,
  shotgun: 1000 / 2,
  sniper: 1000 / 1,
};

// 무기별 한 발당 펠릿 수
const PELLET_COUNT: Record<string, number> = {
  rifle: 1,
  shotgun: 8,
  sniper: 1,
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

  // 매 프레임: 발사 체크 및 반동/퍼짐 처리
  useFrame((_, dt) => {
    const store = useGameStore.getState();
    if (store.gameMode !== 'gunGame') return;

    const state = stateRef.current;
    const now = performance.now();

    // 연사 누적 감소 (발사 안 할 때)
    if (!state.firing && store.spreadAccum > 0) {
      const newAccum = Math.max(0, store.spreadAccum - SPREAD_CONFIG.accumulationDecay * dt);
      store.setSpreadAccum(newAccum);
    }

    // 반동 복귀 (발사 안 할 때)
    if (!state.firing && store.recoilPitch > 0) {
      const newRecoil = Math.max(0, store.recoilPitch - RECOIL_CONFIG.recoverySpeed * dt);
      store.setRecoilPitch(newRecoil);
    }

    if (!state.firing) return;

    // 재장전 중이거나 탄약 없으면 발사 불가
    if (store.isReloading || store.currentAmmo <= 0) return;

    // 레이캐스트 캐시 갱신 (일정 간격마다)
    if (now - state.lastCacheTime > RAYCAST_CACHE_INTERVAL) {
      updateRaycastCache();
      state.lastCacheTime = now;
    }

    // 발사 간격 체크
    const fireInterval = WEAPON_FIRE_INTERVALS[store.weaponType];
    if (now - state.lastFireTime < fireInterval) return;
    state.lastFireTime = now;

    // 탄약 소모
    if (!store.consumeAmmo()) return;

    // 탄퍼짐 계산
    const baseSpread = SPREAD_CONFIG.baseSpread[store.weaponType as keyof typeof SPREAD_CONFIG.baseSpread];
    // 스나이퍼 스코프(토글 조준) 시 탄퍼짐 대폭 감소
    const aimMult = (store.weaponType === 'sniper' && store.aimState === 'toggle')
      ? 0.1
      : SPREAD_CONFIG.aimMultiplier[store.aimState];
    const postureMult = SPREAD_CONFIG.postureMultiplier[store.posture];
    const moveAdd = SPREAD_CONFIG.moveAddition[store.moveState];
    const spreadAccum = store.spreadAccum;

    const totalSpread = (baseSpread * aimMult * postureMult) + moveAdd + spreadAccum;

    // 연사 누적 증가
    const newAccum = Math.min(
      SPREAD_CONFIG.accumulationMax,
      spreadAccum + SPREAD_CONFIG.accumulationPerShot
    );
    store.setSpreadAccum(newAccum);

    // 반동 계산 및 적용
    const baseRecoil = RECOIL_CONFIG.recoilPerShot[store.weaponType as keyof typeof RECOIL_CONFIG.recoilPerShot];
    const recoilAimMult = RECOIL_CONFIG.aimMultiplier[store.aimState];
    const recoilPostureMult = RECOIL_CONFIG.postureMultiplier[store.posture];
    const recoilAmount = baseRecoil * recoilAimMult * recoilPostureMult;

    const newRecoil = Math.min(
      RECOIL_CONFIG.maxRecoil,
      store.recoilPitch + recoilAmount
    );
    store.setRecoilPitch(newRecoil);

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

    // 총구 → 조준점 기본 방향
    _bulletDirection.subVectors(_aimPoint, _muzzleWorldPos).normalize();

    // 탄퍼짐용 right/up 벡터 계산 (펠릿 루프 밖에서 한 번만)
    const right = new THREE.Vector3();
    const up = new THREE.Vector3();
    if (totalSpread > 0) {
      right.crossVectors(_bulletDirection, camera.up).normalize();
      up.crossVectors(right, _bulletDirection).normalize();
    }

    // 펠릿 수만큼 총알 생성
    const pelletCount = PELLET_COUNT[store.weaponType] || 1;
    for (let i = 0; i < pelletCount; i++) {
      // 각 펠릿마다 독립적인 탄퍼짐 적용
      const pelletDir = _bulletDirection.clone();

      if (totalSpread > 0) {
        const spreadRad = THREE.MathUtils.degToRad(totalSpread);
        const randomAngle = Math.random() * Math.PI * 2;
        const randomRadius = Math.random() * spreadRad;

        _spreadOffset.set(0, 0, 0);
        _spreadOffset.addScaledVector(right, Math.cos(randomAngle) * Math.sin(randomRadius));
        _spreadOffset.addScaledVector(up, Math.sin(randomAngle) * Math.sin(randomRadius));

        pelletDir.add(_spreadOffset).normalize();
      }

      tracerRef.current?.spawn(_muzzleWorldPos, pelletDir);
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
