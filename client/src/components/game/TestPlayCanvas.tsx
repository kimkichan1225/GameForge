import { useRef, useEffect, useState, useMemo, useCallback, memo } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useGLTF, useAnimations, Grid } from '@react-three/drei'
import * as THREE from 'three'
import { useInput } from '../../hooks/useInput'
import { useGameStore } from '../../stores/gameStore'
import { useEditorStore } from '../../stores/editorStore'
import type { MapObject } from '../../stores/editorStore'
import {
  initRapier,
  createWorld,
  createGround,
  createPlayer,
  loadMapObjects,
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

const GROUND_ROTATION: [number, number, number] = [-Math.PI / 2, 0, 0]
const GROUND_POSITION: [number, number, number] = [0, 0, 0]
const GRID_POSITION: [number, number, number] = [0, 0.01, 0]
const HEAD_OFFSET = new THREE.Vector3(0, 1.5, 0)

// ============ 재사용 객체 (전역) ============
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

// ============ 캐시된 머티리얼 ============
const cachedMaterials: Map<string, THREE.MeshStandardMaterial> = new Map()
let cachedGroundMaterial: THREE.MeshStandardMaterial | null = null
let cachedDebugGreenMaterial: THREE.MeshBasicMaterial | null = null
let cachedDebugBlueMaterial: THREE.MeshBasicMaterial | null = null
let cachedDebugRedMaterial: THREE.MeshBasicMaterial | null = null

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
  if (!cachedCylinderGeometry) cachedCylinderGeometry = new THREE.CylinderGeometry(0.5, 0.5, 1, 32)
  return cachedCylinderGeometry
}

function getSphereGeometry() {
  if (!cachedSphereGeometry) cachedSphereGeometry = new THREE.SphereGeometry(0.5, 32, 32)
  return cachedSphereGeometry
}

function getGroundGeometry() {
  if (!cachedGroundGeometry) cachedGroundGeometry = new THREE.PlaneGeometry(200, 200)
  return cachedGroundGeometry
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

function getDebugGreenMaterial() {
  if (!cachedDebugGreenMaterial) {
    cachedDebugGreenMaterial = new THREE.MeshBasicMaterial({ color: '#00ff00', wireframe: true, transparent: true, opacity: 0.5 })
  }
  return cachedDebugGreenMaterial
}

function getDebugBlueMaterial() {
  if (!cachedDebugBlueMaterial) {
    cachedDebugBlueMaterial = new THREE.MeshBasicMaterial({ color: '#0088ff', wireframe: true, transparent: true, opacity: 0.3 })
  }
  return cachedDebugBlueMaterial
}

function getDebugRedMaterial() {
  if (!cachedDebugRedMaterial) {
    cachedDebugRedMaterial = new THREE.MeshBasicMaterial({ color: '#ff0000', wireframe: true, transparent: true, opacity: 0.5 })
  }
  return cachedDebugRedMaterial
}

// ============ 타입 ============
interface PhysicsContext {
  world: RAPIER.World
  playerBody: RAPIER.RigidBody
  playerColliderRef: React.MutableRefObject<RAPIER.Collider>
}

// ============ 플레이어 컴포넌트 ============
const Player = memo(function Player({
  startPosition,
  physics,
}: {
  startPosition: [number, number, number]
  physics: PhysicsContext
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

  const input = useInput()

  // 애니메이션 맵 빌드 (한번만)
  useEffect(() => {
    const map: Record<string, string> = {}
    const targets = ['Idle', 'Walk', 'Run', 'Jump', 'SitPose', 'SitWalk', 'CrawlPose', 'Crawl', 'Roll']

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

    if (name === 'Jump' || name === 'Roll') {
      action.setLoop(THREE.LoopOnce, 1)
      action.clampWhenFinished = true
      if (name === 'Roll') action.timeScale = 2.3
    } else {
      action.setLoop(THREE.LoopRepeat, Infinity)
    }

    currentAnim.current = name
    useGameStore.getState().setAnimation(name)
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
    const { world, playerBody, playerColliderRef } = physics

    // 자세 변경 시 콜라이더 업데이트
    if (posture !== currentPosture.current) {
      const newCollider = updatePlayerCollider(world, playerBody, playerColliderRef.current, currentPosture.current, posture)
      playerColliderRef.current = newCollider
      currentPosture.current = posture
    }

    // 바닥 체크 (현재 자세에 맞게)
    const isGrounded = checkGrounded(world, playerBody, playerColliderRef.current, posture)
    grounded.current = isGrounded
    const vel = playerBody.linvel()

    // 쿨다운
    if (dashCooldown.current > 0) dashCooldown.current -= dt

    // 자세 토글
    if (keys.c && !prev.current.c && isGrounded && !dashing.current) {
      store.setPosture(posture === 'sitting' ? 'standing' : 'sitting')
    }
    if (keys.z && !prev.current.z && isGrounded && !dashing.current) {
      store.setPosture(posture === 'crawling' ? 'standing' : 'crawling')
    }

    // 점프
    let shouldJump = false
    if (keys.space && !prev.current.space && isGrounded && !jumping.current && vel.y < 1 && posture === 'standing' && !dashing.current) {
      shouldJump = true
      jumping.current = true
      playAnim('Jump')
    }

    // 착지 감지
    if (jumping.current && isGrounded && vel.y <= 0 && !shouldJump) {
      jumping.current = false
      if (!dashing.current) {
        const moving = keys.forward || keys.backward || keys.left || keys.right
        playAnim(getAnim(moving, keys.shift && posture === 'standing', posture))
      }
    }

    // 대쉬
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

    // 이동 계산
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

    // 속도 결정
    let speed = WALK_SPEED
    if (dashing.current) speed = DASH_SPEED
    else if (posture === 'sitting') speed = SIT_SPEED
    else if (posture === 'crawling') speed = CRAWL_SPEED
    else if (keys.shift && posture === 'standing') speed = RUN_SPEED

    // Rapier 물리 적용
    playerBody.setLinvel({ x: _move.x * speed, y: shouldJump ? JUMP_POWER : vel.y, z: _move.z * speed }, true)
    world.step()

    // 위치 동기화 (자세별 centerY 적용)
    const pos = playerBody.translation()
    const centerY = COLLIDER_CONFIG[posture].centerY
    group.current.position.set(pos.x, pos.y - centerY, pos.z)

    // 애니메이션
    if (isGrounded && !dashing.current && !jumping.current) {
      playAnim(getAnim(_move.lengthSq() > 0, keys.shift && posture === 'standing', posture))
    }

    // 스토어 업데이트
    store.setPlayerPos([pos.x, pos.y - centerY, pos.z])
    store.setGroundedState(isGrounded, !jumping.current)
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

    const onClick = () => canvas.requestPointerLock()

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
      useGameStore.getState().setCameraDistance(distanceRef.current)
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
const MapObjects = memo(function MapObjects() {
  const objects = useEditorStore(state => state.objects)
  return <>{objects.map(obj => <MapObjectMesh key={obj.id} obj={obj} />)}</>
})

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

// ============ 디버그 콜라이더 ============
const DebugColliders = memo(function DebugColliders({
  playerPos,
  posture
}: {
  playerPos: [number, number, number]
  posture: Posture
}) {
  const objects = useEditorStore(state => state.objects)
  const greenMat = useMemo(() => getDebugGreenMaterial(), [])
  const blueMat = useMemo(() => getDebugBlueMaterial(), [])

  const config = COLLIDER_CONFIG[posture]
  const { halfHeight, radius, centerY } = config

  return (
    <group>
      {/* 플레이어 캡슐 (자세별 크기) */}
      <group position={[playerPos[0], playerPos[1] + centerY, playerPos[2]]}>
        <mesh position={[0, halfHeight, 0]} material={greenMat}>
          <sphereGeometry args={[radius, 16, 16]} />
        </mesh>
        <mesh material={greenMat}>
          <cylinderGeometry args={[radius, radius, halfHeight * 2, 16]} />
        </mesh>
        <mesh position={[0, -halfHeight, 0]} material={greenMat}>
          <sphereGeometry args={[radius, 16, 16]} />
        </mesh>
      </group>

      {/* 바닥 */}
      <mesh position={[0, -0.1, 0]} material={blueMat}><boxGeometry args={[200, 0.2, 200]} /></mesh>

      {/* 오브젝트 */}
      {objects.map(obj => <DebugObjectCollider key={obj.id} obj={obj} />)}
    </group>
  )
})

const DebugObjectCollider = memo(function DebugObjectCollider({ obj }: { obj: MapObject }) {
  const material = useMemo(() => getDebugRedMaterial(), [])
  const { position: pos, rotation: rot, scale } = obj

  switch (obj.type) {
    case 'box':
      return <mesh position={pos} rotation={rot} material={material}><boxGeometry args={[scale[0], scale[1], scale[2]]} /></mesh>
    case 'plane':
      return <mesh position={pos} rotation={rot} material={material}><boxGeometry args={[scale[0], 0.1 * scale[1], scale[2]]} /></mesh>
    case 'cylinder':
      const cylRadius = Math.max(scale[0], scale[2]) * 0.5
      return <mesh position={pos} rotation={rot} material={material}><cylinderGeometry args={[cylRadius, cylRadius, scale[1], 16]} /></mesh>
    case 'sphere':
      return <mesh position={pos} rotation={rot} material={material}><sphereGeometry args={[Math.max(scale[0], scale[1], scale[2]) * 0.5, 16, 16]} /></mesh>
    case 'ramp':
      return <mesh position={pos} rotation={rot} scale={scale} geometry={getWedgeGeometry()} material={material} />
    default:
      return null
  }
})

// ============ 씬 콘텐츠 ============
const SceneContent = memo(function SceneContent({
  startPosition,
  physics,
  showDebug,
}: {
  startPosition: [number, number, number]
  physics: PhysicsContext | null
  showDebug: boolean
}) {
  const playerPos = useGameStore(state => state.playerPos)
  const posture = useGameStore(state => state.posture)

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
      <MapObjects />
      <Player startPosition={startPosition} physics={physics} />
      <FollowCamera />
      {showDebug && <DebugColliders playerPos={playerPos} posture={posture} />}
    </>
  )
})

// ============ UI ============
const TestPlayUI = memo(function TestPlayUI({
  onExit,
  showDebug,
  onToggleDebug,
}: {
  onExit: () => void
  showDebug: boolean
  onToggleDebug: () => void
}) {
  const animation = useGameStore(state => state.animation)
  const posture = useGameStore(state => state.posture)
  const isGrounded = useGameStore(state => state.isGrounded)
  const canJump = useGameStore(state => state.canJump)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { document.exitPointerLock(); onExit() }
      if (e.key === 'F1') { e.preventDefault(); onToggleDebug() }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onExit, onToggleDebug])

  return (
    <>
      <div className="absolute top-4 right-4 z-10 bg-slate-800/80 backdrop-blur-sm rounded-lg px-4 py-2 text-white text-sm">
        ESC - 에디터로 돌아가기
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
          <span>마우스 휠</span><span>줌</span>
          <span>F1</span><span>콜라이더 표시</span>
        </div>
      </div>

      <div className="absolute top-4 left-4 z-10 bg-slate-800/80 backdrop-blur-sm rounded-lg px-4 py-2 text-white text-sm">
        <div>자세: {posture}</div>
        <div>애니메이션: {animation}</div>
        {showDebug && (
          <>
            <div className="text-green-400 mt-1">디버그 모드</div>
            <div className={isGrounded ? 'text-green-400' : 'text-red-400'}>바닥: {isGrounded ? 'O' : 'X'}</div>
            <div className={canJump ? 'text-green-400' : 'text-red-400'}>점프가능: {canJump ? 'O' : 'X'}</div>
          </>
        )}
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
export function TestPlayCanvas({ onExit }: { onExit: () => void }) {
  const markers = useEditorStore(state => state.markers)
  const objects = useEditorStore(state => state.objects)
  const [loading, setLoading] = useState(true)
  const [showDebug, setShowDebug] = useState(false)

  // 물리 상태를 ref로 관리 (콜라이더가 변경될 수 있음)
  const physicsRef = useRef<{
    world: RAPIER.World
    playerBody: RAPIER.RigidBody
  } | null>(null)
  const playerColliderRef = useRef<RAPIER.Collider | null>(null)

  const [physicsReady, setPhysicsReady] = useState(false)

  const startPosition = useMemo((): [number, number, number] => {
    const spawnMarker = markers.find(m => m.type === 'spawn' || m.type === 'spawn_a')
    return spawnMarker ? [spawnMarker.position[0], spawnMarker.position[1], spawnMarker.position[2]] : [0, 0, 0]
  }, [markers])

  // PhysicsContext 생성
  const physics = useMemo((): PhysicsContext | null => {
    if (!physicsRef.current || !playerColliderRef.current || !physicsReady) return null
    return {
      world: physicsRef.current.world,
      playerBody: physicsRef.current.playerBody,
      playerColliderRef: playerColliderRef as React.MutableRefObject<RAPIER.Collider>,
    }
  }, [physicsReady])

  useEffect(() => {
    let mounted = true

    async function init() {
      try {
        await initRapier()
        if (!mounted) return

        const world = createWorld()
        createGround(world)
        loadMapObjects(world, objects)
        const { rigidBody, collider } = createPlayer(world, startPosition)

        physicsRef.current = { world, playerBody: rigidBody }
        playerColliderRef.current = collider
        setPhysicsReady(true)
        setLoading(false)
      } catch (error) {
        console.error('Failed to initialize physics:', error)
      }
    }

    init()
    return () => { mounted = false }
  }, [objects, startPosition])

  useEffect(() => { useGameStore.getState().reset() }, [])

  const toggleDebug = useCallback(() => setShowDebug(prev => !prev), [])

  if (loading) return <LoadingScreen />

  return (
    <div className="w-full h-full relative">
      <Canvas camera={{ fov: 60, near: 0.1, far: 1000 }} shadows>
        <SceneContent startPosition={startPosition} physics={physics} showDebug={showDebug} />
      </Canvas>
      <TestPlayUI onExit={onExit} showDebug={showDebug} onToggleDebug={toggleDebug} />
    </div>
  )
}

useGLTF.preload('/Runtest.glb')
