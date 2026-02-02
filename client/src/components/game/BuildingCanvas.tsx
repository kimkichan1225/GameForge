import { useRef, useEffect, useMemo, useCallback, memo } from 'react'
import { Canvas, useThree, useFrame } from '@react-three/fiber'
import { Grid } from '@react-three/drei'
import * as THREE from 'three'
import { useMultiplayerGameStore, type BuildingRegion } from '../../stores/multiplayerGameStore'
import type { MapObject, MapMarker, PlaceableType } from '../../stores/editorStore'

// ============ 전역 캐시 ============
let cachedWedgeGeometry: THREE.BufferGeometry | null = null
let cachedBoxGeometry: THREE.BoxGeometry | null = null
let cachedPlaneGeometry: THREE.BoxGeometry | null = null
let cachedCylinderGeometry: THREE.CylinderGeometry | null = null
let cachedSphereGeometry: THREE.SphereGeometry | null = null
let cachedConeGeometry: THREE.ConeGeometry | null = null
let cachedSmallConeGeometry: THREE.ConeGeometry | null = null
let cachedRingGeometry: THREE.RingGeometry | null = null
let cachedGroundGeometry: THREE.PlaneGeometry | null = null
let cachedGroundMaterial: THREE.MeshStandardMaterial | null = null
let cachedBoundaryMaterial: THREE.MeshStandardMaterial | null = null
const cachedMaterials: Map<string, THREE.MeshStandardMaterial> = new Map()

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
function getConeGeometry() {
  if (!cachedConeGeometry) cachedConeGeometry = new THREE.ConeGeometry(0.3, 0.8, 4)
  return cachedConeGeometry
}
function getSmallConeGeometry() {
  if (!cachedSmallConeGeometry) cachedSmallConeGeometry = new THREE.ConeGeometry(0.15, 0.3, 8)
  return cachedSmallConeGeometry
}
function getRingGeometry() {
  if (!cachedRingGeometry) cachedRingGeometry = new THREE.RingGeometry(1.2, 1.5, 32)
  return cachedRingGeometry
}

// 킬존용 큰 링 지오메트리 (반경 2.0)
let cachedKillzoneRingGeometry: THREE.RingGeometry | null = null
function getKillzoneRingGeometry() {
  if (!cachedKillzoneRingGeometry) cachedKillzoneRingGeometry = new THREE.RingGeometry(1.8, 2.0, 32)
  return cachedKillzoneRingGeometry
}
function getGroundGeometry() {
  if (!cachedGroundGeometry) cachedGroundGeometry = new THREE.PlaneGeometry(200, 200)
  return cachedGroundGeometry
}
function getGroundMaterial() {
  if (!cachedGroundMaterial) {
    cachedGroundMaterial = new THREE.MeshStandardMaterial({ color: '#3a5a40', side: THREE.FrontSide })
  }
  return cachedGroundMaterial
}
function getBoundaryMaterial() {
  if (!cachedBoundaryMaterial) {
    cachedBoundaryMaterial = new THREE.MeshStandardMaterial({
      color: '#ff4444',
      transparent: true,
      opacity: 0.3,
      side: THREE.DoubleSide
    })
  }
  return cachedBoundaryMaterial
}
function getMaterial(color: string, emissive: string = '#000000', emissiveIntensity: number = 0): THREE.MeshStandardMaterial {
  const key = `${color}_${emissive}_${emissiveIntensity}`
  let mat = cachedMaterials.get(key)
  if (!mat) {
    mat = new THREE.MeshStandardMaterial({
      color,
      emissive,
      emissiveIntensity,
    })
    cachedMaterials.set(key, mat)
  }
  return mat
}

// 프리뷰용 반투명 재질 캐시
let cachedPreviewMaterial: THREE.MeshStandardMaterial | null = null
const cachedTransparentMaterials: Map<string, THREE.MeshStandardMaterial> = new Map()

function getPreviewMaterial(): THREE.MeshStandardMaterial {
  if (!cachedPreviewMaterial) {
    cachedPreviewMaterial = new THREE.MeshStandardMaterial({
      color: '#44ff44',
      transparent: true,
      opacity: 0.5,
      depthWrite: false
    })
  }
  return cachedPreviewMaterial
}

function getTransparentMaterial(color: string): THREE.MeshStandardMaterial {
  let mat = cachedTransparentMaterials.get(color)
  if (!mat) {
    mat = new THREE.MeshStandardMaterial({
      color,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
    })
    cachedTransparentMaterials.set(color, mat)
  }
  return mat
}

const noRaycast = () => null

// 마커 색상
const MARKER_COLORS: Record<string, string> = {
  spawn: '#00ff00',
  finish: '#ff0000',
  checkpoint: '#ffff00',
  killzone: '#ff00ff',
}

// 마커 타입 정의
type MarkerType = 'spawn' | 'finish' | 'checkpoint' | 'killzone'

// 마커 위치/회전 상수
const MARKER_RING_ROTATION: [number, number, number] = [-Math.PI / 2, 0, 0]
const MARKER_RING_POSITION: [number, number, number] = [0, 0.05, 0]
const MARKER_ARROW_POSITION: [number, number, number] = [0, 0, 0.5]
const MARKER_ARROW_ROTATION: [number, number, number] = [Math.PI / 2, 0, 0]

// 0.5 단위로 스냅
const snap = (val: number) => Math.round(val * 2) / 2

// 커스텀 쐐기/경사로 지오메트리
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

// FPS 스타일 카메라
function FPSCamera({ region }: { region: BuildingRegion | null }) {
  const { camera, gl } = useThree()
  const moveSpeed = 15
  const lookSpeed = 0.002

  const keys = useRef({ w: false, a: false, s: false, d: false, space: false, shift: false })
  const isLocked = useRef(false)
  const euler = useRef(new THREE.Euler(0, 0, 0, 'YXZ'))
  const skipNextMove = useRef(false)

  useEffect(() => {
    // 카메라 초기 위치를 영역 중앙으로
    const centerX = region ? (region.startX + region.endX) / 2 : 25
    camera.position.set(centerX, 15, 25)
    camera.lookAt(centerX, 0, 0)
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
      if (!wasLocked && isLocked.current) {
        skipNextMove.current = true
      }
    }

    const handleMouseMove = (e: MouseEvent) => {
      if (!isLocked.current) return
      if (skipNextMove.current) {
        skipNextMove.current = false
        return
      }

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
  }, [camera, gl, region])

  const direction = useRef(new THREE.Vector3())
  const right = useRef(new THREE.Vector3())

  useFrame((_, delta) => {
    if (!isLocked.current) return

    camera.getWorldDirection(direction.current)
    right.current.crossVectors(direction.current, camera.up).normalize()

    const speed = moveSpeed * delta

    if (keys.current.w) camera.position.addScaledVector(direction.current, speed)
    if (keys.current.s) camera.position.addScaledVector(direction.current, -speed)
    if (keys.current.a) camera.position.addScaledVector(right.current, -speed)
    if (keys.current.d) camera.position.addScaledVector(right.current, speed)
    if (keys.current.space) camera.position.y += speed
    if (keys.current.shift) camera.position.y -= speed
  })

  return null
}

// 바닥 평면
const Ground = memo(function Ground() {
  const geometry = useMemo(() => getGroundGeometry(), [])
  const material = useMemo(() => getGroundMaterial(), [])
  return <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} geometry={geometry} material={material} />
})

// 영역 경계 시각화
const RegionBoundary = memo(function RegionBoundary({ region }: { region: BuildingRegion }) {
  const material = useMemo(() => getBoundaryMaterial(), [])
  const wallHeight = 20
  const depth = 100  // Z축 범위: -50 ~ +50
  const regionWidth = region.endX - region.startX
  const regionCenterX = (region.startX + region.endX) / 2

  return (
    <group>
      {/* 왼쪽 벽 (X = startX) */}
      <mesh position={[region.startX, wallHeight / 2, 0]} material={material}>
        <boxGeometry args={[0.2, wallHeight, depth]} />
      </mesh>
      {/* 오른쪽 벽 (X = endX) */}
      <mesh position={[region.endX, wallHeight / 2, 0]} material={material}>
        <boxGeometry args={[0.2, wallHeight, depth]} />
      </mesh>
      {/* 앞 벽 (Z = -50) */}
      <mesh position={[regionCenterX, wallHeight / 2, -depth / 2]} material={material}>
        <boxGeometry args={[regionWidth, wallHeight, 0.2]} />
      </mesh>
      {/* 뒤 벽 (Z = +50) */}
      <mesh position={[regionCenterX, wallHeight / 2, depth / 2]} material={material}>
        <boxGeometry args={[regionWidth, wallHeight, 0.2]} />
      </mesh>
    </group>
  )
})

// 레이캐스트 배치
function RaycastPlacer({
  region,
  isVerified,
  currentPlaceable,
  currentMarker,
  onPlaceObject,
  onPlaceMarker,
  onSelect,
}: {
  region: BuildingRegion | null
  isVerified: boolean
  currentPlaceable: PlaceableType
  currentMarker: MarkerType | null
  onPlaceObject: (data: Omit<MapObject, 'id'>) => void
  onPlaceMarker: (data: { type: MarkerType; position: [number, number, number]; rotation: [number, number, number] }) => void
  onSelect: (id: string | null) => void
}) {
  const { camera, scene } = useThree()
  const raycaster = useRef(new THREE.Raycaster())
  const dirVec = useRef(new THREE.Vector3())
  const screenCenter = useRef(new THREE.Vector2(0, 0))
  const normalMatrix = useRef(new THREE.Matrix3())
  const objects = useMultiplayerGameStore(state => state.myObjects)

  const getCameraYaw = useCallback(() => {
    camera.getWorldDirection(dirVec.current)
    const angle = Math.atan2(dirVec.current.x, dirVec.current.z)
    return Math.round(angle / (Math.PI / 2)) * (Math.PI / 2)
  }, [camera])

  const getRandomColor = useCallback(() => {
    const colors = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#ffeaa7', '#dfe6e9', '#a29bfe', '#fd79a8']
    return colors[Math.floor(Math.random() * colors.length)]
  }, [])

  // 겹침 체크
  const checkOverlap = useCallback((pos: [number, number, number], scale: number[]) => {
    return objects.some(obj => {
      const dx = Math.abs(pos[0] - obj.position[0])
      const dy = Math.abs(pos[1] - obj.position[1])
      const dz = Math.abs(pos[2] - obj.position[2])
      const halfSizeX = (scale[0] + obj.scale[0]) / 2 * 0.9
      const halfSizeY = (scale[1] + obj.scale[1]) / 2 * 0.9
      const halfSizeZ = (scale[2] + obj.scale[2]) / 2 * 0.9
      return dx < halfSizeX && dy < halfSizeY && dz < halfSizeZ
    })
  }, [objects])

  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      if (document.pointerLockElement === null) return
      if (!region) return

      raycaster.current.setFromCamera(screenCenter.current, camera)
      const intersects = raycaster.current.intersectObjects(scene.children, true)

      // 우클릭 - 오브젝트/마커 선택
      if (e.button === 2) {
        for (const hit of intersects) {
          if (hit.object.userData.isEditorObject) {
            const id = hit.object.userData.objectId
            if (id) {
              // marker_로 시작하면 마커, 아니면 오브젝트
              onSelect(id)
              return
            }
          }
        }
        onSelect(null)
        return
      }

      if (isVerified) return // 검증 완료 후 배치 불가

      if (e.button === 0) {
        const yaw = getCameraYaw()

        for (const hit of intersects) {
          // 마커 모드
          if (currentMarker) {
            const pos: [number, number, number] = [snap(hit.point.x), snap(hit.point.y), snap(hit.point.z)]

            // 영역 검사 (X축, Z축)
            if (pos[0] < region.startX || pos[0] >= region.endX || pos[2] < -50 || pos[2] > 50) {
              return
            }

            onPlaceMarker({
              type: currentMarker,
              position: pos,
              rotation: [0, Math.round(yaw / (Math.PI / 2)) * (Math.PI / 2), 0],
            })
            return
          }

          // 오브젝트 모드
          const type = currentPlaceable
          const newScale: [number, number, number] = type === 'plane' ? [2, 1, 2] : [1, 1, 1]

          let snappedPos: [number, number, number]

          if (hit.object.userData.isEditorObject && hit.face) {
            normalMatrix.current.getNormalMatrix(hit.object.matrixWorld)
            const worldNormal = hit.face.normal.clone().applyMatrix3(normalMatrix.current).normalize()

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
            snappedPos = [snap(objPos.x + offsetX), snap(objPos.y + offsetY), snap(objPos.z + offsetZ)]
          } else {
            const heightOffset = type === 'plane' ? 0 : 0.5
            snappedPos = [snap(hit.point.x), snap(hit.point.y + heightOffset), snap(hit.point.z)]
          }

          // 영역 검사 (X축, Z축)
          if (snappedPos[0] < region.startX || snappedPos[0] >= region.endX || snappedPos[2] < -50 || snappedPos[2] > 50) {
            return
          }

          // 겹침 체크
          if (checkOverlap(snappedPos, newScale)) {
            return
          }

          const snappedYaw = Math.round(yaw / (Math.PI / 2)) * (Math.PI / 2)
          const rotation: [number, number, number] = (type === 'plane' || type === 'ramp')
            ? [0, snappedYaw, 0]
            : [0, 0, 0]

          onPlaceObject({
            type,
            position: snappedPos,
            rotation,
            scale: newScale,
            color: getRandomColor(),
            name: `${type}_${Math.random().toString(36).substr(2, 4)}`,
          })
          return
        }
      }
    }

    window.addEventListener('mousedown', handleMouseDown)
    return () => window.removeEventListener('mousedown', handleMouseDown)
  }, [camera, scene, region, isVerified, currentPlaceable, currentMarker, getCameraYaw, getRandomColor, checkOverlap, onPlaceObject, onPlaceMarker, onSelect])

  return null
}

// 설치 미리보기
function PlacementPreview({
  region,
  isVerified,
  currentPlaceable,
  currentMarker,
}: {
  region: BuildingRegion | null
  isVerified: boolean
  currentPlaceable: PlaceableType
  currentMarker: MarkerType | null
}) {
  const { camera, scene } = useThree()
  const objects = useMultiplayerGameStore(state => state.myObjects)
  const markers = useMultiplayerGameStore(state => state.myMarkers)

  const meshRef = useRef<THREE.Mesh>(null)
  const markerRef = useRef<THREE.Group>(null)
  const raycaster = useRef(new THREE.Raycaster())
  const screenCenter = useRef(new THREE.Vector2(0, 0))
  const dirVec = useRef(new THREE.Vector3())
  const normalMatrix = useRef(new THREE.Matrix3())

  const getCameraYaw = useCallback(() => {
    camera.getWorldDirection(dirVec.current)
    const angle = Math.atan2(dirVec.current.x, dirVec.current.z)
    return Math.round(angle / (Math.PI / 2)) * (Math.PI / 2)
  }, [camera])

  const checkOverlap = useCallback((pos: [number, number, number], scale: number[]) => {
    return objects.some(obj => {
      const dx = Math.abs(pos[0] - obj.position[0])
      const dy = Math.abs(pos[1] - obj.position[1])
      const dz = Math.abs(pos[2] - obj.position[2])
      const halfSizeX = (scale[0] + obj.scale[0]) / 2 * 0.9
      const halfSizeY = (scale[1] + obj.scale[1]) / 2 * 0.9
      const halfSizeZ = (scale[2] + obj.scale[2]) / 2 * 0.9
      return dx < halfSizeX && dy < halfSizeY && dz < halfSizeZ
    })
  }, [objects])

  const canPlaceMarker = useCallback((type: MarkerType) => {
    // spawn, finish는 1개만 허용, checkpoint와 killzone은 여러 개 허용
    if (type === 'checkpoint' || type === 'killzone') {
      return true
    }
    return !markers.some(m => m.type === type)
  }, [markers])

  const isInRegion = useCallback((x: number, z: number) => {
    if (!region) return false
    return x >= region.startX && x < region.endX && z >= -50 && z <= 50
  }, [region])

  useFrame(() => {
    if (document.pointerLockElement === null || isVerified) {
      if (meshRef.current) meshRef.current.visible = false
      if (markerRef.current) markerRef.current.visible = false
      return
    }

    raycaster.current.setFromCamera(screenCenter.current, camera)
    const intersects = raycaster.current.intersectObjects(scene.children, true)

    const yaw = getCameraYaw()

    for (const hit of intersects) {
      // 마커 모드
      if (currentMarker) {
        if (meshRef.current) meshRef.current.visible = false
        if (markerRef.current) {
          const canPlace = canPlaceMarker(currentMarker) && isInRegion(snap(hit.point.x), snap(hit.point.z))
          markerRef.current.visible = true
          markerRef.current.position.set(snap(hit.point.x), snap(hit.point.y), snap(hit.point.z))
          markerRef.current.rotation.set(0, yaw, 0)

          markerRef.current.traverse((child) => {
            if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
              child.material.color.set(canPlace ? (MARKER_COLORS[currentMarker] || '#ffffff') : '#ff4444')
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

      if (hit.object.userData.isEditorObject && hit.face) {
        normalMatrix.current.getNormalMatrix(hit.object.matrixWorld)
        const worldNormal = hit.face.normal.clone().applyMatrix3(normalMatrix.current).normalize()

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
        snappedPos = [snap(objPos.x + offsetX), snap(objPos.y + offsetY), snap(objPos.z + offsetZ)]
      } else {
        const heightOffset = type === 'plane' ? 0 : 0.5
        snappedPos = [snap(hit.point.x), snap(hit.point.y + heightOffset), snap(hit.point.z)]
      }

      const isOverlapping = checkOverlap(snappedPos, newScale)
      const isOutOfRegion = !isInRegion(snappedPos[0], snappedPos[2])

      meshRef.current.visible = true
      meshRef.current.position.set(snappedPos[0], snappedPos[1], snappedPos[2])
      meshRef.current.scale.set(newScale[0], newScale[1], newScale[2])

      if (type === 'plane' || type === 'ramp') {
        meshRef.current.rotation.set(0, yaw, 0)
      } else {
        meshRef.current.rotation.set(0, 0, 0)
      }

      const mat = meshRef.current.material as THREE.MeshStandardMaterial
      mat.color.set((isOverlapping || isOutOfRegion) ? '#ff4444' : '#44ff44')
      return
    }

    if (meshRef.current) meshRef.current.visible = false
    if (markerRef.current) markerRef.current.visible = false
  })

  const previewGeometry = useMemo(() => {
    switch (currentPlaceable) {
      case 'box': return getBoxGeometry()
      case 'plane': return getPlaneGeometry()
      case 'cylinder': return getCylinderGeometry()
      case 'sphere': return getSphereGeometry()
      case 'ramp': return getWedgeGeometry()
      default: return getBoxGeometry()
    }
  }, [currentPlaceable])

  const previewMaterial = useMemo(() => getPreviewMaterial(), [])
  const coneGeometry = useMemo(() => getConeGeometry(), [])
  const smallConeGeometry = useMemo(() => getSmallConeGeometry(), [])
  const killzoneRingGeometry = useMemo(() => getKillzoneRingGeometry(), [])

  const markerPreviewMaterial = useMemo(() =>
    getTransparentMaterial(currentMarker ? MARKER_COLORS[currentMarker] || '#ffffff' : '#ffffff'),
    [currentMarker]
  )

  const isKillzoneMarker = currentMarker === 'killzone'

  return (
    <>
      <mesh ref={meshRef} visible={false} raycast={noRaycast} geometry={previewGeometry} material={previewMaterial} />
      <group ref={markerRef} visible={false} raycast={noRaycast}>
        {isKillzoneMarker ? (
          /* 킬존: 원형 링 표시 */
          <mesh
            rotation={MARKER_RING_ROTATION}
            position={MARKER_RING_POSITION}
            raycast={noRaycast}
            geometry={killzoneRingGeometry}
            material={markerPreviewMaterial}
          />
        ) : (
          /* 기타 마커: 콘 형태 */
          <>
            <mesh raycast={noRaycast} geometry={coneGeometry} material={markerPreviewMaterial} />
            <mesh
              position={MARKER_ARROW_POSITION}
              raycast={noRaycast}
              geometry={smallConeGeometry}
              material={markerPreviewMaterial}
            />
          </>
        )}
      </group>
    </>
  )
}

// 오브젝트 렌더링
const BuildingObject = memo(function BuildingObject({ obj, selected }: { obj: MapObject; selected: boolean }) {
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

  const material = useMemo(() =>
    getMaterial(
      selected ? '#ffffff' : obj.color,
      selected ? obj.color : '#000000',
      selected ? 0.3 : 0
    ),
    [selected, obj.color]
  )

  return (
    <mesh
      position={obj.position}
      rotation={obj.rotation}
      scale={obj.scale}
      userData={{ isEditorObject: true, objectId: obj.id }}
      geometry={geometry}
      material={material}
    />
  )
})

// 마커 렌더링
const BuildingMarker = memo(function BuildingMarker({ marker, selected }: { marker: MapMarker; selected: boolean }) {
  const color = MARKER_COLORS[marker.type] || '#ffffff'
  const isKillzone = marker.type === 'killzone'

  const ringGeometry = useMemo(() => isKillzone ? getKillzoneRingGeometry() : getRingGeometry(), [isKillzone])
  const coneGeometry = useMemo(() => getConeGeometry(), [])
  const smallConeGeometry = useMemo(() => getSmallConeGeometry(), [])

  const mainMaterial = useMemo(() =>
    getMaterial(color, selected ? color : '#000000', selected ? 0.5 : 0),
    [color, selected]
  )
  const killzoneMaterial = useMemo(() => {
    const mat = new THREE.MeshStandardMaterial({
      color,
      emissive: selected ? color : '#000000',
      emissiveIntensity: selected ? 0.5 : 0,
      side: THREE.DoubleSide,
    })
    return mat
  }, [color, selected])

  return (
    <group position={marker.position} rotation={marker.rotation}>
      {isKillzone ? (
        /* 킬존: 원형 링만 표시 (반경 2.0) */
        <mesh
          rotation={MARKER_RING_ROTATION}
          position={MARKER_RING_POSITION}
          userData={{ isEditorObject: true, objectId: `marker_${marker.id}` }}
          geometry={ringGeometry}
          material={killzoneMaterial}
        />
      ) : (
        /* 기타 마커: 콘 형태 */
        <>
          <mesh
            rotation={MARKER_RING_ROTATION}
            position={MARKER_RING_POSITION}
            userData={{ isEditorObject: true, objectId: `marker_${marker.id}` }}
            geometry={ringGeometry}
            material={mainMaterial}
          />
          <mesh
            userData={{ isEditorObject: true, objectId: `marker_${marker.id}` }}
            geometry={coneGeometry}
            material={mainMaterial}
          />
          <mesh
            position={MARKER_ARROW_POSITION}
            rotation={MARKER_ARROW_ROTATION}
            userData={{ isEditorObject: true, objectId: `marker_${marker.id}` }}
            geometry={smallConeGeometry}
            material={mainMaterial}
          />
        </>
      )}
    </group>
  )
})

// 씬 콘텐츠
const SceneContent = memo(function SceneContent({
  region,
  isVerified,
  currentPlaceable,
  currentMarker,
  selectedId,
  onPlaceObject,
  onPlaceMarker,
  onSelect,
}: {
  region: BuildingRegion | null
  isVerified: boolean
  currentPlaceable: PlaceableType
  currentMarker: MarkerType | null
  selectedId: string | null
  onPlaceObject: (data: Omit<MapObject, 'id'>) => void
  onPlaceMarker: (data: { type: MarkerType; position: [number, number, number]; rotation: [number, number, number] }) => void
  onSelect: (id: string | null) => void
}) {
  const objects = useMultiplayerGameStore(state => state.myObjects)
  const markers = useMultiplayerGameStore(state => state.myMarkers)

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

      {/* 영역 경계 */}
      {region && <RegionBoundary region={region} />}

      {/* 오브젝트 */}
      {objects.map(obj => (
        <BuildingObject key={obj.id} obj={obj} selected={selectedId === obj.id} />
      ))}

      {/* 마커 */}
      {markers.map(marker => (
        <BuildingMarker key={marker.id} marker={marker} selected={selectedId === `marker_${marker.id}`} />
      ))}

      {/* FPS 카메라 */}
      <FPSCamera region={region} />

      {/* 레이캐스트 배치 및 선택 */}
      <RaycastPlacer
        region={region}
        isVerified={isVerified}
        currentPlaceable={currentPlaceable}
        currentMarker={currentMarker}
        onPlaceObject={onPlaceObject}
        onPlaceMarker={onPlaceMarker}
        onSelect={onSelect}
      />

      {/* 설치 미리보기 */}
      {!isVerified && (
        <PlacementPreview
          region={region}
          isVerified={isVerified}
          currentPlaceable={currentPlaceable}
          currentMarker={currentMarker}
        />
      )}
    </>
  )
})

// 크로스헤어
const Crosshair = memo(function Crosshair() {
  return (
    <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-10">
      <div className="relative w-6 h-6">
        <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-white/70 -translate-y-1/2" />
        <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-white/70 -translate-x-1/2" />
        <div className="absolute top-1/2 left-1/2 w-1 h-1 bg-white rounded-full -translate-x-1/2 -translate-y-1/2" />
      </div>
    </div>
  )
})

// 키보드 단축키 (삭제)
function KeyboardShortcuts({
  selectedId,
  onDelete,
  isVerified,
}: {
  selectedId: string | null
  onDelete: (id: string) => void
  isVerified: boolean
}) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 검증 완료 후 삭제 불가
      if (isVerified) return
      // 입력 필드에서는 단축키 무시
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return

      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        e.preventDefault()
        onDelete(selectedId)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedId, onDelete, isVerified])

  return null
}

// 메인 컴포넌트
interface BuildingCanvasProps {
  currentPlaceable: PlaceableType
  currentMarker: MarkerType | null
  selectedId: string | null
  onSelectId: (id: string | null) => void
}

export function BuildingCanvas({ currentPlaceable, currentMarker, selectedId, onSelectId }: BuildingCanvasProps) {
  const region = useMultiplayerGameStore(state => state.myRegion)
  const isVerified = useMultiplayerGameStore(state => state.myVerified)
  const placeObject = useMultiplayerGameStore(state => state.placeObject)
  const placeMarker = useMultiplayerGameStore(state => state.placeMarker)
  const removeObject = useMultiplayerGameStore(state => state.removeObject)
  const removeMarker = useMultiplayerGameStore(state => state.removeMarker)

  const handlePlaceObject = useCallback(async (data: Omit<MapObject, 'id'>) => {
    await placeObject(data)
  }, [placeObject])

  const handlePlaceMarker = useCallback(async (data: { type: MarkerType; position: [number, number, number]; rotation: [number, number, number] }) => {
    await placeMarker(data)
  }, [placeMarker])

  const handleSelect = useCallback((id: string | null) => {
    onSelectId(id)
  }, [onSelectId])

  const handleDelete = useCallback(async (id: string) => {
    if (id.startsWith('marker_')) {
      // 마커 삭제
      const markerId = id.replace('marker_', '')
      const success = await removeMarker(markerId)
      if (success) {
        onSelectId(null)
      }
    } else {
      // 오브젝트 삭제
      const success = await removeObject(id)
      if (success) {
        onSelectId(null)
      }
    }
  }, [removeObject, removeMarker, onSelectId])

  return (
    <div className="w-full h-full relative">
      <Canvas
        camera={{ fov: 60, near: 0.1, far: 1000 }}
        shadows
        gl={{ preserveDrawingBuffer: true }}
      >
        <SceneContent
          region={region}
          isVerified={isVerified}
          currentPlaceable={currentPlaceable}
          currentMarker={currentMarker}
          selectedId={selectedId}
          onPlaceObject={handlePlaceObject}
          onPlaceMarker={handlePlaceMarker}
          onSelect={handleSelect}
        />
      </Canvas>
      {!isVerified && <Crosshair />}
      <KeyboardShortcuts selectedId={selectedId} onDelete={handleDelete} isVerified={isVerified} />
      {/* 선택된 오브젝트 안내 */}
      {selectedId && !isVerified && (
        <div className="absolute bottom-4 right-4 z-10 bg-slate-800/80 backdrop-blur-sm rounded-lg px-4 py-2 text-white text-sm">
          <span className="text-yellow-400">선택됨</span> - Delete 또는 Backspace로 삭제
        </div>
      )}
    </div>
  )
}
