import { useRef, useEffect, useMemo, useCallback, memo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useGLTF, useAnimations, useFBX } from '@react-three/drei'
import * as THREE from 'three'
import { useInput } from '../../hooks/useInput'
import { useGameStore, WEAPON_CONFIG } from '../../stores/gameStore'
import type { WeaponType, Posture } from '../../stores/gameStore'
import {
  checkGrounded,
  updatePlayerCollider,
  COLLIDER_CONFIG,
  RAPIER,
} from '../../lib/physics'

// ============ 상수 ============
const WALK_SPEED = 4
const RUN_SPEED = 8
const SIT_SPEED = 3
const JUMP_POWER = 8
const FALL_THRESHOLD = -10
const HEAD_MAX_ANGLE = Math.PI / 3
const PI2 = Math.PI * 2

// 무기별 발사 설정
const WEAPON_FIRE_CONFIG: Record<string, { fireRate: number; flashDuration: number; lightColor: number; lightIntensity: number; lightDistance: number; flashPosition: [number, number, number]; rotation: THREE.Euler; position: [number, number, number] }> = {
  rifle: {
    fireRate: 20, flashDuration: 0.03,
    lightColor: 0xffaa00, lightIntensity: 5, lightDistance: 3,
    flashPosition: [0, 145, 0],
    rotation: new THREE.Euler(0, THREE.MathUtils.degToRad(180), THREE.MathUtils.degToRad(80)),
    position: [0, 0.15, 0],
  },
  shotgun: {
    fireRate: 2, flashDuration: 0.08,
    lightColor: 0xff3300, lightIntensity: 8, lightDistance: 4,
    flashPosition: [-15, 155, 0],
    rotation: new THREE.Euler(0, THREE.MathUtils.degToRad(180), THREE.MathUtils.degToRad(80)),
    position: [0.2, 0.15, 0],
  },
  sniper: {
    fireRate: 1, flashDuration: 0.06,
    lightColor: 0xffffff, lightIntensity: 4, lightDistance: 2,
    flashPosition: [-25, 220, 0],
    rotation: new THREE.Euler(0, THREE.MathUtils.degToRad(180), THREE.MathUtils.degToRad(80)),
    position: [0.2, 0.15, 0],
  },
}

// 무기별 탄창 크기
const MAGAZINE_SIZE: Record<string, number> = { rifle: 30, shotgun: 8, sniper: 5 }
const RELOAD_TIME: Record<string, number> = { rifle: 2.5, shotgun: 2.5, sniper: 3.0 }

// 8방향 애니메이션 매핑
const ANIM_TARGETS: Record<string, string> = {
  'Idle': 'Idle-Rifle',
  'RunFront': 'RunFront-Rifle', 'RunBack': 'RunBack-Rifle',
  'RunLeft': 'RunLeft-Rifle', 'RunRight': 'RunRight-Rifle',
  'RunFrontLeft': 'RunFrontLeft-Rifle', 'RunFrontRight': 'RunFrontRight-Rifle',
  'RunBackLeft': 'RunBackLeft-Rifle', 'RunBackRight': 'RunBackRight-Rifle',
  'WalkFront': 'WalkFront-Rifle', 'WalkBack': 'WalkBack-Rifle',
  'WalkLeft': 'WalkLeft-Rifle', 'WalkRight': 'WalkRight-Rifle',
  'WalkFrontLeft': 'WalkFrontLeft-Rifle', 'WalkFrontRight': 'WalkFrontRight-Rifle',
  'WalkBackLeft': 'WalkBackLeft-Rifle', 'WalkBackRight': 'WalkBackRight-Rifle',
  'SitIdle': 'SitIdle-Rifle',
  'SitWalkFront': 'SitWalkFront-Rifle', 'SitWalkBack': 'SitWalkBack-Rifle',
  'SitWalkLeft': 'SitWalkLeft-Rifle', 'SitWalkRight': 'SitWalkRight-Rifle',
  'SitWalkFrontLeft': 'SitWalkFrontLeft-Rifle', 'SitWalkFrontRight': 'SitWalkFrontRight-Rifle',
  'SitWalkBackLeft': 'SitWalkBackLeft-Rifle', 'SitWalkBackRight': 'SitWalkBackRight-Rifle',
  'CrawlIdle': 'CrawlIdle-Rifle',
  'Jump': 'Jump',
  'IdleFiring': 'IdleFiring-Rifle', 'WalkFiring': 'WalkFiring-Rifle', 'RunFiring': 'RunFiring-Rifle',
  'IdleAiming': 'IdleAiming-Rifle', 'WalkAiming': 'WalkAiming-Rifle',
  'Reload': 'Reload-Rifle',
}

// 1인칭 풀암 애니메이션 매핑
const FPS_ARMS_ANIM_MAP: Record<string, string> = {
  'Idle': 'IdleAiming', 'IdleAiming': 'IdleAiming',
  'WalkFront': 'WalkAiming', 'WalkAiming': 'WalkAiming',
}

// 풀암 오프셋
const ARMS_OFFSET = {
  standing: { x: 0, y: -2.2, z: 0 },
  sitting: { x: -0.3, y: -1.4, z: 0.4 },
  crawling: { x: 0, y: -0.7, z: 0 },
}

// 1인칭 토글 조준 시 총/팔 오프셋
const AIM_WEAPON_OFFSET = { x: 0, y: -0.4, z: -0.5 }
const AIM_WEAPON_ROT = { x: Math.PI / 22, y: -Math.PI / 2, z: Math.PI / 2 }
const AIM_ARMS_OFFSET = { x: -0.35, y: 0, z: 0 }

// 상체 본 (재장전 마스킹)
const UPPER_BODY_BONES = new Set([
  'mixamorigSpine', 'mixamorigSpine1', 'mixamorigSpine2',
  'mixamorigNeck', 'mixamorigHead', 'mixamorigHeadTop_End',
  'mixamorigLeftShoulder', 'mixamorigLeftArm', 'mixamorigLeftForeArm',
  'mixamorigLeftHand', 'mixamorigLeftHandIndex1', 'mixamorigLeftHandIndex2',
  'mixamorigLeftHandIndex3', 'mixamorigLeftHandIndex4',
  'mixamorigRightShoulder', 'mixamorigRightArm', 'mixamorigRightForeArm',
  'mixamorigRightHand', 'mixamorigRightHandIndex1', 'mixamorigRightHandIndex2',
  'mixamorigRightHandIndex3', 'mixamorigRightHandIndex4',
])

function createUpperBodyClip(clip: THREE.AnimationClip): THREE.AnimationClip {
  const tracks = clip.tracks.filter(track => {
    const boneName = track.name.split('.')[0]
    return UPPER_BODY_BONES.has(boneName)
  })
  return new THREE.AnimationClip(clip.name + '_upper', clip.duration, tracks)
}

// 재사용 객체
const _vel = new THREE.Vector3()
const _move = new THREE.Vector3()
const _yAxis = new THREE.Vector3(0, 1, 0)
const _targetQuat = new THREE.Quaternion()
const _weaponOffset = new THREE.Vector3()
const _armsOffset = new THREE.Vector3()
const _armsRotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI)
const _aimWeaponTarget = new THREE.Vector3()
const _aimWeaponQuat = new THREE.Quaternion()
const _aimRotationOffset = new THREE.Quaternion()
const _muzzleWorldPos = new THREE.Vector3()
const _armsTargetPos = new THREE.Vector3()
const _armsTargetQuat = new THREE.Quaternion()
const _recoilEuler = new THREE.Euler()

// Utility
const clamp = (v: number, min: number, max: number) => v < min ? min : v > max ? max : v
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
function normalizeAngle(angle: number): number {
  while (angle > Math.PI) angle -= PI2
  while (angle < -Math.PI) angle += PI2
  return angle
}
function lerpAngle(from: number, to: number, t: number): number {
  return from + normalizeAngle(to - from) * t
}

// 8방향 계산
const DIRS = ['', 'Front', 'Back', '', 'Left', 'FrontLeft', 'BackLeft', '', 'Right', 'FrontRight', 'BackRight']
function getDirection(f: boolean, b: boolean, l: boolean, r: boolean): string {
  const idx = (f ? 1 : 0) | (b ? 2 : 0) | (l ? 4 : 0) | (r ? 8 : 0)
  return DIRS[idx] || ''
}

// 총구 플래시 텍스처
const createMuzzleFlashTexture = () => {
  const canvas = document.createElement('canvas')
  canvas.width = 128; canvas.height = 128
  const ctx = canvas.getContext('2d')!
  const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64)
  gradient.addColorStop(0, 'rgba(255,255,255,1)')
  gradient.addColorStop(0.2, 'rgba(255,255,200,1)')
  gradient.addColorStop(0.5, 'rgba(255,220,150,0.8)')
  gradient.addColorStop(1, 'rgba(255,200,100,0)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, 128, 128)
  return new THREE.CanvasTexture(canvas)
}
const MUZZLE_FLASH_TEXTURE = createMuzzleFlashTexture()
const MUZZLE_FLASH_MATERIAL = new THREE.SpriteMaterial({
  map: MUZZLE_FLASH_TEXTURE, transparent: true,
  blending: THREE.AdditiveBlending, depthWrite: false,
})

const GUN_MATERIAL = new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.8, roughness: 0.3 })

// ============ PhysicsContext 타입 ============
interface PhysicsContext {
  world: RAPIER.World
  playerBody: RAPIER.RigidBody
  playerColliderRef: React.MutableRefObject<RAPIER.Collider>
}

// ============ GunPlayer 컴포넌트 ============
const GunPlayer = memo(function GunPlayer({
  startPosition,
  physics,
  weaponType,
}: {
  startPosition: [number, number, number]
  physics: PhysicsContext
  weaponType: WeaponType
}) {
  const group = useRef<THREE.Group>(null!)
  const armsGroup = useRef<THREE.Group>(null!)

  const { scene, animations } = useGLTF('/Guntest.glb')
  const { scene: armsScene, animations: armsAnimations } = useGLTF('/Onlyarms.glb')
  const rifleFbx = useFBX('/Rifle.fbx')
  const shotgunFbx = useFBX('/Shotgun.fbx')
  const sniperFbx = useFBX('/Sniper.fbx')
  const { actions, names } = useAnimations(animations, scene)
  const { actions: armsActions, names: armsNames } = useAnimations(armsAnimations, armsScene)

  // Refs
  const headBone = useRef<THREE.Bone | null>(null)
  const rightHandBone = useRef<THREE.Bone | null>(null)
  const armsRightHandBone = useRef<THREE.Bone | null>(null)
  const tpsWeaponRef = useRef<THREE.Group>(null)
  const fpsWeaponRef = useRef<THREE.Group>(null)
  const muzzleFlashRef = useRef<THREE.PointLight>(null)
  const tpsMuzzleFlashRef = useRef<THREE.PointLight>(null)
  const fpsMuzzleSpriteRef = useRef<THREE.Sprite>(null)
  const tpsMuzzleSpriteRef = useRef<THREE.Sprite>(null)
  const animMapRef = useRef<Record<string, string>>({})
  const armsAnimMapRef = useRef<Record<string, string>>({})
  const upperBodyActionsRef = useRef<Record<string, THREE.AnimationAction>>({})
  const armsReloadActionRef = useRef<THREE.AnimationAction | null>(null)
  const lowerBodyAnimRef = useRef<string>('')
  const currentPosture = useRef<Posture>('standing')

  const stateRef = useRef({
    currentAnim: '', currentArmsAnim: '',
    prevViewMode: 'tps' as string, prevToggleAiming: false,
    prevSpace: false, prevC: false, prevV: false, prevZ: false, prevR: false,
    reloadTimer: 0, headRotY: 0,
    bodyAngle: 0, muzzleTimer: 0, lastShotAnimTime: 0,
    initialized: false,
    isJumping: false, wasAirborne: false,
  })

  const mouseRef = useRef({
    firing: false, aiming: false,
    aimingToggle: false, aimingHold: false,
    rightClickStartTime: 0, rightClickHandled: false,
    aimTransitionTimer: 0,
    recoilX: 0, recoilY: 0, recoilZ: 0, lastFireTime: 0,
  })

  const input = useInput()

  // 마우스 이벤트
  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      if (e.button === 0) mouseRef.current.firing = true
      if (e.button === 2) mouseRef.current.aiming = true
    }
    const onMouseUp = (e: MouseEvent) => {
      if (e.button === 0) mouseRef.current.firing = false
      if (e.button === 2) mouseRef.current.aiming = false
    }
    const onContextMenu = (e: MouseEvent) => e.preventDefault()
    window.addEventListener('mousedown', onMouseDown)
    window.addEventListener('mouseup', onMouseUp)
    window.addEventListener('contextmenu', onContextMenu)
    return () => {
      window.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('mouseup', onMouseUp)
      window.removeEventListener('contextmenu', onContextMenu)
    }
  }, [])

  // 본 탐색 + isPlayer 마킹
  useEffect(() => {
    scene.traverse(obj => {
      obj.userData.isPlayer = true
      if (obj instanceof THREE.Bone) {
        if (obj.name === 'mixamorigHead') headBone.current = obj
        else if (obj.name === 'mixamorigRightHand') rightHandBone.current = obj
      }
    })
    armsScene.traverse(obj => {
      obj.userData.isPlayer = true
      obj.frustumCulled = false  // 카메라 근접 배치 시 컬링 방지
      if (obj instanceof THREE.Bone) {
        if (obj.name === 'mixamorigRightHand') armsRightHandBone.current = obj
      }
    })
  }, [scene, armsScene])

  // 애니메이션 맵 빌드
  useEffect(() => {
    if (names.length === 0) return
    const map: Record<string, string> = {}
    for (const [key, term] of Object.entries(ANIM_TARGETS)) {
      const found = names.find(n => n.split('|').pop() === term)
      if (found) map[key] = found
    }
    animMapRef.current = map

    const idleClip = map['Idle']
    if (idleClip && actions[idleClip]) {
      actions[idleClip].reset().fadeIn(0).play()
      actions[idleClip].setLoop(THREE.LoopRepeat, Infinity)
      stateRef.current.currentAnim = 'Idle'
      stateRef.current.initialized = true
      useGameStore.getState().setAnimation('Idle')
    }

    // 상체 전용 재장전 클립
    const reloadClipName = map['Reload']
    if (reloadClipName && actions[reloadClipName]) {
      const mixer = actions[reloadClipName].getMixer()
      const originalClip = actions[reloadClipName].getClip()
      const upperBodyClip = createUpperBodyClip(originalClip)
      upperBodyActionsRef.current['Reload'] = mixer.clipAction(upperBodyClip)
    }
  }, [names, actions])

  // 풀암 애니메이션 맵
  useEffect(() => {
    if (armsNames.length === 0) return
    const map: Record<string, string> = {}
    for (const [key, term] of Object.entries(ANIM_TARGETS)) {
      const found = armsNames.find(n => n.split('|').pop() === term)
      if (found) map[key] = found
    }
    armsAnimMapRef.current = map

    const idleClip = map['Idle']
    if (idleClip && armsActions[idleClip]) {
      armsActions[idleClip].reset().fadeIn(0).play()
      armsActions[idleClip].setLoop(THREE.LoopRepeat, Infinity)
      stateRef.current.currentArmsAnim = 'Idle'
    }

    const armsReloadClip = map['Reload']
    if (armsReloadClip && armsActions[armsReloadClip]) {
      armsReloadActionRef.current = armsActions[armsReloadClip]
    }
  }, [armsNames, armsActions])

  // 탄약 초기화
  useEffect(() => {
    useGameStore.getState().resetAmmo(weaponType)
  }, [weaponType])

  // 애니메이션 재생
  const playAnim = useCallback((name: string) => {
    const s = stateRef.current
    const map = animMapRef.current
    const armsMap = armsAnimMapRef.current
    if (s.currentAnim === name) return
    if (!map[name]) return

    const clipName = map[name]
    const action = actions[clipName]
    if (!action) return

    const prevClip = map[s.currentAnim]
    if (prevClip) actions[prevClip]?.fadeOut(0.2)
    action.reset().fadeIn(0.2).play()

    // 풀암 애니메이션
    const store = useGameStore.getState()
    const useFpsAnim = store.viewMode === 'fps' || store.isToggleAiming
    const armsAnimName = useFpsAnim ? (FPS_ARMS_ANIM_MAP[name] || name) : name
    if (s.currentArmsAnim !== armsAnimName) {
      const armsClipName = armsMap[armsAnimName]
      if (armsClipName && armsActions[armsClipName]) {
        if (s.currentArmsAnim && armsMap[s.currentArmsAnim]) {
          armsActions[armsMap[s.currentArmsAnim]]?.fadeOut(0.2)
        }
        const armsAction = armsActions[armsClipName]
        armsAction.reset().fadeIn(0.2).play()

        const wt = store.weaponType
        const isSingleShot = (armsAnimName === 'IdleFiring' || armsAnimName === 'WalkFiring' || armsAnimName === 'RunFiring')
          && (wt === 'shotgun' || wt === 'sniper')
        if (armsAnimName === 'Jump' || armsAnimName === 'Reload' || isSingleShot) {
          armsAction.setLoop(THREE.LoopOnce, 1)
          armsAction.clampWhenFinished = true
        } else {
          armsAction.setLoop(THREE.LoopRepeat, Infinity)
        }
        s.currentArmsAnim = armsAnimName
      }
    }

    const wt = useGameStore.getState().weaponType
    const isSingleShot = (name === 'IdleFiring' || name === 'WalkFiring' || name === 'RunFiring')
      && (wt === 'shotgun' || wt === 'sniper')
    if (name === 'Jump' || name === 'Reload' || isSingleShot) {
      action.setLoop(THREE.LoopOnce, 1)
      action.clampWhenFinished = true
    } else {
      action.setLoop(THREE.LoopRepeat, Infinity)
    }

    s.currentAnim = name
    useGameStore.getState().setAnimation(name)
  }, [actions, armsActions])

  // 방향별 애니메이션
  const getDirectionalAnim = useCallback((dir: string, running: boolean, posture: string, firing: boolean, aiming: boolean): string => {
    const canAim = aiming && !running && posture === 'standing'
    const wt = useGameStore.getState().weaponType
    if ((wt === 'shotgun' || wt === 'sniper') && firing) {
      const now = performance.now()
      const fireIntervalMs = 1000 / WEAPON_FIRE_CONFIG[wt].fireRate
      if (now - stateRef.current.lastShotAnimTime < fireIntervalMs) firing = false
    }
    if (!dir) {
      if (posture === 'sitting') return 'SitIdle'
      if (posture === 'crawling') return 'CrawlIdle'
      if (canAim && firing) return 'IdleFiring'
      if (canAim) return 'IdleAiming'
      if (firing && posture === 'standing') return 'IdleFiring'
      return 'Idle'
    }
    if (posture === 'sitting') return `SitWalk${dir}`
    if (posture === 'crawling') return 'CrawlIdle'
    if (dir === 'Front') {
      if (canAim && firing) return 'WalkFiring'
      if (canAim) return 'WalkAiming'
      if (firing) return running ? 'RunFiring' : 'WalkFiring'
    }
    return `${running ? 'Run' : 'Walk'}${dir}`
  }, [])

  // 무기 모델
  const weaponFbxMap = useMemo(() => ({ rifle: rifleFbx, shotgun: shotgunFbx, sniper: sniperFbx }), [rifleFbx, shotgunFbx, sniperFbx])

  const tpsWeaponModel = useMemo(() => {
    const fbx = weaponFbxMap[weaponType]
    const cfg = WEAPON_FIRE_CONFIG[weaponType]
    const model = fbx.clone()
    model.traverse(child => {
      child.userData.isPlayer = true
      if ((child as THREE.Mesh).isMesh) (child as THREE.Mesh).material = GUN_MATERIAL
    })
    model.rotation.copy(cfg.rotation)
    return model
  }, [weaponFbxMap, weaponType])

  const fpsWeaponModel = useMemo(() => {
    const fbx = weaponFbxMap[weaponType]
    const cfg = WEAPON_FIRE_CONFIG[weaponType]
    const model = fbx.clone()
    model.traverse(child => {
      child.userData.isPlayer = true
      if ((child as THREE.Mesh).isMesh) (child as THREE.Mesh).material = GUN_MATERIAL
    })
    model.rotation.copy(cfg.rotation)
    return model
  }, [weaponFbxMap, weaponType])

  // ============ 메인 프레임 루프 ============
  useFrame((threeState, dt) => {
    if (!group.current) return

    const s = stateRef.current
    const keys = input.current
    const mouse = mouseRef.current
    const store = useGameStore.getState()
    const { posture } = store
    const lookDir = store.cameraAngle  // 카메라 앵글을 lookDirection으로 사용
    const { world, playerBody, playerColliderRef } = physics

    if (!playerColliderRef.current) return
    let vel: { x: number; y: number; z: number }
    try { vel = playerBody.linvel() } catch { return }
    const centerY = COLLIDER_CONFIG[posture].centerY

    // 자세 콜라이더 업데이트
    if (posture !== currentPosture.current) {
      const newCollider = updatePlayerCollider(world, playerBody, playerColliderRef.current, currentPosture.current, posture)
      playerColliderRef.current = newCollider
      currentPosture.current = posture
    }

    // 바닥 체크
    const isGrounded = checkGrounded(world, playerBody, playerColliderRef.current, posture)

    // 발사 가능 조건
    const canFire = mouse.firing && store.currentAmmo > 0 && !store.isReloading

    // 모델 표시 전환
    const showFpsView = store.viewMode === 'fps' || mouse.aimingToggle
    scene.visible = !showFpsView
    armsScene.visible = showFpsView

    // 조준 처리
    const holdThreshold = 0.2
    const isMoving = keys.forward || keys.backward || keys.left || keys.right
    const isRunning = keys.shift && isMoving && posture === 'standing' && !store.isReloading

    if (isRunning && mouse.aimingToggle) {
      mouse.aimingToggle = false
      mouse.aimTransitionTimer = 0
      store.setIsToggleAiming(false)
    }
    if (!isGrounded && (mouse.aimingToggle || mouse.aimingHold)) {
      mouse.aimingToggle = false
      mouse.aimingHold = false
      mouse.aimTransitionTimer = 0
      store.setIsToggleAiming(false)
    }

    if (mouse.aiming) {
      if (mouse.rightClickStartTime === 0) {
        mouse.rightClickStartTime = performance.now() / 1000
        mouse.rightClickHandled = false
      }
      const holdTime = (performance.now() / 1000) - mouse.rightClickStartTime
      if (holdTime >= holdThreshold && !mouse.rightClickHandled && !isRunning && isGrounded) {
        mouse.aimingHold = true
        mouse.rightClickHandled = true
      }
    } else {
      if (mouse.rightClickStartTime > 0) {
        const holdTime = (performance.now() / 1000) - mouse.rightClickStartTime
        if (!mouse.rightClickHandled && holdTime < holdThreshold && !isRunning && isGrounded) {
          mouse.aimingToggle = !mouse.aimingToggle
          mouse.aimTransitionTimer = 0
          store.setIsToggleAiming(mouse.aimingToggle)
        }
        mouse.aimingHold = false
        mouse.rightClickStartTime = 0
        mouse.rightClickHandled = false
      }
    }

    const newAimState = mouse.aimingToggle ? 'toggle' : mouse.aimingHold ? 'hold' : 'none'
    if (store.aimState !== newAimState) store.setAimState(newAimState)
    const newMoveState = !isGrounded ? 'idle' : isRunning ? 'run' : isMoving ? 'walk' : 'idle'
    if (store.moveState !== newMoveState) store.setMoveState(newMoveState)
    if (store.isFiring !== mouse.firing) store.setIsFiring(mouse.firing)

    // 시점/토글 변경 시 풀암 애니메이션 갱신
    const viewOrAimChanged = s.prevViewMode !== store.viewMode || s.prevToggleAiming !== mouse.aimingToggle
    if (viewOrAimChanged && s.currentAnim) {
      s.prevViewMode = store.viewMode
      s.prevToggleAiming = mouse.aimingToggle
      const armsMap = armsAnimMapRef.current
      const armsAnimName = showFpsView ? (FPS_ARMS_ANIM_MAP[s.currentAnim] || s.currentAnim) : s.currentAnim
      const armsClipName = armsMap[armsAnimName]
      if (armsClipName && armsActions[armsClipName]) {
        if (s.currentArmsAnim && armsMap[s.currentArmsAnim]) armsActions[armsMap[s.currentArmsAnim]]?.fadeOut(0.2)
        armsActions[armsClipName].reset().fadeIn(0.2).play()
        armsActions[armsClipName].setLoop(THREE.LoopRepeat, Infinity)
        s.currentArmsAnim = armsAnimName
      }
    }

    // 풀암 모델: 카메라에 고정
    if (showFpsView && armsGroup.current) {
      const camera = threeState.camera
      const off = ARMS_OFFSET[posture] || ARMS_OFFSET.standing
      const targetX = mouse.aimingToggle ? off.x + AIM_ARMS_OFFSET.x : off.x
      const targetY = mouse.aimingToggle ? off.y + AIM_ARMS_OFFSET.y : off.y
      const targetZ = mouse.aimingToggle ? off.z + AIM_ARMS_OFFSET.z : off.z
      _armsOffset.set(targetX, targetY, targetZ).applyQuaternion(camera.quaternion)
      _armsTargetPos.copy(camera.position).add(_armsOffset)
      _armsTargetQuat.copy(camera.quaternion).multiply(_armsRotation)
      armsGroup.current.position.copy(_armsTargetPos)
      armsGroup.current.quaternion.copy(_armsTargetQuat)
    }

    s.bodyAngle = store.bodyAngle

    // 자세 전환
    if (keys.c && !s.prevC && isGrounded) store.setPosture(posture === 'sitting' ? 'standing' : 'sitting')
    if (keys.z && !s.prevZ && isGrounded) store.setPosture(posture === 'crawling' ? 'standing' : 'crawling')
    if (keys.v && !s.prevV) store.setViewMode(store.viewMode === 'fps' ? 'tps' : 'fps')

    // 재장전
    const reloadTime = RELOAD_TIME[store.weaponType]
    const upperReloadAction = upperBodyActionsRef.current['Reload']
    if (store.isReloading) {
      s.reloadTimer += dt
      store.updateReloadProgress(Math.min(1, s.reloadTimer / reloadTime))
      // 하체 이동 애니메이션 유지
      const dir = getDirection(keys.forward, keys.backward, keys.left, keys.right)
      const newLowerAnim = getDirectionalAnim(dir, false, posture, false, false)
      if (newLowerAnim !== lowerBodyAnimRef.current) {
        const map = animMapRef.current
        const prevClip = map[lowerBodyAnimRef.current]
        if (prevClip && actions[prevClip]) actions[prevClip].fadeOut(0.2)
        const newClip = map[newLowerAnim]
        if (newClip && actions[newClip]) {
          actions[newClip].reset().fadeIn(0.2).play()
          actions[newClip].setLoop(THREE.LoopRepeat, Infinity)
        }
        lowerBodyAnimRef.current = newLowerAnim
      }
      if (s.reloadTimer >= reloadTime) {
        store.finishReload()
        s.reloadTimer = 0
        const map = animMapRef.current
        const lowerClip = map[lowerBodyAnimRef.current]
        if (lowerClip && actions[lowerClip]) actions[lowerClip].stop()
        if (upperReloadAction) upperReloadAction.stop()
        const armsReloadAction = armsReloadActionRef.current
        if (armsReloadAction) armsReloadAction.stop()
        lowerBodyAnimRef.current = ''
        const nextAnim = getDirectionalAnim(dir, false, posture, canFire, mouse.aiming)
        const nextClip = map[nextAnim]
        if (nextClip && actions[nextClip]) {
          actions[nextClip].reset().setEffectiveWeight(1).play()
          actions[nextClip].setLoop(THREE.LoopRepeat, Infinity)
          s.currentAnim = nextAnim
          useGameStore.getState().setAnimation(nextAnim)
        }
        // 풀암 복귀
        const armsMap = armsAnimMapRef.current
        const useFpsAnim = store.viewMode === 'fps' || mouse.aimingToggle
        const armsAnimName = useFpsAnim ? (FPS_ARMS_ANIM_MAP[nextAnim] || nextAnim) : nextAnim
        const armsClip = armsMap[armsAnimName]
        if (armsClip && armsActions[armsClip]) {
          armsActions[armsClip].reset().setEffectiveWeight(1).play()
          armsActions[armsClip].setLoop(THREE.LoopRepeat, Infinity)
          s.currentArmsAnim = armsAnimName
        }
      }
    } else {
      const canReload = isGrounded && !isRunning &&
        store.currentAmmo < MAGAZINE_SIZE[store.weaponType] && store.reserveAmmo > 0
      if (keys.r && !s.prevR && canReload) {
        store.startReload()
        s.reloadTimer = 0
        if (mouse.aimingToggle) { mouse.aimingToggle = false; store.setIsToggleAiming(false) }
        if (upperReloadAction) {
          const dir = getDirection(keys.forward, keys.backward, keys.left, keys.right)
          const lowerAnim = getDirectionalAnim(dir, false, posture, false, false)
          lowerBodyAnimRef.current = lowerAnim
          const map = animMapRef.current
          const prevClip = map[s.currentAnim]
          if (prevClip && actions[prevClip]) actions[prevClip].stop()
          const lowerClip = map[lowerAnim]
          if (lowerClip && actions[lowerClip]) {
            actions[lowerClip].reset().setEffectiveWeight(1).play()
            actions[lowerClip].setLoop(THREE.LoopRepeat, Infinity)
          }
          upperReloadAction.reset().setEffectiveWeight(1).play()
          upperReloadAction.setLoop(THREE.LoopOnce, 1)
          upperReloadAction.clampWhenFinished = true
          const armsReloadAction = armsReloadActionRef.current
          if (armsReloadAction) {
            const armsMap = armsAnimMapRef.current
            const prevArmsClip = armsMap[s.currentArmsAnim]
            if (prevArmsClip && armsActions[prevArmsClip]) armsActions[prevArmsClip].stop()
            armsReloadAction.reset().setEffectiveWeight(1).play()
            armsReloadAction.setLoop(THREE.LoopOnce, 1)
            armsReloadAction.clampWhenFinished = true
            s.currentArmsAnim = 'Reload'
          }
          s.currentAnim = 'Reload'
          useGameStore.getState().setAnimation('Reload')
        }
      }
    }

    // 점프 상태 추적 (Rapier는 점프 직후에도 grounded=true일 수 있음)
    if (s.isJumping) {
      if (!isGrounded) s.wasAirborne = true
      if (s.wasAirborne && isGrounded) {
        s.isJumping = false
        s.wasAirborne = false
      }
    }

    // 점프
    let shouldJump = false
    if (keys.space && !s.prevSpace && isGrounded && posture === 'standing' && !store.isReloading) {
      shouldJump = true
      s.isJumping = true
      s.wasAirborne = false
      playAnim('Jump')
    }

    s.prevSpace = keys.space; s.prevC = keys.c; s.prevV = keys.v; s.prevZ = keys.z; s.prevR = keys.r

    // 머리 회전
    const angleDiff = normalizeAngle(lookDir - s.bodyAngle)
    if (headBone.current) {
      const clampedHead = clamp(angleDiff, -HEAD_MAX_ANGLE, HEAD_MAX_ANGLE)
      s.headRotY = lerp(s.headRotY, clampedHead, 0.15)
      headBone.current.rotation.y = s.headRotY
    }

    // 몸체 회전
    const absAngleDiff = Math.abs(angleDiff)
    if (absAngleDiff > 0.01) {
      const speedFactor = absAngleDiff > HEAD_MAX_ANGLE ? 0.12 : 0.03 + (absAngleDiff / HEAD_MAX_ANGLE) * 0.05
      s.bodyAngle = lerpAngle(s.bodyAngle, lookDir, speedFactor)
      store.setBodyAngle(s.bodyAngle)
    }

    // 이동
    _move.set(0, 0, 0)
    if (keys.forward) _move.z -= 1
    if (keys.backward) _move.z += 1
    if (keys.left) _move.x -= 1
    if (keys.right) _move.x += 1

    const moving = _move.lengthSq() > 0
    let speed = posture === 'sitting' ? SIT_SPEED : isRunning ? RUN_SPEED : WALK_SPEED
    if (!isGrounded) speed *= 0.8

    if (moving && posture !== 'crawling') {
      _move.normalize().applyAxisAngle(_yAxis, s.bodyAngle)
    } else {
      _move.set(0, 0, 0)
    }

    _targetQuat.setFromAxisAngle(_yAxis, s.bodyAngle + Math.PI)
    scene.quaternion.slerp(_targetQuat, 0.15)

    if (isGrounded && !s.isJumping && !useGameStore.getState().isReloading) {
      const dir = getDirection(keys.forward, keys.backward, keys.left, keys.right)
      playAnim(getDirectionalAnim(dir, isRunning, posture, canFire, mouse.aiming))
    }

    // 물리 적용
    playerBody.setLinvel({ x: _move.x * speed, y: shouldJump ? JUMP_POWER : vel.y, z: _move.z * speed }, true)
    try { world.step() } catch { return }

    const pos = playerBody.translation()
    group.current.position.set(pos.x, pos.y - centerY, pos.z)
    store.setPlayerPos([pos.x, pos.y - centerY, pos.z])
    store.setGroundedState(isGrounded, !shouldJump)

    // 재시작
    if (store.restartRequested) {
      store.clearRestartRequest()
      playerBody.setTranslation({ x: startPosition[0], y: startPosition[1] + centerY + 1, z: startPosition[2] }, true)
      playerBody.setLinvel({ x: 0, y: 0, z: 0 }, true)
      store.resetAmmo(weaponType)
      playAnim('Idle')
      return
    }

    // 낙사
    if (pos.y - centerY < FALL_THRESHOLD) {
      playerBody.setTranslation({ x: startPosition[0], y: startPosition[1] + centerY + 1, z: startPosition[2] }, true)
      playerBody.setLinvel({ x: 0, y: 0, z: 0 }, true)
    }

    // 무기 위치 (3인칭)
    const cfg = WEAPON_FIRE_CONFIG[store.weaponType]
    if (tpsWeaponRef.current && rightHandBone.current) {
      rightHandBone.current.getWorldPosition(tpsWeaponRef.current.position)
      rightHandBone.current.getWorldQuaternion(tpsWeaponRef.current.quaternion)
      _weaponOffset.set(cfg.position[0], cfg.position[1], cfg.position[2]).applyQuaternion(tpsWeaponRef.current.quaternion)
      tpsWeaponRef.current.position.add(_weaponOffset)
      tpsWeaponRef.current.visible = !showFpsView
    }

    // 무기 위치 (1인칭)
    if (fpsWeaponRef.current && armsRightHandBone.current) {
      if (showFpsView && mouse.aimingToggle) {
        const camera = threeState.camera
        const now = performance.now()
        const fireInterval = 1000 / cfg.fireRate
        if (canFire && now - mouse.lastFireTime > fireInterval) {
          mouse.recoilY = Math.random() * 0.02
          mouse.recoilX = (Math.random() - 0.5) * 0.02
          mouse.recoilZ = 0.05 + Math.random() * 0.02
          mouse.lastFireTime = now
        }
        mouse.recoilX *= 0.85; mouse.recoilY *= 0.85; mouse.recoilZ *= 0.85
        _aimWeaponTarget.set(AIM_WEAPON_OFFSET.x + mouse.recoilX, AIM_WEAPON_OFFSET.y + mouse.recoilY, AIM_WEAPON_OFFSET.z + mouse.recoilZ)
        _aimWeaponTarget.applyQuaternion(camera.quaternion).add(camera.position)
        _recoilEuler.set(AIM_WEAPON_ROT.x - mouse.recoilY * 2, AIM_WEAPON_ROT.y, AIM_WEAPON_ROT.z)
        _aimRotationOffset.setFromEuler(_recoilEuler)
        _aimWeaponQuat.copy(camera.quaternion).multiply(_aimRotationOffset)
        mouse.aimTransitionTimer += dt
        const td = 0.2
        if (mouse.aimTransitionTimer >= td) {
          fpsWeaponRef.current.position.copy(_aimWeaponTarget)
          fpsWeaponRef.current.quaternion.copy(_aimWeaponQuat)
        } else {
          const t = mouse.aimTransitionTimer / td
          fpsWeaponRef.current.position.lerp(_aimWeaponTarget, t * 0.3)
          fpsWeaponRef.current.quaternion.slerp(_aimWeaponQuat, t * 0.3)
        }
      } else {
        armsRightHandBone.current.getWorldPosition(fpsWeaponRef.current.position)
        armsRightHandBone.current.getWorldQuaternion(fpsWeaponRef.current.quaternion)
        _weaponOffset.set(cfg.position[0], cfg.position[1], cfg.position[2]).applyQuaternion(fpsWeaponRef.current.quaternion)
        fpsWeaponRef.current.position.add(_weaponOffset)
      }
      fpsWeaponRef.current.visible = showFpsView
    }

    // 총구 플래시
    const now = performance.now()
    const fireIntervalMs = 1000 / cfg.fireRate
    if (canFire && now - s.lastShotAnimTime >= fireIntervalMs) {
      s.lastShotAnimTime = now
      s.muzzleTimer = 0
    }
    s.muzzleTimer += dt
    const flashOn = canFire && s.muzzleTimer < cfg.flashDuration
    const flashIntensity = flashOn ? cfg.lightIntensity : 0
    const spriteScale = flashOn ? 30 + Math.random() * 10 : 0

    if (muzzleFlashRef.current) muzzleFlashRef.current.intensity = showFpsView ? flashIntensity : 0
    if (tpsMuzzleFlashRef.current) tpsMuzzleFlashRef.current.intensity = showFpsView ? 0 : flashIntensity
    if (fpsMuzzleSpriteRef.current) {
      const sc = showFpsView ? spriteScale : 0
      fpsMuzzleSpriteRef.current.scale.set(sc, sc, 1)
      if (flashOn) fpsMuzzleSpriteRef.current.material.rotation = Math.random() * Math.PI * 2
      fpsMuzzleSpriteRef.current.material.color.setHex(cfg.lightColor)
    }
    if (tpsMuzzleSpriteRef.current) {
      const sc = showFpsView ? 0 : spriteScale
      tpsMuzzleSpriteRef.current.scale.set(sc, sc, 1)
      if (flashOn) tpsMuzzleSpriteRef.current.material.rotation = Math.random() * Math.PI * 2
      tpsMuzzleSpriteRef.current.material.color.setHex(cfg.lightColor)
    }

    // 총구 월드 위치
    const muzzleSprite = showFpsView ? fpsMuzzleSpriteRef.current : tpsMuzzleSpriteRef.current
    if (muzzleSprite) {
      muzzleSprite.getWorldPosition(_muzzleWorldPos)
      store.setMuzzleWorldPos([_muzzleWorldPos.x, _muzzleWorldPos.y, _muzzleWorldPos.z])
    }
  })

  const weaponCfg = WEAPON_FIRE_CONFIG[weaponType]
  const flashPos = weaponCfg.flashPosition

  return (
    <>
      <group ref={group} position={startPosition}>
        <primitive object={scene} />
      </group>
      <group ref={armsGroup}>
        <primitive object={armsScene} />
      </group>
      {/* 3인칭 무기 */}
      <group ref={tpsWeaponRef} scale={0.01}>
        <primitive object={tpsWeaponModel} />
        <pointLight ref={tpsMuzzleFlashRef} position={flashPos} color={weaponCfg.lightColor} intensity={0} distance={weaponCfg.lightDistance} />
        <sprite ref={tpsMuzzleSpriteRef} position={flashPos} scale={[0, 0, 1]}>
          <primitive object={MUZZLE_FLASH_MATERIAL.clone()} attach="material" />
        </sprite>
      </group>
      {/* 1인칭 무기 */}
      <group ref={fpsWeaponRef} scale={0.01}>
        <primitive object={fpsWeaponModel} />
        <pointLight ref={muzzleFlashRef} position={flashPos} color={weaponCfg.lightColor} intensity={0} distance={weaponCfg.lightDistance} />
        <sprite ref={fpsMuzzleSpriteRef} position={flashPos} scale={[0, 0, 1]}>
          <primitive object={MUZZLE_FLASH_MATERIAL.clone()} attach="material" />
        </sprite>
      </group>
    </>
  )
})

export default GunPlayer

useGLTF.preload('/Guntest.glb')
useGLTF.preload('/Onlyarms.glb')
useFBX.preload('/Rifle.fbx')
useFBX.preload('/Shotgun.fbx')
useFBX.preload('/Sniper.fbx')
