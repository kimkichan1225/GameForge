import { useRef, useEffect, useMemo, useCallback, memo } from 'react'
import { Canvas, useThree, useFrame } from '@react-three/fiber'
import { Grid } from '@react-three/drei'
import * as THREE from 'three'
import { useEditorStore } from '../../stores/editorStore'
import type { MapObject, MapMarker, MarkerType, PlaceableType } from '../../stores/editorStore'

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
  if (!cachedRingGeometry) cachedRingGeometry = new THREE.RingGeometry(1.8, 2.0, 32)
  return cachedRingGeometry
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
function getMaterial(color: string, emissive: string = '#000000', emissiveIntensity: number = 0, doubleSide: boolean = false): THREE.MeshStandardMaterial {
  const key = `${color}_${emissive}_${emissiveIntensity}_${doubleSide}`
  let mat = cachedMaterials.get(key)
  if (!mat) {
    mat = new THREE.MeshStandardMaterial({
      color,
      emissive,
      emissiveIntensity,
      side: doubleSide ? THREE.DoubleSide : THREE.FrontSide
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

function getTransparentMaterial(color: string, doubleSide: boolean = false): THREE.MeshStandardMaterial {
  const key = `${color}_${doubleSide}`
  let mat = cachedTransparentMaterials.get(key)
  if (!mat) {
    mat = new THREE.MeshStandardMaterial({
      color,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      side: doubleSide ? THREE.DoubleSide : THREE.FrontSide
    })
    cachedTransparentMaterials.set(key, mat)
  }
  return mat
}

// 레이캐스트 무시 함수 (전역으로 이동하여 재생성 방지)
const noRaycast = () => null

// 마커 색상 상수 (컴포넌트 외부로 이동)
const MARKER_COLORS: Record<string, string> = {
  spawn: '#00ff00',
  checkpoint: '#ffff00',
  finish: '#ff0000',
  killzone: '#ff00ff',
  spawn_a: '#ff4444',
  spawn_b: '#4444ff',
  capture_point: '#ffaa00',
}

// 마커 위치/회전 상수
const MARKER_RING_ROTATION: [number, number, number] = [-Math.PI / 2, 0, 0]
const MARKER_RING_POSITION: [number, number, number] = [0, 0.05, 0]
const MARKER_ARROW_POSITION: [number, number, number] = [0, 0, 0.5]
const MARKER_ARROW_ROTATION: [number, number, number] = [Math.PI / 2, 0, 0]

// 1개만 설치 가능한 마커 타입 (모드별로 다름)
const getSingletonMarkers = (mapMode: string, shooterSubMode: string): MarkerType[] => {
  if (mapMode === 'race') {
    return ['spawn', 'finish'] // checkpoint는 여러개 가능
  }
  if (shooterSubMode === 'ffa') {
    return [] // 개인전은 spawn 여러개 가능
  }
  return ['spawn_a', 'spawn_b', 'capture_point']
}

// 0.5 단위로 스냅하는 유틸 함수
const snap = (val: number) => Math.round(val * 2) / 2

// FPS 스타일 카메라 (클릭으로 잠금, WASD로 이동, 마우스로 시야 회전)
function FPSCamera() {
  const { camera, gl } = useThree()
  const moveSpeed = 15
  const lookSpeed = 0.002

  const keys = useRef({ w: false, a: false, s: false, d: false, space: false, c: false })
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

  // 캐시된 벡터 (매 프레임 생성 방지)
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
    if (keys.current.c) camera.position.y -= speed
  })

  return null
}

// 상수
const GROUND_ROTATION: [number, number, number] = [-Math.PI / 2, 0, 0]
const GROUND_POSITION: [number, number, number] = [0, 0, 0]

// 바닥 평면 (정적 - memo로 최적화)
const Ground = memo(function Ground() {
  const geometry = useMemo(() => getGroundGeometry(), [])
  const material = useMemo(() => getGroundMaterial(), [])
  return <mesh rotation={GROUND_ROTATION} position={GROUND_POSITION} geometry={geometry} material={material} />
})

// 레이캐스트 배치 - 좌클릭으로 설치 또는 선택, 우클릭으로 선택
function RaycastPlacer() {
  const { camera, scene } = useThree()
  const placeObjectAt = useEditorStore(state => state.placeObjectAt)
  const placeMarkerAt = useEditorStore(state => state.placeMarkerAt)
  const currentMarker = useEditorStore(state => state.currentMarker)
  const currentPlaceable = useEditorStore(state => state.currentPlaceable)
  const setSelectedId = useEditorStore(state => state.setSelectedId)
  const toggleSelection = useEditorStore(state => state.toggleSelection)
  const pasteAtPosition = useEditorStore(state => state.pasteAtPosition)
  const raycaster = useRef(new THREE.Raycaster())
  const dirVec = useRef(new THREE.Vector3())
  const screenCenter = useRef(new THREE.Vector2(0, 0))
  const normalMatrix = useRef(new THREE.Matrix3())
  const shiftPressed = useRef(false)

  // 카메라 Y 회전(yaw)을 90도 단위로 스냅
  const getCameraYaw = useCallback(() => {
    camera.getWorldDirection(dirVec.current)
    const angle = Math.atan2(dirVec.current.x, dirVec.current.z)
    return Math.round(angle / (Math.PI / 2)) * (Math.PI / 2)
  }, [camera])

  // 선택 모드 체크 (currentPlaceable이 null이고 currentMarker도 null이고 isPasteMode도 false)
  const isSelectMode = useCallback(() => {
    const state = useEditorStore.getState()
    return state.currentMarker === null && state.currentPlaceable === null && !state.isPasteMode
  }, [])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Shift') shiftPressed.current = true
    }
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') shiftPressed.current = false
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [])

  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      if (document.pointerLockElement === null) return
      // 캡처 모드일 때는 배치 비활성화
      if (useEditorStore.getState().isThumbnailCaptureMode) return

      // 화면 중앙에서 레이캐스트
      raycaster.current.setFromCamera(screenCenter.current, camera)
      const intersects = raycaster.current.intersectObjects(scene.children, true)

      // 우클릭 - 오브젝트 선택
      if (e.button === 2) {
        for (const hit of intersects) {
          if (hit.object.userData.isEditorObject) {
            const id = hit.object.userData.objectId
            if (id) {
              if (shiftPressed.current) {
                toggleSelection(id)
              } else {
                setSelectedId(id)
              }
              document.exitPointerLock()
            }
            return
          }
        }
        if (!shiftPressed.current) {
          setSelectedId(null)
        }
        return
      }

      // 좌클릭
      if (e.button === 0) {
        const yaw = getCameraYaw()
        const selectMode = isSelectMode()
        const state = useEditorStore.getState()

        // 붙여넣기 모드 - 좌클릭으로 붙여넣기
        if (state.isPasteMode) {
          for (const hit of intersects) {
            const heightOffset = 0.5
            const pos: [number, number, number] = [snap(hit.point.x), snap(hit.point.y + heightOffset), snap(hit.point.z)]
            pasteAtPosition(pos)
            return
          }
          return
        }

        // 선택 모드이면 좌클릭으로도 선택
        if (selectMode) {
          for (const hit of intersects) {
            if (hit.object.userData.isEditorObject) {
              const id = hit.object.userData.objectId
              if (id) {
                if (shiftPressed.current) {
                  toggleSelection(id)
                } else {
                  setSelectedId(id)
                }
              }
              return
            }
          }
          // 빈 곳 클릭시 선택 해제
          if (!shiftPressed.current) {
            setSelectedId(null)
          }
          return
        }

        for (const hit of intersects) {
          // 마커 모드인 경우
          if (currentMarker) {
            placeMarkerAt([hit.point.x, hit.point.y, hit.point.z], yaw)
            return
          }

          // 오브젝트 모드 - 에디터 오브젝트에 맞으면 인접 배치
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
            placeObjectAt([objPos.x + offsetX, objPos.y + offsetY, objPos.z + offsetZ], true, yaw)
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
  }, [camera, scene, placeObjectAt, placeMarkerAt, currentMarker, currentPlaceable, setSelectedId, toggleSelection, getCameraYaw, isSelectMode, pasteAtPosition])

  return null
}

// 설치 미리보기 (반투명 고스트)
function PlacementPreview() {
  const { camera, scene } = useThree()
  const currentPlaceable = useEditorStore(state => state.currentPlaceable)
  const currentMarker = useEditorStore(state => state.currentMarker)
  const objects = useEditorStore(state => state.objects)
  const markers = useEditorStore(state => state.markers)
  const mapMode = useEditorStore(state => state.mapMode)
  const shooterSubMode = useEditorStore(state => state.shooterSubMode)

  const meshRef = useRef<THREE.Mesh>(null)
  const markerRef = useRef<THREE.Group>(null)
  const raycaster = useRef(new THREE.Raycaster())
  const screenCenter = useRef(new THREE.Vector2(0, 0))
  const dirVec = useRef(new THREE.Vector3())
  const normalMatrix = useRef(new THREE.Matrix3())

  // 카메라 Y 회전(yaw)을 90도 단위로 스냅
  const getCameraYaw = useCallback(() => {
    camera.getWorldDirection(dirVec.current)
    const angle = Math.atan2(dirVec.current.x, dirVec.current.z)
    return Math.round(angle / (Math.PI / 2)) * (Math.PI / 2)
  }, [camera])

  // 겹침 체크 (useCallback으로 메모이제이션)
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

  // 마커 설치 가능 여부 체크 (모드별 싱글톤 적용)
  const canPlaceMarker = useCallback((type: MarkerType) => {
    const singletonMarkers = getSingletonMarkers(mapMode, shooterSubMode)
    if (!singletonMarkers.includes(type)) return true
    return !markers.some(m => m.type === type)
  }, [markers, mapMode, shooterSubMode])

  useFrame(() => {
    // 캡처 모드이거나 포인터 잠금이 해제된 경우 미리보기 숨기기
    const isCaptureMode = useEditorStore.getState().isThumbnailCaptureMode
    // 선택 모드 (currentPlaceable === null && currentMarker === null)
    const isSelectMode = currentPlaceable === null && currentMarker === null
    if (document.pointerLockElement === null || isCaptureMode || isSelectMode) {
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
          const canPlace = canPlaceMarker(currentMarker)
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

      // 에디터 오브젝트에 맞으면 인접 배치
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
        // 바닥 배치 (plane은 0, 나머지는 0.5)
        const heightOffset = type === 'plane' ? 0 : 0.5
        snappedPos = [snap(hit.point.x), snap(hit.point.y + heightOffset), snap(hit.point.z)]
      }

      const isOverlapping = checkOverlap(snappedPos, newScale)

      meshRef.current.visible = true
      meshRef.current.position.set(snappedPos[0], snappedPos[1], snappedPos[2])
      meshRef.current.scale.set(newScale[0], newScale[1], newScale[2])

      if (type === 'plane' || type === 'ramp') {
        meshRef.current.rotation.set(0, yaw, 0)
      } else {
        meshRef.current.rotation.set(0, 0, 0)
      }

      const mat = meshRef.current.material as THREE.MeshStandardMaterial
      mat.color.set(isOverlapping ? '#ff4444' : '#44ff44')
      return
    }

    if (meshRef.current) meshRef.current.visible = false
    if (markerRef.current) markerRef.current.visible = false
  })

  // 캐시된 지오메트리 선택
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
  const ringGeometry = useMemo(() => getRingGeometry(), [])
  const coneGeometry = useMemo(() => getConeGeometry(), [])
  const smallConeGeometry = useMemo(() => getSmallConeGeometry(), [])

  const killzonePreviewMaterial = useMemo(() => getTransparentMaterial(MARKER_COLORS.killzone, true), [])
  const markerPreviewMaterial = useMemo(() =>
    getTransparentMaterial(currentMarker ? MARKER_COLORS[currentMarker] || '#ffffff' : '#ffffff'),
    [currentMarker]
  )

  return (
    <>
      {/* 오브젝트 미리보기 - 레이캐스트 제외 */}
      <mesh ref={meshRef} visible={false} raycast={noRaycast} geometry={previewGeometry} material={previewMaterial} />

      {/* 마커 미리보기 - 레이캐스트 제외 */}
      <group ref={markerRef} visible={false} raycast={noRaycast}>
        {currentMarker === 'killzone' ? (
          /* 킬존: 원형 범위 표시 (반경 2.0) */
          <mesh
            rotation={MARKER_RING_ROTATION}
            position={MARKER_RING_POSITION}
            raycast={noRaycast}
            geometry={ringGeometry}
            material={killzonePreviewMaterial}
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

// 붙여넣기 미리보기 (Ctrl+C 후 클립보드 아이템들을 마우스 위치에 표시)
function PastePreview() {
  const { camera, scene } = useThree()
  const isPasteMode = useEditorStore(state => state.isPasteMode)
  const clipboard = useEditorStore(state => state.clipboard)

  const groupRef = useRef<THREE.Group>(null)
  const raycaster = useRef(new THREE.Raycaster())
  const screenCenter = useRef(new THREE.Vector2(0, 0))

  // 클립보드 아이템들의 중심점 계산
  const clipboardCenter = useMemo(() => {
    if (clipboard.length === 0) return [0, 0, 0] as [number, number, number]
    let cx = 0, cy = 0, cz = 0
    for (const item of clipboard) {
      cx += item.data.position[0]
      cy += item.data.position[1]
      cz += item.data.position[2]
    }
    return [cx / clipboard.length, cy / clipboard.length, cz / clipboard.length] as [number, number, number]
  }, [clipboard])

  useFrame(() => {
    if (!groupRef.current) return

    // 붙여넣기 모드가 아니거나 포인터 잠금 해제 시 숨김
    if (!isPasteMode || document.pointerLockElement === null) {
      groupRef.current.visible = false
      return
    }

    raycaster.current.setFromCamera(screenCenter.current, camera)
    const intersects = raycaster.current.intersectObjects(scene.children, true)

    for (const hit of intersects) {
      const heightOffset = 0.5
      const basePos: [number, number, number] = [snap(hit.point.x), snap(hit.point.y + heightOffset), snap(hit.point.z)]

      groupRef.current.visible = true
      groupRef.current.position.set(
        basePos[0] - clipboardCenter[0],
        basePos[1] - clipboardCenter[1],
        basePos[2] - clipboardCenter[2]
      )
      return
    }

    groupRef.current.visible = false
  })

  if (!isPasteMode || clipboard.length === 0) return null

  return (
    <group ref={groupRef} visible={false}>
      {clipboard.map((item, index) => {
        if (item.kind === 'object') {
          const obj = item.data
          const geometry = (() => {
            switch (obj.type) {
              case 'box': return getBoxGeometry()
              case 'plane': return getPlaneGeometry()
              case 'cylinder': return getCylinderGeometry()
              case 'sphere': return getSphereGeometry()
              case 'ramp': return getWedgeGeometry()
              default: return getBoxGeometry()
            }
          })()
          const material = getTransparentMaterial(obj.color)

          return (
            <mesh
              key={`paste-preview-${index}`}
              geometry={geometry}
              material={material}
              position={obj.position}
              rotation={obj.rotation}
              scale={obj.scale}
              raycast={noRaycast}
            />
          )
        } else {
          // 마커 미리보기
          const marker = item.data
          const color = MARKER_COLORS[marker.type] || '#ffffff'
          const material = getTransparentMaterial(color)

          if (marker.type === 'killzone') {
            return (
              <mesh
                key={`paste-preview-${index}`}
                position={[marker.position[0], marker.position[1] + 0.01, marker.position[2]]}
                rotation={MARKER_RING_ROTATION}
                geometry={getRingGeometry()}
                material={getTransparentMaterial(color, true)}
                raycast={noRaycast}
              />
            )
          }

          return (
            <group key={`paste-preview-${index}`} position={marker.position} rotation={marker.rotation}>
              <mesh geometry={getConeGeometry()} material={material} raycast={noRaycast} />
              <mesh position={MARKER_ARROW_POSITION} geometry={getSmallConeGeometry()} material={material} raycast={noRaycast} />
            </group>
          )
        }
      })}
    </group>
  )
}

// 커스텀 쐐기/경사로 지오메트리 (전역 캐시 사용)
function getWedgeGeometry(): THREE.BufferGeometry {
  if (cachedWedgeGeometry) return cachedWedgeGeometry

  const geometry = new THREE.BufferGeometry()

  const posArray = new Float32Array([
    // 바닥 면
    -0.5, 0, -0.5,  0.5, 0, -0.5,  0.5, 0, 0.5,
    -0.5, 0, -0.5,  0.5, 0, 0.5,  -0.5, 0, 0.5,
    // 앞 면
    -0.5, 0, 0.5,  0.5, 0, 0.5,  0.5, 1, 0.5,
    -0.5, 0, 0.5,  0.5, 1, 0.5,  -0.5, 1, 0.5,
    // 경사 면
    -0.5, 1, 0.5,  0.5, 1, 0.5,  0.5, 0, -0.5,
    -0.5, 1, 0.5,  0.5, 0, -0.5,  -0.5, 0, -0.5,
    // 왼쪽 면
    -0.5, 0, -0.5,  -0.5, 0, 0.5,  -0.5, 1, 0.5,
    // 오른쪽 면
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

// 오브젝트 메쉬 컴포넌트 (React.memo로 최적화)
const EditorObject = memo(function EditorObject({ obj, selected }: { obj: MapObject; selected: boolean }) {
  // useMemo로 지오메트리 캐싱
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

// 마커 컴포넌트 (React.memo로 최적화)
const EditorMarker = memo(function EditorMarker({ marker, selected }: { marker: MapMarker; selected: boolean }) {
  const color = MARKER_COLORS[marker.type] || '#ffffff'
  const isKillzone = marker.type === 'killzone'

  const ringGeometry = useMemo(() => getRingGeometry(), [])
  const coneGeometry = useMemo(() => getConeGeometry(), [])
  const smallConeGeometry = useMemo(() => getSmallConeGeometry(), [])

  const mainMaterial = useMemo(() =>
    getMaterial(color, selected ? color : '#000000', selected ? 0.5 : 0, isKillzone),
    [color, selected, isKillzone]
  )
  const arrowMaterial = useMemo(() => getMaterial(color, '#000000', 0), [color])

  return (
    <group position={marker.position} rotation={marker.rotation}>
      {isKillzone ? (
        /* 킬존: 원형 링 (반경 2.0) */
        <mesh
          rotation={MARKER_RING_ROTATION}
          position={MARKER_RING_POSITION}
          userData={{ isEditorObject: true, objectId: `marker_${marker.id}` }}
          geometry={ringGeometry}
          material={mainMaterial}
        />
      ) : (
        /* 기타 마커: 콘 형태 */
        <>
          <mesh
            userData={{ isEditorObject: true, objectId: `marker_${marker.id}` }}
            geometry={coneGeometry}
            material={mainMaterial}
          />
          <mesh
            position={MARKER_ARROW_POSITION}
            rotation={MARKER_ARROW_ROTATION}
            geometry={smallConeGeometry}
            material={arrowMaterial}
          />
        </>
      )}
    </group>
  )
})

// 씬 콘텐츠 (최적화된 셀렉터 사용)
const SceneContent = memo(function SceneContent() {
  const objects = useEditorStore(state => state.objects)
  const markers = useEditorStore(state => state.markers)
  const selectedIds = useEditorStore(state => state.selectedIds)

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
          selected={selectedIds.includes(obj.id)}
        />
      ))}

      {/* 마커 */}
      {markers.map(marker => (
        <EditorMarker
          key={marker.id}
          marker={marker}
          selected={selectedIds.includes(`marker_${marker.id}`)}
        />
      ))}

      {/* FPS 카메라 */}
      <FPSCamera />

      {/* 레이캐스트 배치 */}
      <RaycastPlacer />

      {/* 설치 미리보기 */}
      <PlacementPreview />

      {/* 붙여넣기 미리보기 */}
      <PastePreview />

      {/* 키보드 단축키 */}
      <KeyboardShortcuts />
    </>
  )
})

// 키보드 단축키 (최적화된 셀렉터)
const KeyboardShortcuts = memo(function KeyboardShortcuts() {
  const selectedIds = useEditorStore(state => state.selectedIds)
  const duplicateSelected = useEditorStore(state => state.duplicateSelected)
  const deleteSelected = useEditorStore(state => state.deleteSelected)
  const setCurrentPlaceable = useEditorStore(state => state.setCurrentPlaceable)
  const setCurrentMarker = useEditorStore(state => state.setCurrentMarker)
  const mapMode = useEditorStore(state => state.mapMode)
  const shooterSubMode = useEditorStore(state => state.shooterSubMode)
  const undo = useEditorStore(state => state.undo)
  const redo = useEditorStore(state => state.redo)
  const copy = useEditorStore(state => state.copy)
  const exitPasteMode = useEditorStore(state => state.exitPasteMode)

  // 핸들러를 useCallback으로 메모이제이션하여 불필요한 리스너 재등록 방지
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
      // 입력 필드에서는 단축키 무시
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return

      // ESC키 - 붙여넣기 모드 종료
      if (e.key === 'Escape') {
        const state = useEditorStore.getState()
        if (state.isPasteMode) {
          exitPasteMode()
          return
        }
      }

      // Q키 - 선택 모드 (붙여넣기 모드도 종료)
      if (e.key.toLowerCase() === 'q' && !e.ctrlKey && !e.metaKey) {
        // currentPlaceable과 currentMarker를 모두 null로 설정 (선택 모드)
        useEditorStore.setState({ currentPlaceable: null, currentMarker: null, isPasteMode: false })
        return
      }

      // 숫자 키로 오브젝트 선택 (1-5) - 붙여넣기 모드도 종료
      const placeables: PlaceableType[] = ['box', 'cylinder', 'sphere', 'plane', 'ramp']
      if (e.key >= '1' && e.key <= '5') {
        useEditorStore.setState({ isPasteMode: false })
        setCurrentPlaceable(placeables[parseInt(e.key) - 1])
        return
      }

      // 숫자 키로 마커 선택 (6-9) - 붙여넣기 모드도 종료
      if (e.key >= '6' && e.key <= '9') {
        const markerIndex = parseInt(e.key) - 6

        // 현재 모드에 맞는 마커 배열
        let markers: MarkerType[] = []
        if (mapMode === 'race') {
          markers = ['spawn', 'checkpoint', 'finish', 'killzone']
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
          useEditorStore.setState({ isPasteMode: false })
          setCurrentMarker(markers[markerIndex])
        }
        return
      }

      switch (e.key.toLowerCase()) {
        case 'delete':
        case 'backspace':
          if (selectedIds.length > 0) {
            deleteSelected()
          }
          break
        case 'd':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault()
            duplicateSelected()
          }
          break
        case 'z':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault()
            if (e.shiftKey) {
              redo()
            } else {
              undo()
            }
          }
          break
        case 'y':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault()
            redo()
          }
          break
        case 'c':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault()
            copy()  // 복사 + 붙여넣기 모드 진입
          }
          break
        // Ctrl+V는 더 이상 사용하지 않음 (좌클릭으로 붙여넣기)
      }
  }, [selectedIds, duplicateSelected, deleteSelected, setCurrentPlaceable, setCurrentMarker, mapMode, shooterSubMode, undo, redo, copy, exitPasteMode])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  return null
})

// 크로스헤어 컴포넌트 (정적 UI - memo로 리렌더 방지)
const Crosshair = memo(function Crosshair() {
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
})

// 썸네일 캡처 모드 UI
const ThumbnailCaptureOverlay = memo(function ThumbnailCaptureOverlay() {
  const isThumbnailCaptureMode = useEditorStore(state => state.isThumbnailCaptureMode)
  const setThumbnailCaptureMode = useEditorStore(state => state.setThumbnailCaptureMode)
  const setCapturedThumbnail = useEditorStore(state => state.setCapturedThumbnail)

  const handleCapture = useCallback(() => {
    // 캡처 전 포인터 락 해제
    document.exitPointerLock()

    const canvas = document.querySelector('canvas') as HTMLCanvasElement | null
    if (canvas) {
      canvas.toBlob((blob) => {
        if (blob) {
          setCapturedThumbnail(blob)
          setThumbnailCaptureMode(false)
        }
      }, 'image/png', 0.9)
    }
  }, [setCapturedThumbnail, setThumbnailCaptureMode])

  const handleCancel = useCallback(() => {
    document.exitPointerLock()
    setThumbnailCaptureMode(false)
  }, [setThumbnailCaptureMode])

  useEffect(() => {
    if (!isThumbnailCaptureMode) return

    const canvas = document.querySelector('canvas') as HTMLCanvasElement | null

    const handleClick = (e: MouseEvent) => {
      if (e.button === 0) { // 좌클릭
        e.preventDefault()
        e.stopPropagation()
        handleCapture()
      }
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleCancel()
      }
    }

    // 약간의 지연 후 포인터 락 요청 및 이벤트 등록 (모달 닫힌 후)
    const timer = setTimeout(async () => {
      // 자동 포인터 락
      if (canvas) {
        try {
          await canvas.requestPointerLock()
        } catch {
          // 포인터 락 요청 취소됨 (무시)
        }
      }
      window.addEventListener('click', handleClick, true)
      window.addEventListener('keydown', handleKeyDown)
    }, 200)

    return () => {
      clearTimeout(timer)
      window.removeEventListener('click', handleClick, true)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isThumbnailCaptureMode, handleCapture, handleCancel])

  if (!isThumbnailCaptureMode) return null

  return (
    <div className="absolute inset-0 z-50 pointer-events-none">
      {/* 캡처 프레임 */}
      <div className="absolute inset-4 border-4 border-dashed border-violet-400 rounded-2xl" />

      {/* 안내 메시지 */}
      <div className="absolute top-8 left-1/2 -translate-x-1/2 bg-slate-900/90 backdrop-blur-sm rounded-xl px-6 py-3 border border-violet-400/50">
        <div className="text-violet-300 font-medium text-center">
          카메라를 원하는 위치로 이동한 후 좌클릭하여 캡처
        </div>
        <div className="text-white/50 text-sm text-center mt-1">
          WASD로 이동 / ESC로 취소
        </div>
      </div>
    </div>
  )
})

export function EditorCanvas() {
  return (
    <div className="w-full h-full relative">
      <Canvas
        camera={{ fov: 60, near: 0.1, far: 1000 }}
        shadows
        gl={{ preserveDrawingBuffer: true }}
      >
        <SceneContent />
      </Canvas>
      <Crosshair />
      <ThumbnailCaptureOverlay />
    </div>
  )
}
