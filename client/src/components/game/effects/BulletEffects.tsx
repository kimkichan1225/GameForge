import { useRef, useEffect, useCallback, memo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useGameStore } from '../../../stores/gameStore'
import { TracerLine } from './TracerLine'
import type { TracerLineHandle } from './TracerLine'
import { BulletDecal } from './BulletDecal'
import type { BulletDecalHandle } from './BulletDecal'
import { HitSpark } from './HitSpark'
import type { HitSparkHandle } from './HitSpark'

// GC 방지 재사용 객체
const _rayOrigin = new THREE.Vector3()
const _rayDirection = new THREE.Vector3()
const _muzzleWorldPos = new THREE.Vector3()
const _aimPoint = new THREE.Vector3()
const _bulletDirection = new THREE.Vector3()
const _spreadOffset = new THREE.Vector3()
const _raycaster = new THREE.Raycaster()
const _right = new THREE.Vector3()
const _up = new THREE.Vector3()
const _pelletDir = new THREE.Vector3()
const _muzzleToAim = new THREE.Vector3()
const _muzzleRaycaster = new THREE.Raycaster()

// 조준점 거리 (충돌 없을 때)
const AIM_DISTANCE = 500

// 탄퍼짐 설정 (도 단위)
const SPREAD_CONFIG = {
  baseSpread: {
    rifle: 1.5,
    shotgun: 5.0,
    sniper: 5.0,
  } as Record<string, number>,
  aimMultiplier: {
    none: 1.0,
    hold: 0.5,
    toggle: 0.3,
  } as Record<string, number>,
  postureMultiplier: {
    standing: 1.0,
    sitting: 0.8,
    crawling: 0.6,
  } as Record<string, number>,
  moveAddition: {
    idle: 0,
    walk: 0.5,
    run: 1.5,
    jump: 3.0,
  } as Record<string, number>,
  accumulationPerShot: 0.2,
  accumulationMax: 3.0,
  accumulationDecay: 5.0,
}

// 반동 설정
const RECOIL_CONFIG = {
  recoilPerShot: {
    rifle: 0.3,
    shotgun: 1.5,
    sniper: 2.0,
  } as Record<string, number>,
  aimMultiplier: {
    none: 1.0,
    hold: 0.6,
    toggle: 0.4,
  } as Record<string, number>,
  postureMultiplier: {
    standing: 1.0,
    sitting: 0.8,
    crawling: 0.6,
  } as Record<string, number>,
  recoverySpeed: 5.0,
  maxRecoil: 10.0,
}

// 무기별 발사 간격 (밀리초)
const WEAPON_FIRE_INTERVALS: Record<string, number> = {
  rifle: 1000 / 20,
  shotgun: 1000 / 2,
  sniper: 1000 / 1,
}

// 무기별 한 발당 펠릿 수
const PELLET_COUNT: Record<string, number> = {
  rifle: 1,
  shotgun: 8,
  sniper: 1,
}

// 레이캐스트 타겟 캐시 갱신 간격 (밀리초)
const RAYCAST_CACHE_INTERVAL = 500

// ============ BulletEffects 컴포넌트 ============
const BulletEffects = memo(function BulletEffects() {
  const { camera, scene } = useThree()

  // 이펙트 refs
  const tracerRef = useRef<TracerLineHandle | null>(null)
  const decalRef = useRef<BulletDecalHandle | null>(null)
  const sparkRef = useRef<HitSparkHandle | null>(null)

  // 발사 상태 추적
  const stateRef = useRef({
    firing: false,
    lastFireTime: 0,
    raycastTargets: [] as THREE.Object3D[],
    lastCacheTime: 0,
  })

  // 마우스 이벤트 (발사 상태 추적)
  useEffect(() => {
    const state = stateRef.current
    const onMouseDown = (e: MouseEvent) => {
      if (e.button === 0) state.firing = true
    }
    const onMouseUp = (e: MouseEvent) => {
      if (e.button === 0) state.firing = false
    }

    window.addEventListener('mousedown', onMouseDown)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [])

  // 총알 충돌 시 콜백
  const handleBulletHit = useCallback((point: THREE.Vector3, normal: THREE.Vector3) => {
    decalRef.current?.spawn(point, normal)
    sparkRef.current?.spawn(point, normal)
  }, [])

  // 레이캐스트 타겟 캐시 갱신
  const updateRaycastCache = useCallback(() => {
    const targets: THREE.Object3D[] = []
    scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh &&
          !obj.userData?.isPlayer &&
          !obj.userData?.isEffect) {
        targets.push(obj)
      }
    })
    stateRef.current.raycastTargets = targets
  }, [scene])

  // 매 프레임: 발사 체크 및 반동/퍼짐 처리
  useFrame((_, dt) => {
    const store = useGameStore.getState()
    const state = stateRef.current
    const now = performance.now()

    // 연사 누적 감소 (발사 안 할 때)
    if (!state.firing && store.spreadAccum > 0) {
      const newAccum = Math.max(0, store.spreadAccum - SPREAD_CONFIG.accumulationDecay * dt)
      store.setSpreadAccum(newAccum)
    }

    // 반동 복귀 (발사 안 할 때)
    if (!state.firing && store.recoilPitch > 0) {
      const newRecoil = Math.max(0, store.recoilPitch - RECOIL_CONFIG.recoverySpeed * dt)
      store.setRecoilPitch(newRecoil)
    }

    if (!state.firing) return

    // 재장전 중이거나 탄약 없으면 발사 불가
    if (store.isReloading || store.currentAmmo <= 0) return

    // 레이캐스트 캐시 갱신
    if (now - state.lastCacheTime > RAYCAST_CACHE_INTERVAL) {
      updateRaycastCache()
      state.lastCacheTime = now
    }

    // 발사 간격 체크
    const fireInterval = WEAPON_FIRE_INTERVALS[store.weaponType]
    if (now - state.lastFireTime < fireInterval) return
    state.lastFireTime = now

    // 탄약 소모
    if (!store.consumeAmmo()) return

    // 탄퍼짐 계산
    const baseSpread = SPREAD_CONFIG.baseSpread[store.weaponType] || 1.5
    // 스나이퍼 스코프(토글 조준) 시 탄퍼짐 대폭 감소
    const aimMult = (store.weaponType === 'sniper' && store.aimState === 'toggle')
      ? 0.1
      : (SPREAD_CONFIG.aimMultiplier[store.aimState] || 1.0)
    const postureMult = SPREAD_CONFIG.postureMultiplier[store.posture] || 1.0
    const moveAdd = SPREAD_CONFIG.moveAddition[store.moveState] || 0
    const spreadAccum = store.spreadAccum

    const totalSpread = (baseSpread * aimMult * postureMult) + moveAdd + spreadAccum

    // 연사 누적 증가
    const newAccum = Math.min(
      SPREAD_CONFIG.accumulationMax,
      spreadAccum + SPREAD_CONFIG.accumulationPerShot
    )
    store.setSpreadAccum(newAccum)

    // 반동 계산 및 적용
    const baseRecoil = RECOIL_CONFIG.recoilPerShot[store.weaponType] || 0.3
    const recoilAimMult = RECOIL_CONFIG.aimMultiplier[store.aimState] || 1.0
    const recoilPostureMult = RECOIL_CONFIG.postureMultiplier[store.posture] || 1.0
    const recoilAmount = baseRecoil * recoilAimMult * recoilPostureMult

    const newRecoil = Math.min(
      RECOIL_CONFIG.maxRecoil,
      store.recoilPitch + recoilAmount
    )
    store.setRecoilPitch(newRecoil)

    // 총구 월드 위치
    const muzzlePos = store.muzzleWorldPos
    _muzzleWorldPos.set(muzzlePos[0], muzzlePos[1], muzzlePos[2])

    // 조준점 계산 (카메라 방향으로 레이캐스트)
    _rayOrigin.copy(camera.position)
    camera.getWorldDirection(_rayDirection)
    _raycaster.set(_rayOrigin, _rayDirection)
    _raycaster.far = AIM_DISTANCE

    const intersects = _raycaster.intersectObjects(state.raycastTargets, false)

    if (intersects.length > 0) {
      _aimPoint.copy(intersects[0].point)
    } else {
      _aimPoint.copy(_rayOrigin).addScaledVector(_rayDirection, AIM_DISTANCE)
    }

    // 조준점이 총구 뒤에 있는지 검증 (TPS 벽 뒤 역방향 발사 방지)
    _muzzleToAim.subVectors(_aimPoint, _muzzleWorldPos)
    if (_muzzleToAim.dot(_rayDirection) < 0) {
      // 조준점이 총구 뒤쪽 → 카메라 전방 방향으로 대체
      _aimPoint.copy(_muzzleWorldPos).addScaledVector(_rayDirection, AIM_DISTANCE)
      _muzzleToAim.subVectors(_aimPoint, _muzzleWorldPos)
    }

    // 총구 → 조준점 2차 레이캐스트 (벽 관통 방지)
    const muzzleToAimDist = _muzzleToAim.length()
    _bulletDirection.copy(_muzzleToAim).divideScalar(muzzleToAimDist)
    _muzzleRaycaster.set(_muzzleWorldPos, _bulletDirection)
    _muzzleRaycaster.far = muzzleToAimDist
    const muzzleHits = _muzzleRaycaster.intersectObjects(state.raycastTargets, false)
    if (muzzleHits.length > 0) {
      // 총구와 조준점 사이에 벽이 있으면 벽 지점을 조준점으로 사용
      _aimPoint.copy(muzzleHits[0].point)
    }

    // 총구 → 조준점 기본 방향
    _bulletDirection.subVectors(_aimPoint, _muzzleWorldPos).normalize()

    // 탄퍼짐용 right/up 벡터 계산
    if (totalSpread > 0) {
      _right.crossVectors(_bulletDirection, camera.up).normalize()
      _up.crossVectors(_right, _bulletDirection).normalize()
    }

    // 펠릿 수만큼 총알 생성
    const pelletCount = PELLET_COUNT[store.weaponType] || 1
    for (let i = 0; i < pelletCount; i++) {
      _pelletDir.copy(_bulletDirection)

      if (totalSpread > 0) {
        const spreadRad = THREE.MathUtils.degToRad(totalSpread)
        const randomAngle = Math.random() * Math.PI * 2
        const randomRadius = Math.random() * spreadRad

        _spreadOffset.set(0, 0, 0)
        _spreadOffset.addScaledVector(_right, Math.cos(randomAngle) * Math.sin(randomRadius))
        _spreadOffset.addScaledVector(_up, Math.sin(randomAngle) * Math.sin(randomRadius))

        _pelletDir.add(_spreadOffset).normalize()
      }

      tracerRef.current?.spawn(_muzzleWorldPos, _pelletDir, store.weaponType)
    }
  })

  return (
    <>
      <TracerLine tracerRef={tracerRef} onHit={handleBulletHit} />
      <BulletDecal decalRef={decalRef} />
      <HitSpark sparkRef={sparkRef} />
    </>
  )
})

export default BulletEffects
