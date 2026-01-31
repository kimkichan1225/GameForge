import { useRef, useEffect } from 'react'
import { Canvas, useThree, useFrame } from '@react-three/fiber'
import { Grid } from '@react-three/drei'
import * as THREE from 'three'
import { useEditorStore } from '../../stores/editorStore'
import type { MapObject, MapMarker, MarkerType, PlaceableType } from '../../stores/editorStore'

// FPS 스타일 카메라 (클릭으로 잠금, WASD로 이동, 마우스로 시야 회전)
function FPSCamera() {
  const { camera, gl } = useThree()
  const moveSpeed = 15
  const lookSpeed = 0.002

  const keys = useRef({ w: false, a: false, s: false, d: false, space: false, shift: false })
  const isLocked = useRef(false)
  const euler = useRef(new THREE.Euler(0, 0, 0, 'YXZ'))
  const skipNextMove = useRef(false)

  useEffect(() => {
    // 카메라 초기화
    camera.position.set(10, 8, 10)
    camera.lookAt(0, 0, 0)
    euler.current.setFromQuaternion(camera.quaternion)

    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase()
      if (key in keys.current) {
        keys.current[key as keyof typeof keys.current] = true
      }
      if (e.key === ' ') {
        e.preventDefault()
        keys.current.space = true
      }
      if (e.key === 'Shift') {
        keys.current.shift = true
      }
      // ESC로 잠금 해제
      if (e.key === 'Escape' && isLocked.current) {
        document.exitPointerLock()
      }
    }

    const handleKeyUp = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase()
      if (key in keys.current) {
        keys.current[key as keyof typeof keys.current] = false
      }
      if (e.key === ' ') {
        keys.current.space = false
      }
      if (e.key === 'Shift') {
        keys.current.shift = false
      }
    }

    const handleClick = () => {
      if (!isLocked.current) {
        gl.domElement.requestPointerLock()
      }
    }

    const handlePointerLockChange = () => {
      const wasLocked = isLocked.current
      isLocked.current = document.pointerLockElement === gl.domElement
      // 잠금 직후 첫 마우스 이동 스킵 (급격한 카메라 점프 방지)
      if (!wasLocked && isLocked.current) {
        skipNextMove.current = true
      }
    }

    const handleMouseMove = (e: MouseEvent) => {
      if (!isLocked.current) return

      // 잠금 후 첫 이동 스킵
      if (skipNextMove.current) {
        skipNextMove.current = false
        return
      }

      // 큰 점프 방지를 위해 이동량 제한
      const maxMove = 100
      const moveX = Math.max(-maxMove, Math.min(maxMove, e.movementX))
      const moveY = Math.max(-maxMove, Math.min(maxMove, e.movementY))

      euler.current.y -= moveX * lookSpeed
      euler.current.x -= moveY * lookSpeed
      euler.current.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, euler.current.x))
      camera.quaternion.setFromEuler(euler.current)
    }

    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault()
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    gl.domElement.addEventListener('click', handleClick)
    document.addEventListener('pointerlockchange', handlePointerLockChange)
    window.addEventListener('mousemove', handleMouseMove)
    gl.domElement.addEventListener('contextmenu', handleContextMenu)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
      gl.domElement.removeEventListener('click', handleClick)
      document.removeEventListener('pointerlockchange', handlePointerLockChange)
      window.removeEventListener('mousemove', handleMouseMove)
      gl.domElement.removeEventListener('contextmenu', handleContextMenu)
    }
  }, [camera, gl])

  useFrame((_, delta) => {
    if (!isLocked.current) return

    const direction = new THREE.Vector3()
    const right = new THREE.Vector3()

    camera.getWorldDirection(direction)
    right.crossVectors(direction, camera.up).normalize()

    const speed = moveSpeed * delta

    if (keys.current.w) camera.position.addScaledVector(direction, speed)
    if (keys.current.s) camera.position.addScaledVector(direction, -speed)
    if (keys.current.a) camera.position.addScaledVector(right, -speed)
    if (keys.current.d) camera.position.addScaledVector(right, speed)
    if (keys.current.space) camera.position.y += speed
    if (keys.current.shift) camera.position.y -= speed
  })

  return null
}

// 바닥 평면
function Ground() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
      <planeGeometry args={[200, 200]} />
      <meshStandardMaterial color="#3a5a40" side={THREE.DoubleSide} />
    </mesh>
  )
}

// 레이캐스트 배치 - 좌클릭으로 설치, 우클릭으로 선택
function RaycastPlacer() {
  const { camera, scene } = useThree()
  const placeObjectAt = useEditorStore(state => state.placeObjectAt)
  const placeMarkerAt = useEditorStore(state => state.placeMarkerAt)
  const currentMarker = useEditorStore(state => state.currentMarker)
  const setSelectedId = useEditorStore(state => state.setSelectedId)
  const raycaster = useRef(new THREE.Raycaster())

  // 카메라 Y 회전(yaw)을 90도 단위로 스냅
  const getCameraYaw = () => {
    const dir = new THREE.Vector3()
    camera.getWorldDirection(dir)
    const angle = Math.atan2(dir.x, dir.z)
    // 가장 가까운 90도로 스냅 (0, 90, 180, 270)
    const snapped = Math.round(angle / (Math.PI / 2)) * (Math.PI / 2)
    return snapped
  }

  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      if (document.pointerLockElement === null) return

      // 화면 중앙에서 레이캐스트
      raycaster.current.setFromCamera(new THREE.Vector2(0, 0), camera)
      const intersects = raycaster.current.intersectObjects(scene.children, true)

      // 우클릭 - 오브젝트 선택
      if (e.button === 2) {
        for (const hit of intersects) {
          if (hit.object.userData.isEditorObject) {
            const id = hit.object.userData.objectId
            if (id) {
              setSelectedId(id)
              // 속성 편집을 위해 포인터 잠금 해제
              document.exitPointerLock()
            }
            return
          }
        }
        // 빈 곳 클릭 - 선택 해제
        setSelectedId(null)
        return
      }

      // 좌클릭 - 오브젝트 또는 마커 설치
      if (e.button === 0) {
        const yaw = getCameraYaw()

        for (const hit of intersects) {
          // 마커 모드인 경우 - 바닥에만 설치
          if (currentMarker) {
            placeMarkerAt([hit.point.x, hit.point.y, hit.point.z], yaw)
            return
          }

          // 오브젝트 모드 - 에디터 오브젝트에 맞으면 면 법선을 사용해 인접 배치
          if (hit.object.userData.isEditorObject && hit.face) {
            // 월드 공간에서 면 법선 가져오기
            const normalMatrix = new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld)
            const worldNormal = hit.face.normal.clone().applyMatrix3(normalMatrix).normalize()

            // 법선을 주축에 스냅 (가장 큰 축 찾기)
            const absX = Math.abs(worldNormal.x)
            const absY = Math.abs(worldNormal.y)
            const absZ = Math.abs(worldNormal.z)

            let offsetX = 0, offsetY = 0, offsetZ = 0
            if (absX >= absY && absX >= absZ) {
              offsetX = worldNormal.x > 0 ? 1 : -1
            } else if (absY >= absX && absY >= absZ) {
              offsetY = worldNormal.y > 0 ? 1 : -1
            } else {
              offsetZ = worldNormal.z > 0 ? 1 : -1
            }

            // 맞은 오브젝트 중심 + 오프셋으로 새 위치 계산
            const objPos = hit.object.position
            const newPos: [number, number, number] = [
              objPos.x + offsetX,
              objPos.y + offsetY,
              objPos.z + offsetZ,
            ]

            placeObjectAt(newPos, true, yaw)
            return
          }

          // 바닥에 설치
          placeObjectAt([hit.point.x, hit.point.y, hit.point.z], false, yaw)
          return
        }
      }
    }

    window.addEventListener('mousedown', handleMouseDown)
    return () => window.removeEventListener('mousedown', handleMouseDown)
  }, [camera, scene, placeObjectAt, placeMarkerAt, currentMarker, setSelectedId])

  return null
}

// 설치 미리보기 (반투명 고스트)
function PlacementPreview() {
  const { camera, scene } = useThree()
  const currentPlaceable = useEditorStore(state => state.currentPlaceable)
  const currentMarker = useEditorStore(state => state.currentMarker)
  const objects = useEditorStore(state => state.objects)
  const markers = useEditorStore(state => state.markers)

  const meshRef = useRef<THREE.Mesh>(null)
  const markerRef = useRef<THREE.Group>(null)
  const raycaster = useRef(new THREE.Raycaster())

  // 1개만 설치 가능한 마커 타입
  const singletonMarkers: MarkerType[] = [
    'spawn', 'finish', 'spawn_a', 'spawn_b', 'capture_point'
  ]

  // 0.5 단위로 스냅
  const snap = (val: number) => Math.round(val * 2) / 2

  // 카메라 Y 회전(yaw)을 90도 단위로 스냅
  const getCameraYaw = () => {
    const dir = new THREE.Vector3()
    camera.getWorldDirection(dir)
    const angle = Math.atan2(dir.x, dir.z)
    return Math.round(angle / (Math.PI / 2)) * (Math.PI / 2)
  }

  // 오브젝트 높이 오프셋
  const getHeightOffset = (type: PlaceableType) => {
    switch (type) {
      case 'plane': return 0
      default: return 0.5
    }
  }

  // 겹침 체크
  const checkOverlap = (pos: [number, number, number], scale: number[]) => {
    return objects.some(obj => {
      const dx = Math.abs(pos[0] - obj.position[0])
      const dy = Math.abs(pos[1] - obj.position[1])
      const dz = Math.abs(pos[2] - obj.position[2])
      const halfSizeX = (scale[0] + obj.scale[0]) / 2 * 0.9
      const halfSizeY = (scale[1] + obj.scale[1]) / 2 * 0.9
      const halfSizeZ = (scale[2] + obj.scale[2]) / 2 * 0.9
      return dx < halfSizeX && dy < halfSizeY && dz < halfSizeZ
    })
  }

  // 마커 설치 가능 여부 체크
  const canPlaceMarker = (type: MarkerType) => {
    if (!singletonMarkers.includes(type)) return true
    return !markers.some(m => m.type === type)
  }

  // 마커 색상
  const markerColors: Record<string, string> = {
    spawn: '#00ff00',
    checkpoint: '#ffff00',
    finish: '#ff0000',
    spawn_a: '#ff4444',
    spawn_b: '#4444ff',
    capture_point: '#ffaa00',
  }

  useFrame(() => {
    if (document.pointerLockElement === null) {
      // 잠금 해제 상태면 숨기기
      if (meshRef.current) meshRef.current.visible = false
      if (markerRef.current) markerRef.current.visible = false
      return
    }

    raycaster.current.setFromCamera(new THREE.Vector2(0, 0), camera)
    const intersects = raycaster.current.intersectObjects(scene.children, true)

    const yaw = getCameraYaw()

    for (const hit of intersects) {
      // 마커 모드
      if (currentMarker) {
        if (meshRef.current) meshRef.current.visible = false
        if (markerRef.current) {
          const canPlace = canPlaceMarker(currentMarker)
          markerRef.current.visible = true
          markerRef.current.position.set(
            snap(hit.point.x),
            snap(hit.point.y),
            snap(hit.point.z)
          )
          markerRef.current.rotation.set(0, yaw, 0)

          // 설치 불가능하면 빨간색으로 표시
          markerRef.current.traverse((child) => {
            if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
              child.material.color.set(canPlace ? (markerColors[currentMarker] || '#ffffff') : '#ff4444')
            }
          })
        }
        return
      }

      // 오브젝트 모드
      if (markerRef.current) markerRef.current.visible = false
      if (!meshRef.current) return

      const type = currentPlaceable
      const newScale = type === 'plane' ? [2, 1, 2] : [1, 1, 1]

      let snappedPos: [number, number, number]

      // 에디터 오브젝트에 맞으면 인접 배치
      if (hit.object.userData.isEditorObject && hit.face) {
        const normalMatrix = new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld)
        const worldNormal = hit.face.normal.clone().applyMatrix3(normalMatrix).normalize()

        const absX = Math.abs(worldNormal.x)
        const absY = Math.abs(worldNormal.y)
        const absZ = Math.abs(worldNormal.z)

        let offsetX = 0, offsetY = 0, offsetZ = 0
        if (absX >= absY && absX >= absZ) {
          offsetX = worldNormal.x > 0 ? 1 : -1
        } else if (absY >= absX && absY >= absZ) {
          offsetY = worldNormal.y > 0 ? 1 : -1
        } else {
          offsetZ = worldNormal.z > 0 ? 1 : -1
        }

        const objPos = hit.object.position
        snappedPos = [
          snap(objPos.x + offsetX),
          snap(objPos.y + offsetY),
          snap(objPos.z + offsetZ),
        ]
      } else {
        // 바닥 배치
        const heightOffset = getHeightOffset(type)
        snappedPos = [
          snap(hit.point.x),
          snap(hit.point.y + heightOffset),
          snap(hit.point.z),
        ]
      }

      // 겹침 여부에 따라 색상 변경
      const isOverlapping = checkOverlap(snappedPos, newScale)

      meshRef.current.visible = true
      meshRef.current.position.set(snappedPos[0], snappedPos[1], snappedPos[2])
      meshRef.current.scale.set(newScale[0], newScale[1], newScale[2])

      // plane이나 ramp는 yaw 적용
      if (type === 'plane' || type === 'ramp') {
        meshRef.current.rotation.set(0, yaw, 0)
      } else {
        meshRef.current.rotation.set(0, 0, 0)
      }

      // 겹치면 빨간색, 아니면 초록색
      const mat = meshRef.current.material as THREE.MeshStandardMaterial
      mat.color.set(isOverlapping ? '#ff4444' : '#44ff44')

      return
    }

    // 아무것도 안 맞으면 숨기기
    if (meshRef.current) meshRef.current.visible = false
    if (markerRef.current) markerRef.current.visible = false
  })

  // 레이캐스트 무시 함수
  const noRaycast = () => null

  return (
    <>
      {/* 오브젝트 미리보기 - 레이캐스트 제외 */}
      <mesh ref={meshRef} visible={false} raycast={noRaycast}>
        {currentPlaceable === 'box' && <boxGeometry args={[1, 1, 1]} />}
        {currentPlaceable === 'cylinder' && <cylinderGeometry args={[0.5, 0.5, 1, 16]} />}
        {currentPlaceable === 'sphere' && <sphereGeometry args={[0.5, 16, 16]} />}
        {currentPlaceable === 'plane' && <boxGeometry args={[1, 0.1, 1]} />}
        {currentPlaceable === 'ramp' && <primitive object={createWedgeGeometry()} attach="geometry" />}
        <meshStandardMaterial
          color="#44ff44"
          transparent
          opacity={0.5}
          depthWrite={false}
        />
      </mesh>

      {/* 마커 미리보기 - 레이캐스트 제외 */}
      <group ref={markerRef} visible={false} raycast={noRaycast}>
        <mesh raycast={noRaycast}>
          <coneGeometry args={[0.3, 0.8, 4]} />
          <meshStandardMaterial
            color={currentMarker ? markerColors[currentMarker] || '#ffffff' : '#ffffff'}
            transparent
            opacity={0.5}
            depthWrite={false}
          />
        </mesh>
        <mesh position={[0, 0, 0.5]} raycast={noRaycast}>
          <coneGeometry args={[0.15, 0.3, 8]} />
          <meshStandardMaterial
            color={currentMarker ? markerColors[currentMarker] || '#ffffff' : '#ffffff'}
            transparent
            opacity={0.5}
            depthWrite={false}
          />
        </mesh>
      </group>
    </>
  )
}

// 커스텀 쐐기/경사로 지오메트리
function createWedgeGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry()

  const posArray = new Float32Array([
    // 바닥 면
    -0.5, 0, -0.5,  0.5, 0, -0.5,  0.5, 0, 0.5,
    -0.5, 0, -0.5,  0.5, 0, 0.5,  -0.5, 0, 0.5,

    // 앞 면 (직사각형)
    -0.5, 0, 0.5,  0.5, 0, 0.5,  0.5, 1, 0.5,
    -0.5, 0, 0.5,  0.5, 1, 0.5,  -0.5, 1, 0.5,

    // 경사 면 (위)
    -0.5, 1, 0.5,  0.5, 1, 0.5,  0.5, 0, -0.5,
    -0.5, 1, 0.5,  0.5, 0, -0.5,  -0.5, 0, -0.5,

    // 왼쪽 면 (삼각형)
    -0.5, 0, -0.5,  -0.5, 0, 0.5,  -0.5, 1, 0.5,

    // 오른쪽 면 (삼각형)
    0.5, 0, 0.5,  0.5, 0, -0.5,  0.5, 1, 0.5,
  ])

  const normArray = new Float32Array([
    // 바닥 면
    0, -1, 0,  0, -1, 0,  0, -1, 0,
    0, -1, 0,  0, -1, 0,  0, -1, 0,

    // 앞 면
    0, 0, 1,  0, 0, 1,  0, 0, 1,
    0, 0, 1,  0, 0, 1,  0, 0, 1,

    // 경사 면 (위-뒤 방향 법선)
    0, 0.707, -0.707,  0, 0.707, -0.707,  0, 0.707, -0.707,
    0, 0.707, -0.707,  0, 0.707, -0.707,  0, 0.707, -0.707,

    // 왼쪽 면
    -1, 0, 0,  -1, 0, 0,  -1, 0, 0,

    // 오른쪽 면
    1, 0, 0,  1, 0, 0,  1, 0, 0,
  ])

  geometry.setAttribute('position', new THREE.BufferAttribute(posArray, 3))
  geometry.setAttribute('normal', new THREE.BufferAttribute(normArray, 3))

  return geometry
}

// 오브젝트 메쉬 컴포넌트
function EditorObject({ obj, selected, onSelect }: { obj: MapObject; selected: boolean; onSelect: () => void }) {
  const meshRef = useRef<THREE.Mesh>(null!)
  const wedgeGeometry = useRef<THREE.BufferGeometry | null>(null)

  // 쐐기 지오메트리 한 번만 생성
  if (!wedgeGeometry.current) {
    wedgeGeometry.current = createWedgeGeometry()
  }

  return (
    <mesh
      ref={meshRef}
      position={obj.position}
      rotation={obj.rotation}
      scale={obj.scale}
      userData={{ isEditorObject: true, objectId: obj.id }}
      geometry={obj.type === 'ramp' ? wedgeGeometry.current : undefined}
    >
      {obj.type === 'box' && <boxGeometry args={[1, 1, 1]} />}
      {obj.type === 'cylinder' && <cylinderGeometry args={[0.5, 0.5, 1, 32]} />}
      {obj.type === 'sphere' && <sphereGeometry args={[0.5, 32, 32]} />}
      {obj.type === 'plane' && <planeGeometry args={[1, 1]} />}
      <meshStandardMaterial
        color={selected ? '#ffffff' : obj.color}
        emissive={selected ? obj.color : '#000000'}
        emissiveIntensity={selected ? 0.3 : 0}
        side={obj.type === 'plane' ? THREE.DoubleSide : THREE.FrontSide}
      />
    </mesh>
  )
}

// 마커 컴포넌트
function EditorMarker({ marker, selected, onSelect }: { marker: MapMarker; selected: boolean; onSelect: () => void }) {
  // 마커 타입별 색상
  const colors: Record<MarkerType, string> = {
    // 레이스 마커
    spawn: '#00ff00',
    checkpoint: '#ffff00',
    finish: '#ff0000',
    // 슈터 팀/점령전 마커
    spawn_a: '#ff4444',
    spawn_b: '#4444ff',
    capture_point: '#ffaa00',
  }

  return (
    <group position={marker.position} rotation={marker.rotation}>
      <mesh userData={{ isEditorObject: true, objectId: `marker_${marker.id}` }}>
        <coneGeometry args={[0.3, 0.8, 4]} />
        <meshStandardMaterial
          color={colors[marker.type]}
          emissive={selected ? colors[marker.type] : '#000000'}
          emissiveIntensity={selected ? 0.5 : 0}
        />
      </mesh>
      {/* 방향 표시 */}
      <mesh position={[0, 0, 0.5]}>
        <coneGeometry args={[0.15, 0.3, 8]} rotation={[Math.PI / 2, 0, 0]} />
        <meshStandardMaterial color={colors[marker.type]} />
      </mesh>
    </group>
  )
}

// 씬 콘텐츠
function SceneContent() {
  const { objects, markers, selectedId, setSelectedId } = useEditorStore()

  return (
    <>
      {/* 조명 */}
      <ambientLight intensity={0.6} />
      <directionalLight position={[20, 30, 10]} intensity={1} castShadow />
      <hemisphereLight args={['#87ceeb', '#3a5a40', 0.4]} />

      {/* 하늘 색상 */}
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

      {/* 오브젝트 */}
      {objects.map(obj => (
        <EditorObject
          key={obj.id}
          obj={obj}
          selected={selectedId === obj.id}
          onSelect={() => setSelectedId(obj.id)}
        />
      ))}

      {/* 마커 */}
      {markers.map(marker => (
        <EditorMarker
          key={marker.id}
          marker={marker}
          selected={selectedId === `marker_${marker.id}`}
          onSelect={() => setSelectedId(`marker_${marker.id}`)}
        />
      ))}

      {/* FPS 카메라 */}
      <FPSCamera />

      {/* 레이캐스트 배치 */}
      <RaycastPlacer />

      {/* 설치 미리보기 */}
      <PlacementPreview />
    </>
  )
}

// 키보드 단축키
function KeyboardShortcuts() {
  const {
    removeObject,
    removeMarker,
    selectedId,
    duplicateSelected,
    setCurrentPlaceable,
    setCurrentMarker,
    mapMode,
    shooterSubMode,
  } = useEditorStore()

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 입력 필드에서는 단축키 무시
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return

      // 숫자 키로 오브젝트 선택 (1-5)
      const placeables: PlaceableType[] = ['box', 'cylinder', 'sphere', 'plane', 'ramp']
      if (e.key >= '1' && e.key <= '5') {
        setCurrentPlaceable(placeables[parseInt(e.key) - 1])
        return
      }

      // 숫자 키로 마커 선택 (6-9)
      if (e.key >= '6' && e.key <= '9') {
        const markerIndex = parseInt(e.key) - 6

        // 현재 모드에 맞는 마커 배열
        let markers: MarkerType[] = []
        if (mapMode === 'race') {
          markers = ['spawn', 'checkpoint', 'finish']
        } else {
          switch (shooterSubMode) {
            case 'team':
              markers = ['spawn_a', 'spawn_b']
              break
            case 'domination':
              markers = ['spawn_a', 'spawn_b', 'capture_point']
              break
            case 'ffa':
              markers = ['spawn']
              break
          }
        }

        if (markerIndex < markers.length) {
          setCurrentMarker(markers[markerIndex])
        }
        return
      }

      switch (e.key.toLowerCase()) {
        case 'delete':
        case 'backspace':
          if (selectedId) {
            if (selectedId.startsWith('marker_')) {
              removeMarker(selectedId.replace('marker_', ''))
            } else {
              removeObject(selectedId)
            }
          }
          break
        case 'd':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault()
            duplicateSelected()
          }
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedId, removeObject, removeMarker, duplicateSelected, setCurrentPlaceable, setCurrentMarker, mapMode, shooterSubMode])

  return null
}

// 크로스헤어 컴포넌트
function Crosshair() {
  return (
    <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-10">
      <div className="relative w-6 h-6">
        {/* 가로선 */}
        <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-white/70 -translate-y-1/2" />
        {/* 세로선 */}
        <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-white/70 -translate-x-1/2" />
        {/* 중앙 점 */}
        <div className="absolute top-1/2 left-1/2 w-1 h-1 bg-white rounded-full -translate-x-1/2 -translate-y-1/2" />
      </div>
    </div>
  )
}

export function EditorCanvas() {
  return (
    <div className="w-full h-full relative">
      <Canvas camera={{ fov: 60, near: 0.1, far: 1000 }} shadows>
        <SceneContent />
      </Canvas>
      <Crosshair />
      <KeyboardShortcuts />
    </div>
  )
}
