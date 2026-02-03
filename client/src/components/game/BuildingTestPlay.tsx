import { useRef, useEffect, useState, useMemo, useCallback, memo } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useGLTF, useAnimations, Grid } from '@react-three/drei'
import * as THREE from 'three'
import { useInput } from '../../hooks/useInput'
import { useGameStore } from '../../stores/gameStore'
import type { BuildingRegion } from '../../stores/multiplayerGameStore'
import type { MapObject, MapMarker } from '../../stores/editorStore'
import {
  initRapier,
  createWorld,
  createGround,
  createPlayer,
  loadMapObjects,
  createBoundaryColliders,
  checkGrounded,
  updatePlayerCollider,
  COLLIDER_CONFIG,
  RAPIER,
} from '../../lib/physics'
import type { Posture } from '../../stores/gameStore'

// ============ 상수 ============
const WALK_SPEED = 4
const RUN_SPEED = 8
const SIT_SPEED = 2
const CRAWL_SPEED = 1
const JUMP_POWER = 8
const DASH_SPEED = 12
const DASH_DURATION = 0.5
const DASH_COOLDOWN = 1.0
const FINISH_RADIUS = 1.5
const CHECKPOINT_RADIUS = 2.0  // 체크포인트 통과 판정 반경
const KILLZONE_RADIUS = 2.0   // 킬존 마커 XZ 판정 반경
const KILLZONE_HEIGHT = 0.5   // 킬존 마커 Y 판정 높이 (위아래 각각)
const FALL_THRESHOLD = -10
const DEAD_DURATION = 2.5

// 색상 ID → hex 매핑
const COLOR_MAP: Record<string, string> = {
  red: '#FF4444',
  blue: '#4444FF',
  yellow: '#FFFF00',
  green: '#44FF44',
  white: '#FFFFFF',
  black: '#333333',
  orange: '#FF8800',
  purple: '#AA44FF',
}

// 색상을 적용할 material 이름들
const COLOR_MATERIALS = ['Main.002', 'Grey.002', 'Helmet.002']

const GROUND_ROTATION: [number, number, number] = [-Math.PI / 2, 0, 0]
const GROUND_POSITION: [number, number, number] = [0, 0, 0]
const GRID_POSITION: [number, number, number] = [0, 0.01, 0]
const HEAD_OFFSET = new THREE.Vector3(0, 1.5, 0)

// ============ 재사용 객체 ============
const _move = new THREE.Vector3()
const _yAxis = new THREE.Vector3(0, 1, 0)
const _targetQuat = new THREE.Quaternion()
const _dashDir = new THREE.Vector3()

// ============ 캐시된 지오메트리 ============
let cachedWedgeGeometry: THREE.BufferGeometry | null = null
let cachedBoxGeometry: THREE.BoxGeometry | null = null
let cachedPlaneGeometry: THREE.BoxGeometry | null = null
let cachedCylinderGeometry: THREE.CylinderGeometry | null = null
let cachedSphereGeometry: THREE.SphereGeometry | null = null
let cachedGroundGeometry: THREE.PlaneGeometry | null = null
let cachedRingGeometry: THREE.RingGeometry | null = null
let cachedMarkerCylinderGeometry: THREE.CylinderGeometry | null = null
let cachedMarkerConeGeometry: THREE.ConeGeometry | null = null

const cachedMaterials: Map<string, THREE.MeshStandardMaterial> = new Map()
let cachedGroundMaterial: THREE.MeshStandardMaterial | null = null

function getWedgeGeometry(): THREE.BufferGeometry {
  if (cachedWedgeGeometry) return cachedWedgeGeometry
  const geometry = new THREE.BufferGeometry()
  const posArray = new Float32Array([
    -0.5, 0, -0.5, 0.5, 0, -0.5, 0.5, 0, 0.5,
    -0.5, 0, -0.5, 0.5, 0, 0.5, -0.5, 0, 0.5,
    -0.5, 0, 0.5, 0.5, 0, 0.5, 0.5, 1, 0.5,
    -0.5, 0, 0.5, 0.5, 1, 0.5, -0.5, 1, 0.5,
    -0.5, 1, 0.5, 0.5, 1, 0.5, 0.5, 0, -0.5,
    -0.5, 1, 0.5, 0.5, 0, -0.5, -0.5, 0, -0.5,
    -0.5, 0, -0.5, -0.5, 0, 0.5, -0.5, 1, 0.5,
    0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 1, 0.5,
  ])
  const normArray = new Float32Array([
    0, -1, 0, 0, -1, 0, 0, -1, 0,
    0, -1, 0, 0, -1, 0, 0, -1, 0,
    0, 0, 1, 0, 0, 1, 0, 0, 1,
    0, 0, 1, 0, 0, 1, 0, 0, 1,
    0, 0.707, -0.707, 0, 0.707, -0.707, 0, 0.707, -0.707,
    0, 0.707, -0.707, 0, 0.707, -0.707, 0, 0.707, -0.707,
    -1, 0, 0, -1, 0, 0, -1, 0, 0,
    1, 0, 0, 1, 0, 0, 1, 0, 0,
  ])
  geometry.setAttribute('position', new THREE.BufferAttribute(posArray, 3))
  geometry.setAttribute('normal', new THREE.BufferAttribute(normArray, 3))
  cachedWedgeGeometry = geometry
  return geometry
}

function getBoxGeometry() {
  if (!cachedBoxGeometry) cachedBoxGeometry = new THREE.BoxGeometry(1, 1, 1)
  return cachedBoxGeometry
}

function getPlaneGeometry() {
  if (!cachedPlaneGeometry) cachedPlaneGeometry = new THREE.BoxGeometry(1, 0.1, 1)
  return cachedPlaneGeometry
}

function getCylinderGeometry() {
  if (!cachedCylinderGeometry) cachedCylinderGeometry = new THREE.CylinderGeometry(0.5, 0.5, 1, 16)
  return cachedCylinderGeometry
}

function getSphereGeometry() {
  if (!cachedSphereGeometry) cachedSphereGeometry = new THREE.SphereGeometry(0.5, 16, 16)
  return cachedSphereGeometry
}

function getGroundGeometry() {
  if (!cachedGroundGeometry) cachedGroundGeometry = new THREE.PlaneGeometry(200, 200)
  return cachedGroundGeometry
}

function getMarkerRingGeometry() {
  if (!cachedRingGeometry) cachedRingGeometry = new THREE.RingGeometry(1.2, 1.5, 32)
  return cachedRingGeometry
}

// 킬존용 큰 링 지오메트리 (반경 2.0)
let cachedKillzoneRingGeometry: THREE.RingGeometry | null = null
function getKillzoneRingGeometry() {
  if (!cachedKillzoneRingGeometry) cachedKillzoneRingGeometry = new THREE.RingGeometry(1.8, 2.0, 32)
  return cachedKillzoneRingGeometry
}

function getMarkerCylinderGeometry() {
  if (!cachedMarkerCylinderGeometry) cachedMarkerCylinderGeometry = new THREE.CylinderGeometry(0.1, 0.1, 3, 8)
  return cachedMarkerCylinderGeometry
}

function getMarkerConeGeometry() {
  if (!cachedMarkerConeGeometry) cachedMarkerConeGeometry = new THREE.ConeGeometry(0.3, 0.5, 4)
  return cachedMarkerConeGeometry
}

function getMaterial(color: string): THREE.MeshStandardMaterial {
  let mat = cachedMaterials.get(color)
  if (!mat) {
    mat = new THREE.MeshStandardMaterial({ color })
    cachedMaterials.set(color, mat)
  }
  return mat
}

function getGroundMaterial() {
  if (!cachedGroundMaterial) {
    cachedGroundMaterial = new THREE.MeshStandardMaterial({ color: '#3a5a40', side: THREE.DoubleSide })
  }
  return cachedGroundMaterial
}

// 경계 벽 재질
let cachedBoundaryMaterial: THREE.MeshStandardMaterial | null = null
function getBoundaryMaterial() {
  if (!cachedBoundaryMaterial) {
    cachedBoundaryMaterial = new THREE.MeshStandardMaterial({
      color: '#ff4444',
      transparent: true,
      opacity: 0.3,
      side: THREE.DoubleSide,
    })
  }
  return cachedBoundaryMaterial
}

// 마커 색상
const MARKER_COLORS: Record<string, string> = {
  spawn: '#00ff00',
  finish: '#ff0000',
  checkpoint: '#ffff00',
  killzone: '#ff00ff',
}

// ============ 타입 ============
interface PhysicsContext {
  world: RAPIER.World
  playerBody: RAPIER.RigidBody
  playerColliderRef: React.MutableRefObject<RAPIER.Collider>
  cleaningUpRef: React.MutableRefObject<boolean>
}

// ============ 플레이어 ============
const Player = memo(function Player({
  startPosition,
  physics,
  finishPosition,
  checkpoints,
  killzones,
  onFinish,
  color,
}: {
  startPosition: [number, number, number]
  physics: PhysicsContext
  finishPosition: [number, number, number] | null
  checkpoints: MapMarker[]
  killzones: MapMarker[]
  onFinish: () => void
  color?: string
}) {
  const group = useRef<THREE.Group>(null!)
  const { scene, animations } = useGLTF('/Runtest.glb')
  const { actions, names } = useAnimations(animations, scene)

  const animMapRef = useRef<Record<string, string>>({})
  const grounded = useRef(true)
  const jumping = useRef(false)
  const dashing = useRef(false)
  const dashTimer = useRef(0)
  const dashCooldown = useRef(0)
  const currentAnim = useRef('')
  const currentPosture = useRef<Posture>('standing')
  const prev = useRef({ space: false, c: false, z: false, v: false })
  const initialized = useRef(false)
  const dying = useRef(false)
  const dyingTimer = useRef(0)
  const hasFinishedRef = useRef(false)
  const passedCheckpoints = useRef<Set<string>>(new Set())
  const lastCheckpointPos = useRef<[number, number, number] | null>(null)

  const input = useInput()

  // 색상 적용
  useEffect(() => {
    if (!color || !scene) return

    const hexColor = COLOR_MAP[color] || '#FFFFFF'
    const threeColor = new THREE.Color(hexColor)

    scene.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material) {
        const mat = child.material as THREE.MeshStandardMaterial
        if (COLOR_MATERIALS.includes(mat.name)) {
          mat.color = threeColor
        }
      }
    })
  }, [color, scene])

  useEffect(() => {
    const map: Record<string, string> = {}
    const targets = ['Idle', 'Walk', 'Run', 'Jump', 'SitPose', 'SitWalk', 'CrawlPose', 'Crawl', 'Roll', 'Dead']

    for (const target of targets) {
      const found = names.find(n => {
        const parts = n.split('|')
        return parts[parts.length - 1].toLowerCase() === target.toLowerCase()
      }) || names.find(n => n.toLowerCase().includes(target.toLowerCase()))

      if (found) map[target] = found
    }

    animMapRef.current = map

    if (!initialized.current && Object.keys(map).length > 0) {
      initialized.current = true
      playAnim('Idle')
    }
  }, [names])

  const playAnim = useCallback((name: string) => {
    const animMap = animMapRef.current
    if (currentAnim.current === name || !animMap[name]) return

    const clipName = animMap[name]
    const action = actions[clipName]
    if (!action) return

    const prevClip = animMap[currentAnim.current]
    if (prevClip) actions[prevClip]?.fadeOut(0.2)

    action.reset().fadeIn(0.2).play()

    if (name === 'Jump' || name === 'Roll' || name === 'Dead') {
      action.setLoop(THREE.LoopOnce, 1)
      action.clampWhenFinished = true
      if (name === 'Roll') action.timeScale = 2.3
    } else {
      action.setLoop(THREE.LoopRepeat, Infinity)
    }

    currentAnim.current = name
  }, [actions])

  const getAnim = useCallback((moving: boolean, running: boolean, posture: string): string => {
    if (posture === 'sitting') return moving ? 'SitWalk' : 'SitPose'
    if (posture === 'crawling') return moving ? 'Crawl' : 'CrawlPose'
    if (moving) return running ? 'Run' : 'Walk'
    return 'Idle'
  }, [])

  useFrame((_, dt) => {
    if (!group.current) return

    const keys = input.current
    const store = useGameStore.getState()
    const { posture, cameraAngle } = store
    const { world, playerBody, playerColliderRef, cleaningUpRef } = physics

    // 물리 엔진 cleanup 중이면 아무 작업도 하지 않음
    if (cleaningUpRef.current) return
    if (!playerColliderRef.current) return

    // 물리 객체 유효성 검사
    let vel: { x: number; y: number; z: number }
    try {
      if (!playerBody.isValid()) return
      vel = playerBody.linvel()
    } catch {
      return
    }

    // 모든 물리 연산을 try-catch로 보호 (cleanup 중 메모리 접근 오류 방지)
    try {
      const centerY = COLLIDER_CONFIG[posture].centerY

      // 사망 애니메이션 처리
      if (dying.current) {
        dyingTimer.current -= dt
        playerBody.setLinvel({ x: 0, y: vel.y, z: 0 }, true)
        world.step()

        const pos = playerBody.translation()
        const footY = pos.y - centerY
        group.current.position.set(pos.x, footY, pos.z)
        store.setPlayerPos([pos.x, footY, pos.z])

        if (dyingTimer.current <= 0) {
          dying.current = false
          // 마지막 체크포인트가 있으면 그곳으로, 없으면 시작 위치로 리스폰
          const respawnPos = lastCheckpointPos.current || startPosition
          playerBody.setTranslation(
            { x: respawnPos[0], y: respawnPos[1] + centerY + 1, z: respawnPos[2] },
            true
          )
          playerBody.setLinvel({ x: 0, y: 0, z: 0 }, true)
          group.current.position.set(respawnPos[0], respawnPos[1], respawnPos[2])
          store.setPlayerPos([respawnPos[0], respawnPos[1], respawnPos[2]])
          playAnim('Idle')
        }
        return
      }

      // 자세 변경 시 콜라이더 업데이트
      if (posture !== currentPosture.current) {
        const newCollider = updatePlayerCollider(world, playerBody, playerColliderRef.current, currentPosture.current, posture)
        playerColliderRef.current = newCollider
        currentPosture.current = posture
      }

      const isGrounded = checkGrounded(world, playerBody, playerColliderRef.current, posture)
      grounded.current = isGrounded

      if (dashCooldown.current > 0) dashCooldown.current -= dt

      if (keys.c && !prev.current.c && isGrounded && !dashing.current) {
        store.setPosture(posture === 'sitting' ? 'standing' : 'sitting')
      }
      if (keys.z && !prev.current.z && isGrounded && !dashing.current) {
        store.setPosture(posture === 'crawling' ? 'standing' : 'crawling')
      }

      let shouldJump = false
      if (keys.space && !prev.current.space && isGrounded && !jumping.current && vel.y < 1 && posture === 'standing' && !dashing.current) {
        shouldJump = true
        jumping.current = true
        playAnim('Jump')
      }

      if (jumping.current && isGrounded && vel.y <= 0 && !shouldJump) {
        jumping.current = false
        if (!dashing.current) {
          const moving = keys.forward || keys.backward || keys.left || keys.right
          playAnim(getAnim(moving, keys.shift && posture === 'standing', posture))
        }
      }

      if (keys.v && !prev.current.v && isGrounded && posture === 'standing' && !dashing.current && dashCooldown.current <= 0) {
        dashing.current = true
        dashTimer.current = DASH_DURATION
        dashCooldown.current = DASH_COOLDOWN

        _dashDir.set(0, 0, 0)
        if (keys.forward) _dashDir.z -= 1
        if (keys.backward) _dashDir.z += 1
        if (keys.left) _dashDir.x -= 1
        if (keys.right) _dashDir.x += 1

        if (_dashDir.lengthSq() === 0) {
          scene.getWorldDirection(_dashDir)
          _dashDir.y = 0
        }
        _dashDir.normalize().applyAxisAngle(_yAxis, cameraAngle)
        playAnim('Roll')
      }

      prev.current = { space: keys.space, c: keys.c, z: keys.z, v: keys.v }

      _move.set(0, 0, 0)

      if (dashing.current) {
        dashTimer.current -= dt
        _move.copy(_dashDir)
        if (dashTimer.current <= 0) dashing.current = false
      } else {
        if (keys.forward) _move.z -= 1
        if (keys.backward) _move.z += 1
        if (keys.left) _move.x -= 1
        if (keys.right) _move.x += 1

        if (_move.lengthSq() > 0) {
          _move.normalize().applyAxisAngle(_yAxis, cameraAngle)
          const angle = Math.atan2(_move.x, _move.z)
          _targetQuat.setFromAxisAngle(_yAxis, angle)
          scene.quaternion.slerp(_targetQuat, 0.15)
        }
      }

      let speed = WALK_SPEED
      if (dashing.current) speed = DASH_SPEED
      else if (posture === 'sitting') speed = SIT_SPEED
      else if (posture === 'crawling') speed = CRAWL_SPEED
      else if (keys.shift && posture === 'standing') speed = RUN_SPEED

      playerBody.setLinvel({ x: _move.x * speed, y: shouldJump ? JUMP_POWER : vel.y, z: _move.z * speed }, true)
      world.step()

      const pos = playerBody.translation()
      const playerFootY = pos.y - centerY
      group.current.position.set(pos.x, playerFootY, pos.z)

      // 카메라가 따라올 수 있도록 스토어에 위치 업데이트
      store.setPlayerPos([pos.x, playerFootY, pos.z])

      if (isGrounded && !dashing.current && !jumping.current) {
        playAnim(getAnim(_move.lengthSq() > 0, keys.shift && posture === 'standing', posture))
      }

      // 체크포인트 통과 체크
      for (const cp of checkpoints) {
        if (passedCheckpoints.current.has(cp.id)) continue
        const dx = pos.x - cp.position[0]
        const dy = playerFootY - cp.position[1]
        const dz = pos.z - cp.position[2]
        const distSq = dx * dx + dy * dy + dz * dz
        if (distSq < CHECKPOINT_RADIUS * CHECKPOINT_RADIUS) {
          passedCheckpoints.current.add(cp.id)
          lastCheckpointPos.current = [cp.position[0], cp.position[1], cp.position[2]]
        }
      }

      // 피니시 도달 체크
      if (finishPosition && !hasFinishedRef.current) {
        const dx = pos.x - finishPosition[0]
        const dy = playerFootY - finishPosition[1]
        const dz = pos.z - finishPosition[2]
        const distSq = dx * dx + dy * dy + dz * dz
        if (distSq < FINISH_RADIUS * FINISH_RADIUS) {
          hasFinishedRef.current = true
          onFinish()
        }
      }

      // 킬존 체크 (원판 형태: XZ 반경 + Y 높이 제한)
      let hitKillzone = false
      for (const kz of killzones) {
        const dx = pos.x - kz.position[0]
        const dy = playerFootY - kz.position[1]
        const dz = pos.z - kz.position[2]
        const distXZ = dx * dx + dz * dz
        const inRadius = distXZ < KILLZONE_RADIUS * KILLZONE_RADIUS
        const inHeight = Math.abs(dy) < KILLZONE_HEIGHT
        if (inRadius && inHeight) {
          hitKillzone = true
          break
        }
      }

      // 킬존 진입 시 사망 애니메이션 시작
      if (hitKillzone && !dying.current) {
        dying.current = true
        dyingTimer.current = DEAD_DURATION
        playAnim('Dead')
        return
      }

      // 낙사 체크
      if (playerFootY < FALL_THRESHOLD && !dying.current) {
        dying.current = true
        dyingTimer.current = DEAD_DURATION
        playAnim('Dead')
      }
    } catch {
      // 물리 엔진 cleanup 중 메모리 접근 오류 무시
    }
  })

  return (
    <group ref={group} position={startPosition}>
      <primitive object={scene} />
    </group>
  )
})

// ============ 카메라 ============
const FollowCamera = memo(function FollowCamera() {
  const { camera, gl } = useThree()

  const angleRef = useRef(0)
  const pitchRef = useRef(0.3)
  const distanceRef = useRef(8)
  const currentCamPos = useRef(new THREE.Vector3())
  const initialized = useRef(false)
  const isLocked = useRef(false)
  const skipNextMove = useRef(false)

  const _targetPos = useRef(new THREE.Vector3())
  const _offset = useRef(new THREE.Vector3())
  const _targetCamPos = useRef(new THREE.Vector3())
  const _headPos = useRef(new THREE.Vector3())

  useEffect(() => {
    const canvas = gl.domElement

    const onClick = async () => {
      try {
        if (document.contains(canvas) && document.hasFocus()) {
          await canvas.requestPointerLock()
        }
      } catch {
        // 포인터 락 실패 시 무시 (사용자가 빠르게 다른 동작을 한 경우)
      }
    }

    const onMouseMove = (e: MouseEvent) => {
      if (!isLocked.current) return
      if (skipNextMove.current) { skipNextMove.current = false; return }

      const maxMove = 50
      const moveX = Math.max(-maxMove, Math.min(maxMove, e.movementX))
      const moveY = Math.max(-maxMove, Math.min(maxMove, e.movementY))

      let angle = angleRef.current - moveX * 0.002
      angle = angle % (Math.PI * 2)
      if (angle < 0) angle += Math.PI * 2
      angleRef.current = angle

      let pitch = pitchRef.current + moveY * 0.002
      pitchRef.current = Math.max(-0.5, Math.min(1.2, pitch))

      const store = useGameStore.getState()
      store.setCameraAngle(angle)
      store.setCameraPitch(pitchRef.current)
    }

    const onWheel = (e: WheelEvent) => {
      distanceRef.current = Math.max(3, Math.min(20, distanceRef.current + e.deltaY * 0.01))
    }

    const onPointerLockChange = () => {
      const locked = document.pointerLockElement === canvas
      if (locked && !isLocked.current) skipNextMove.current = true
      isLocked.current = locked
    }

    canvas.addEventListener('click', onClick)
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('pointerlockchange', onPointerLockChange)
    document.addEventListener('wheel', onWheel)

    return () => {
      canvas.removeEventListener('click', onClick)
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('pointerlockchange', onPointerLockChange)
      document.removeEventListener('wheel', onWheel)
    }
  }, [gl])

  useFrame(() => {
    const playerPos = useGameStore.getState().playerPos
    _targetPos.current.set(playerPos[0], playerPos[1], playerPos[2])

    const { current: distance } = distanceRef
    const { current: pitch } = pitchRef
    const { current: angle } = angleRef

    _offset.current.set(
      Math.sin(angle) * Math.cos(pitch) * distance,
      Math.sin(pitch) * distance + 2,
      Math.cos(angle) * Math.cos(pitch) * distance
    )

    _targetCamPos.current.copy(_targetPos.current).add(_offset.current)

    if (!initialized.current) {
      initialized.current = true
      currentCamPos.current.copy(_targetCamPos.current)
    }

    currentCamPos.current.lerp(_targetCamPos.current, 0.1)
    camera.position.copy(currentCamPos.current)

    _headPos.current.copy(_targetPos.current).add(HEAD_OFFSET)
    camera.lookAt(_headPos.current)
  })

  return null
})

// ============ 맵 오브젝트 ============
const MapObjectMesh = memo(function MapObjectMesh({ obj }: { obj: MapObject }) {
  const geometry = useMemo(() => {
    switch (obj.type) {
      case 'box': return getBoxGeometry()
      case 'plane': return getPlaneGeometry()
      case 'cylinder': return getCylinderGeometry()
      case 'sphere': return getSphereGeometry()
      case 'ramp': return getWedgeGeometry()
      default: return undefined
    }
  }, [obj.type])

  const material = useMemo(() => getMaterial(obj.color), [obj.color])

  return (
    <mesh position={obj.position} rotation={obj.rotation} scale={obj.scale} geometry={geometry} material={material} />
  )
})

// ============ 바닥 ============
const Ground = memo(function Ground() {
  const geometry = useMemo(() => getGroundGeometry(), [])
  const material = useMemo(() => getGroundMaterial(), [])
  return <mesh rotation={GROUND_ROTATION} position={GROUND_POSITION} geometry={geometry} material={material} />
})

// ============ 마커 ============
const cachedMarkerMaterials: Map<string, THREE.MeshBasicMaterial> = new Map()
const cachedMarkerEmissiveMaterials: Map<string, THREE.MeshStandardMaterial> = new Map()

function getMarkerBasicMaterial(color: string, opacity: number): THREE.MeshBasicMaterial {
  const key = `${color}_${opacity}`
  let mat = cachedMarkerMaterials.get(key)
  if (!mat) {
    mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide })
    cachedMarkerMaterials.set(key, mat)
  }
  return mat
}

function getMarkerEmissiveMaterial(color: string): THREE.MeshStandardMaterial {
  let mat = cachedMarkerEmissiveMaterials.get(color)
  if (!mat) {
    mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.5 })
    cachedMarkerEmissiveMaterials.set(color, mat)
  }
  return mat
}

const MARKER_RING_ROTATION: [number, number, number] = [-Math.PI / 2, 0, 0]
const MARKER_RING_POSITION: [number, number, number] = [0, 0.05, 0]
const MARKER_CYLINDER_POSITION: [number, number, number] = [0, 1.5, 0]
const MARKER_CONE_POSITION: [number, number, number] = [0, 3.2, 0]

const MarkerMesh = memo(function MarkerMesh({ marker }: { marker: MapMarker }) {
  const color = MARKER_COLORS[marker.type] || '#ffffff'
  const isKillzone = marker.type === 'killzone'

  const ringMaterial = useMemo(() => getMarkerBasicMaterial(color, 0.5), [color])
  const cylinderMaterial = useMemo(() => getMarkerBasicMaterial(color, 0.3), [color])
  const coneMaterial = useMemo(() => getMarkerEmissiveMaterial(color), [color])

  return (
    <group position={marker.position} rotation={marker.rotation}>
      {isKillzone ? (
        /* 킬존: 원형 링만 표시 (반경 2.0) */
        <mesh rotation={MARKER_RING_ROTATION} position={MARKER_RING_POSITION} geometry={getKillzoneRingGeometry()} material={ringMaterial} />
      ) : (
        /* 기타 마커: 링 + 실린더 + 콘 형태 */
        <>
          <mesh rotation={MARKER_RING_ROTATION} position={MARKER_RING_POSITION} geometry={getMarkerRingGeometry()} material={ringMaterial} />
          <mesh position={MARKER_CYLINDER_POSITION} geometry={getMarkerCylinderGeometry()} material={cylinderMaterial} />
          <mesh position={MARKER_CONE_POSITION} geometry={getMarkerConeGeometry()} material={coneMaterial} />
        </>
      )}
    </group>
  )
})

// ============ 영역 경계 ============
const RegionBoundary = memo(function RegionBoundary({ region }: { region: BuildingRegion }) {
  const material = useMemo(() => getBoundaryMaterial(), [])
  const wallHeight = 20
  const depth = 100
  const regionWidth = region.endX - region.startX
  const regionCenterX = (region.startX + region.endX) / 2

  return (
    <group>
      <mesh position={[region.startX, wallHeight / 2, 0]} material={material}>
        <boxGeometry args={[0.2, wallHeight, depth]} />
      </mesh>
      <mesh position={[region.endX, wallHeight / 2, 0]} material={material}>
        <boxGeometry args={[0.2, wallHeight, depth]} />
      </mesh>
      <mesh position={[regionCenterX, wallHeight / 2, -depth / 2]} material={material}>
        <boxGeometry args={[regionWidth, wallHeight, 0.2]} />
      </mesh>
      <mesh position={[regionCenterX, wallHeight / 2, depth / 2]} material={material}>
        <boxGeometry args={[regionWidth, wallHeight, 0.2]} />
      </mesh>
    </group>
  )
})

// ============ 씬 콘텐츠 ============
const SceneContent = memo(function SceneContent({
  startPosition,
  finishPosition,
  objects,
  markers,
  physics,
  onFinish,
  region,
  color,
}: {
  startPosition: [number, number, number]
  finishPosition: [number, number, number] | null
  objects: MapObject[]
  markers: MapMarker[]
  physics: PhysicsContext | null
  onFinish: () => void
  region: BuildingRegion
  color?: string
}) {
  // 마커를 체크포인트와 킬존으로 분리
  const checkpoints = useMemo(() => markers.filter(m => m.type === 'checkpoint'), [markers])
  const killzones = useMemo(() => markers.filter(m => m.type === 'killzone'), [markers])

  if (!physics) return null

  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[20, 30, 10]} intensity={1} castShadow />
      <hemisphereLight args={['#87ceeb', '#3a5a40', 0.4]} />

      <color attach="background" args={['#87ceeb']} />
      <fog attach="fog" args={['#87ceeb', 50, 150]} />

      <Grid
        args={[200, 200]}
        cellSize={1}
        cellThickness={0.5}
        cellColor="#2d4a30"
        sectionSize={5}
        sectionThickness={1}
        sectionColor="#1a3a1d"
        position={GRID_POSITION}
        fadeDistance={80}
      />

      <Ground />

      {objects.map(obj => (
        <MapObjectMesh key={obj.id} obj={obj} />
      ))}

      {markers.map(marker => (
        <MarkerMesh key={marker.id} marker={marker} />
      ))}

      <RegionBoundary region={region} />

      <Player
        startPosition={startPosition}
        finishPosition={finishPosition}
        checkpoints={checkpoints}
        killzones={killzones}
        physics={physics}
        onFinish={onFinish}
        color={color}
      />
      <FollowCamera />
    </>
  )
})

// ============ UI ============
const TestPlayUI = memo(function TestPlayUI({
  onExit,
}: {
  onExit: () => void
}) {
  useEffect(() => {
    let mounted = true
    const canvas = document.querySelector('canvas') as HTMLCanvasElement | null
    if (canvas) {
      const timeoutId = setTimeout(async () => {
        if (!mounted) return
        try {
          // 캔버스가 여전히 DOM에 있고 문서가 포커스되어 있는지 확인
          if (document.contains(canvas) && document.hasFocus()) {
            await canvas.requestPointerLock()
          }
        } catch {
          // 사용자가 포인터 락 요청 전에 다른 동작을 한 경우 무시
        }
      }, 200)
      return () => {
        mounted = false
        clearTimeout(timeoutId)
      }
    }
  }, [])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        document.exitPointerLock()
        onExit()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onExit])

  return (
    <>
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 bg-slate-800/80 backdrop-blur-sm rounded-lg px-6 py-3 text-white">
        <div className="text-center text-yellow-400 font-medium">
          테스트 모드 - Start에서 Finish까지 완주하세요
        </div>
      </div>

      <div className="absolute top-4 right-4 z-10 bg-slate-800/80 backdrop-blur-sm rounded-lg px-4 py-2 text-white text-sm">
        ESC - 테스트 중단
      </div>

      <div className="absolute bottom-6 left-4 z-10 bg-slate-800/70 backdrop-blur-sm rounded-xl p-3 border border-white/10 text-white/60 text-xs">
        <div className="grid grid-cols-2 gap-x-4 gap-y-1">
          <span>클릭</span><span>마우스 잠금</span>
          <span>WASD</span><span>이동</span>
          <span>Shift</span><span>달리기</span>
          <span>Space</span><span>점프</span>
          <span>C</span><span>앉기</span>
          <span>Z</span><span>엎드리기</span>
          <span>V</span><span>구르기</span>
        </div>
      </div>

      <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-10">
        <div className="w-2 h-2 bg-white/50 rounded-full" />
      </div>
    </>
  )
})

// ============ 로딩 ============
const LoadingScreen = memo(function LoadingScreen() {
  return (
    <div className="w-full h-full bg-slate-900 flex items-center justify-center">
      <div className="text-white text-xl">물리 엔진 로딩 중...</div>
    </div>
  )
})

// ============ 메인 컴포넌트 ============
interface BuildingTestPlayProps {
  objects: MapObject[]
  markers: MapMarker[]
  region: BuildingRegion
  onExit: (success: boolean) => void
  color?: string
}

export function BuildingTestPlay({ objects, markers, region, onExit, color }: BuildingTestPlayProps) {
  const [loading, setLoading] = useState(true)

  const physicsRef = useRef<{
    world: RAPIER.World
    playerBody: RAPIER.RigidBody
  } | null>(null)
  const playerColliderRef = useRef<RAPIER.Collider | null>(null)
  const cleaningUpRef = useRef(false)

  const [physicsReady, setPhysicsReady] = useState(false)

  const startPosition = useMemo((): [number, number, number] => {
    const spawnMarker = markers.find(m => m.type === 'spawn')
    return spawnMarker ? [spawnMarker.position[0], spawnMarker.position[1], spawnMarker.position[2]] : [region.startX + 25, 0, 0]
  }, [markers, region])

  const finishPosition = useMemo((): [number, number, number] | null => {
    const finishMarker = markers.find(m => m.type === 'finish')
    return finishMarker ? [finishMarker.position[0], finishMarker.position[1], finishMarker.position[2]] : null
  }, [markers])

  const physics = useMemo((): PhysicsContext | null => {
    if (!physicsRef.current || !playerColliderRef.current || !physicsReady) return null
    return {
      world: physicsRef.current.world,
      playerBody: physicsRef.current.playerBody,
      playerColliderRef: playerColliderRef as React.MutableRefObject<RAPIER.Collider>,
      cleaningUpRef,
    }
  }, [physicsReady])

  useEffect(() => {
    let mounted = true
    let localWorld: RAPIER.World | null = null

    async function init() {
      try {
        cleaningUpRef.current = false  // 초기화 시작 시 cleanup 플래그 해제
        // 기존 물리 월드 정리 (try-catch로 이미 해제된 경우 무시)
        try {
          if (physicsRef.current) {
            physicsRef.current.world.free()
            physicsRef.current = null
          }
        } catch {
          physicsRef.current = null
        }
        playerColliderRef.current = null
        setPhysicsReady(false)

        await initRapier()
        if (!mounted) return

        const world = createWorld()
        localWorld = world
        createGround(world)
        loadMapObjects(world, objects)
        createBoundaryColliders(world, region)  // 영역 경계 물리 콜라이더
        const { rigidBody, collider } = createPlayer(world, startPosition)

        if (!mounted) {
          try { world.free() } catch { /* 이미 해제된 경우 무시 */ }
          return
        }

        physicsRef.current = { world, playerBody: rigidBody }
        playerColliderRef.current = collider
        setPhysicsReady(true)
        setLoading(false)
      } catch (error) {
        console.error('Failed to initialize physics:', error)
      }
    }

    init()
    return () => {
      mounted = false
      cleaningUpRef.current = true  // 물리 엔진 해제 전에 플래그 설정 (동기적)
      setPhysicsReady(false)
      playerColliderRef.current = null
      // React Strict Mode에서 double-invoke로 인한 중복 free 방지
      try {
        if (physicsRef.current) {
          physicsRef.current.world.free()
          physicsRef.current = null
        } else if (localWorld) {
          localWorld.free()
        }
      } catch {
        // 이미 해제된 월드에 대한 free 호출 무시
      }
      localWorld = null
    }
  }, [objects, startPosition, region])

  useEffect(() => { useGameStore.getState().reset() }, [])

  const handleFinish = useCallback(() => {
    // 물리 엔진 접근 중지 플래그 먼저 설정
    cleaningUpRef.current = true
    document.exitPointerLock()
    onExit(true)
  }, [onExit])

  const handleExit = useCallback(() => {
    // 물리 엔진 접근 중지 플래그 먼저 설정
    cleaningUpRef.current = true
    onExit(false)
  }, [onExit])

  if (loading) return <LoadingScreen />

  return (
    <div className="w-full h-full relative">
      <Canvas
        camera={{ fov: 60, near: 0.1, far: 1000 }}
        shadows
        gl={{ preserveDrawingBuffer: true, powerPreference: 'high-performance' }}
      >
        <SceneContent
          startPosition={startPosition}
          finishPosition={finishPosition}
          objects={objects}
          markers={markers}
          physics={physics}
          onFinish={handleFinish}
          region={region}
          color={color}
        />
      </Canvas>
      <TestPlayUI onExit={handleExit} />
    </div>
  )
}

useGLTF.preload('/Runtest.glb')
