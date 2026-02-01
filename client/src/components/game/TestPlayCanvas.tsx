import { useRef, useEffect, useState, useMemo } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useGLTF, useAnimations, Grid } from '@react-three/drei'
import * as THREE from 'three'
import { useInput } from '../../hooks/useInput'
import { useGameStore } from '../../stores/gameStore'
import { useEditorStore } from '../../stores/editorStore'
import type { MapObject } from '../../stores/editorStore'

// 물리 상수
const WALK_SPEED = 4
const RUN_SPEED = 8
const SIT_SPEED = 2
const CRAWL_SPEED = 1
const JUMP_POWER = 8
const GRAVITY = -20
const DASH_SPEED = 12
const DASH_DURATION = 0.5
const DASH_COOLDOWN = 1.0

// 재사용 벡터
const _vel = new THREE.Vector3()
const _move = new THREE.Vector3()
const _yAxis = new THREE.Vector3(0, 1, 0)
const _targetQuat = new THREE.Quaternion()

// 전역 쐐기 지오메트리 캐시
let cachedWedgeGeometry: THREE.BufferGeometry | null = null

function getWedgeGeometry(): THREE.BufferGeometry {
  if (cachedWedgeGeometry) return cachedWedgeGeometry

  const geometry = new THREE.BufferGeometry()
  const posArray = new Float32Array([
    -0.5, 0, -0.5,  0.5, 0, -0.5,  0.5, 0, 0.5,
    -0.5, 0, -0.5,  0.5, 0, 0.5,  -0.5, 0, 0.5,
    -0.5, 0, 0.5,  0.5, 0, 0.5,  0.5, 1, 0.5,
    -0.5, 0, 0.5,  0.5, 1, 0.5,  -0.5, 1, 0.5,
    -0.5, 1, 0.5,  0.5, 1, 0.5,  0.5, 0, -0.5,
    -0.5, 1, 0.5,  0.5, 0, -0.5,  -0.5, 0, -0.5,
    -0.5, 0, -0.5,  -0.5, 0, 0.5,  -0.5, 1, 0.5,
    0.5, 0, 0.5,  0.5, 0, -0.5,  0.5, 1, 0.5,
  ])
  const normArray = new Float32Array([
    0, -1, 0,  0, -1, 0,  0, -1, 0,
    0, -1, 0,  0, -1, 0,  0, -1, 0,
    0, 0, 1,  0, 0, 1,  0, 0, 1,
    0, 0, 1,  0, 0, 1,  0, 0, 1,
    0, 0.707, -0.707,  0, 0.707, -0.707,  0, 0.707, -0.707,
    0, 0.707, -0.707,  0, 0.707, -0.707,  0, 0.707, -0.707,
    -1, 0, 0,  -1, 0, 0,  -1, 0, 0,
    1, 0, 0,  1, 0, 0,  1, 0, 0,
  ])
  geometry.setAttribute('position', new THREE.BufferAttribute(posArray, 3))
  geometry.setAttribute('normal', new THREE.BufferAttribute(normArray, 3))
  cachedWedgeGeometry = geometry
  return geometry
}

// 플레이어 컴포넌트
function Player({ startPosition }: { startPosition: [number, number, number] }) {
  const group = useRef<THREE.Group>(null!)
  const { scene, animations } = useGLTF('/Runtest.glb')
  const { actions, names } = useAnimations(animations, scene)

  const [animMap, setAnimMap] = useState<Record<string, string>>({})

  // 상태 refs
  const velocityY = useRef(0)
  const grounded = useRef(true)
  const dashing = useRef(false)
  const dashTimer = useRef(0)
  const dashCooldown = useRef(0)
  const dashDir = useRef(new THREE.Vector3())
  const currentAnim = useRef('')
  const prev = useRef({ space: false, c: false, z: false, v: false })

  const input = useInput()

  // 애니메이션 맵 빌드
  useEffect(() => {
    const map: Record<string, string> = {}
    const targets = ['Idle', 'Walk', 'Run', 'Jump', 'SitPose', 'SitWalk', 'CrawlPose', 'Crawl', 'Roll']

    targets.forEach(target => {
      let found = names.find(n => {
        const parts = n.split('|')
        const clipName = parts[parts.length - 1]
        return clipName.toLowerCase() === target.toLowerCase()
      })

      if (!found) {
        found = names.find(n => n.toLowerCase().includes(target.toLowerCase()))
      }

      if (found) {
        map[target] = found
      }
    })

    setAnimMap(map)
    console.log('Animation map:', map, 'Available animations:', names)
  }, [names])

  // 초기 위치 설정
  useEffect(() => {
    if (group.current) {
      group.current.position.set(startPosition[0], startPosition[1], startPosition[2])
    }
  }, [startPosition])

  // 초기 애니메이션
  const initialized = useRef(false)
  useEffect(() => {
    if (Object.keys(animMap).length > 0 && !initialized.current) {
      initialized.current = true
      playAnim('Idle')
    }
  }, [animMap])

  const playAnim = (name: string) => {
    if (currentAnim.current === name) return
    if (Object.keys(animMap).length === 0) return

    const clipName = animMap[name]
    if (!clipName) return

    const action = actions[clipName]
    if (!action) return

    const prevClip = animMap[currentAnim.current]
    if (prevClip && actions[prevClip]) {
      actions[prevClip]?.fadeOut(0.2)
    }

    action.reset().fadeIn(0.2).play()

    if (name === 'Jump' || name === 'Roll') {
      action.setLoop(THREE.LoopOnce, 1)
      action.clampWhenFinished = true
      if (name === 'Roll') {
        action.timeScale = 2.3
      }
    } else {
      action.setLoop(THREE.LoopRepeat, Infinity)
    }

    currentAnim.current = name
    useGameStore.getState().setAnimation(name)
  }

  const getAnim = (moving: boolean, running: boolean, posture: string): string => {
    if (posture === 'sitting') return moving ? 'SitWalk' : 'SitPose'
    if (posture === 'crawling') return moving ? 'Crawl' : 'CrawlPose'
    if (moving) return running ? 'Run' : 'Walk'
    return 'Idle'
  }

  useFrame((_, dt) => {
    if (!group.current) return

    const keys = input.current
    const store = useGameStore.getState()
    const posture = store.posture
    const cameraAngle = store.cameraAngle

    // 쿨다운
    if (dashCooldown.current > 0) dashCooldown.current -= dt

    // 자세 토글 (C: 앉기, Z: 엎드리기)
    if (keys.c && !prev.current.c && grounded.current && !dashing.current) {
      store.setPosture(posture === 'sitting' ? 'standing' : 'sitting')
    }
    if (keys.z && !prev.current.z && grounded.current && !dashing.current) {
      store.setPosture(posture === 'crawling' ? 'standing' : 'crawling')
    }

    // 점프
    if (keys.space && !prev.current.space && grounded.current && posture === 'standing' && !dashing.current) {
      velocityY.current = JUMP_POWER
      grounded.current = false
      playAnim('Jump')
    }

    // 대쉬 (Roll)
    if (keys.v && !prev.current.v && grounded.current && posture === 'standing' && !dashing.current && dashCooldown.current <= 0) {
      dashing.current = true
      dashTimer.current = DASH_DURATION
      dashCooldown.current = DASH_COOLDOWN

      const dir = new THREE.Vector3()
      if (keys.forward) dir.z -= 1
      if (keys.backward) dir.z += 1
      if (keys.left) dir.x -= 1
      if (keys.right) dir.x += 1

      if (dir.lengthSq() === 0) {
        scene.getWorldDirection(dir)
        dir.y = 0
      }
      dir.normalize().applyAxisAngle(_yAxis, cameraAngle)
      dashDir.current.copy(dir)
      playAnim('Roll')
    }

    prev.current = { space: keys.space, c: keys.c, z: keys.z, v: keys.v }

    // 이동
    _vel.set(0, 0, 0)

    if (dashing.current) {
      dashTimer.current -= dt
      _vel.copy(dashDir.current).multiplyScalar(DASH_SPEED * dt)
      if (dashTimer.current <= 0) {
        dashing.current = false
        const moving = keys.forward || keys.backward || keys.left || keys.right
        const running = keys.shift && posture === 'standing'
        playAnim(getAnim(moving, running, posture))
      }
    } else {
      _move.set(0, 0, 0)
      if (keys.forward) _move.z -= 1
      if (keys.backward) _move.z += 1
      if (keys.left) _move.x -= 1
      if (keys.right) _move.x += 1

      const moving = _move.lengthSq() > 0
      const running = keys.shift && posture === 'standing'

      if (moving) {
        _move.normalize().applyAxisAngle(_yAxis, cameraAngle)

        const angle = Math.atan2(_move.x, _move.z)
        _targetQuat.setFromAxisAngle(_yAxis, angle)
        scene.quaternion.slerp(_targetQuat, 0.15)

        let speed = WALK_SPEED
        if (posture === 'sitting') speed = SIT_SPEED
        else if (posture === 'crawling') speed = CRAWL_SPEED
        else if (running) speed = RUN_SPEED

        if (!grounded.current) speed *= 0.8

        _vel.copy(_move).multiplyScalar(speed * dt)
      }

      if (grounded.current) {
        playAnim(getAnim(moving, running, posture))
      }
    }

    // 중력
    velocityY.current += GRAVITY * dt
    group.current.position.x += _vel.x
    group.current.position.z += _vel.z
    group.current.position.y += velocityY.current * dt

    // 바닥 체크
    if (group.current.position.y <= 0) {
      group.current.position.y = 0
      velocityY.current = 0
      if (!grounded.current) {
        grounded.current = true
        if (!dashing.current) {
          const moving = keys.forward || keys.backward || keys.left || keys.right
          playAnim(getAnim(moving, keys.shift && posture === 'standing', posture))
        }
      }
    }

    // 위치 업데이트
    const pos = group.current.position
    store.setPlayerPos([pos.x, pos.y, pos.z])
  })

  return (
    <group ref={group}>
      <primitive object={scene} />
    </group>
  )
}

// 3인칭 카메라
function FollowCamera() {
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

    const onClick = () => {
      canvas.requestPointerLock()
    }

    const onMouseMove = (e: MouseEvent) => {
      if (!isLocked.current) return

      if (skipNextMove.current) {
        skipNextMove.current = false
        return
      }

      const maxMove = 50
      const moveX = Math.max(-maxMove, Math.min(maxMove, e.movementX))
      const moveY = Math.max(-maxMove, Math.min(maxMove, e.movementY))

      let angle = angleRef.current - moveX * 0.002
      angle = angle % (Math.PI * 2)
      if (angle < 0) angle += Math.PI * 2
      angleRef.current = angle

      let pitch = pitchRef.current + moveY * 0.002
      pitch = Math.max(-0.5, Math.min(1.2, pitch))
      pitchRef.current = pitch

      const store = useGameStore.getState()
      store.setCameraAngle(angle)
      store.setCameraPitch(pitch)
    }

    const onWheel = (e: WheelEvent) => {
      let distance = distanceRef.current + e.deltaY * 0.01
      distance = Math.max(3, Math.min(20, distance))
      distanceRef.current = distance
      useGameStore.getState().setCameraDistance(distance)
    }

    const onPointerLockChange = () => {
      const locked = document.pointerLockElement === canvas
      if (locked && !isLocked.current) {
        skipNextMove.current = true
      }
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
    const store = useGameStore.getState()
    const playerPos = store.playerPos
    _targetPos.current.set(playerPos[0], playerPos[1], playerPos[2])

    const distance = distanceRef.current
    const pitch = pitchRef.current
    const angle = angleRef.current

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

    _headPos.current.copy(_targetPos.current).add(new THREE.Vector3(0, 1.5, 0))
    camera.lookAt(_headPos.current)
  })

  return null
}

// 맵 오브젝트 렌더링
function MapObjects() {
  const objects = useEditorStore(state => state.objects)

  return (
    <>
      {objects.map(obj => (
        <MapObject key={obj.id} obj={obj} />
      ))}
    </>
  )
}

function MapObject({ obj }: { obj: MapObject }) {
  const geometry = useMemo(() => {
    if (obj.type === 'ramp') return getWedgeGeometry()
    return undefined
  }, [obj.type])

  return (
    <mesh
      position={obj.position}
      rotation={obj.rotation}
      scale={obj.scale}
      geometry={geometry}
    >
      {obj.type === 'box' && <boxGeometry args={[1, 1, 1]} />}
      {obj.type === 'cylinder' && <cylinderGeometry args={[0.5, 0.5, 1, 32]} />}
      {obj.type === 'sphere' && <sphereGeometry args={[0.5, 32, 32]} />}
      {obj.type === 'plane' && <planeGeometry args={[1, 1]} />}
      <meshStandardMaterial
        color={obj.color}
        side={obj.type === 'plane' ? THREE.DoubleSide : THREE.FrontSide}
      />
    </mesh>
  )
}

// 바닥
function Ground() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
      <planeGeometry args={[200, 200]} />
      <meshStandardMaterial color="#3a5a40" side={THREE.DoubleSide} />
    </mesh>
  )
}

// 씬 콘텐츠
function SceneContent({ startPosition }: { startPosition: [number, number, number] }) {
  return (
    <>
      {/* 조명 */}
      <ambientLight intensity={0.6} />
      <directionalLight position={[20, 30, 10]} intensity={1} castShadow />
      <hemisphereLight args={['#87ceeb', '#3a5a40', 0.4]} />

      {/* 하늘 */}
      <color attach="background" args={['#87ceeb']} />
      <fog attach="fog" args={['#87ceeb', 50, 150]} />

      {/* 그리드 */}
      <Grid
        args={[200, 200]}
        cellSize={1}
        cellThickness={0.5}
        cellColor="#2d4a30"
        sectionSize={5}
        sectionThickness={1}
        sectionColor="#1a3a1d"
        position={[0, 0.01, 0]}
        fadeDistance={80}
      />

      {/* 바닥 */}
      <Ground />

      {/* 맵 오브젝트 */}
      <MapObjects />

      {/* 플레이어 */}
      <Player startPosition={startPosition} />

      {/* 카메라 */}
      <FollowCamera />
    </>
  )
}

// UI 오버레이
function TestPlayUI({ onExit }: { onExit: () => void }) {
  const animation = useGameStore(state => state.animation)
  const posture = useGameStore(state => state.posture)

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
      {/* ESC 안내 */}
      <div className="absolute top-4 right-4 z-10 bg-slate-800/80 backdrop-blur-sm rounded-lg px-4 py-2 text-white text-sm">
        ESC - 에디터로 돌아가기
      </div>

      {/* 조작법 */}
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
        </div>
      </div>

      {/* 상태 표시 */}
      <div className="absolute top-4 left-4 z-10 bg-slate-800/80 backdrop-blur-sm rounded-lg px-4 py-2 text-white text-sm">
        <div>자세: {posture}</div>
        <div>애니메이션: {animation}</div>
      </div>

      {/* 크로스헤어 */}
      <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-10">
        <div className="w-2 h-2 bg-white/50 rounded-full" />
      </div>
    </>
  )
}

// 메인 컴포넌트
export function TestPlayCanvas({ onExit }: { onExit: () => void }) {
  const markers = useEditorStore(state => state.markers)

  // Spawn 마커 위치 찾기
  const startPosition = useMemo((): [number, number, number] => {
    const spawnMarker = markers.find(m => m.type === 'spawn' || m.type === 'spawn_a')
    if (spawnMarker) {
      return [spawnMarker.position[0], spawnMarker.position[1], spawnMarker.position[2]]
    }
    return [0, 0, 0]
  }, [markers])

  // 게임 스토어 리셋
  useEffect(() => {
    useGameStore.getState().reset()
  }, [])

  return (
    <div className="w-full h-full relative">
      <Canvas camera={{ fov: 60, near: 0.1, far: 1000 }} shadows>
        <SceneContent startPosition={startPosition} />
      </Canvas>
      <TestPlayUI onExit={onExit} />
    </div>
  )
}

// GLB 프리로드
useGLTF.preload('/Runtest.glb')
