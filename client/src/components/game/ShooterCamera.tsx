import { useRef, useEffect, memo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useGameStore } from '../../stores/gameStore'
import { requestPointerLock } from '../../lib/pointerLock'

// ============ 카메라 설정 ============
const MOUSE_SENSITIVITY = 0.002
const HEAD_OFFSET = new THREE.Vector3(0, 2, 0)

// FOV 설정
const DEFAULT_FOV = 60
const SNIPER_SCOPE_FOV = 20
const FOV_LERP_SPEED = 0.08

// TPS 카메라 오프셋 (캐릭터를 왼쪽 아래로 배치)
const TPS_LOOK_OFFSET_RIGHT = -1.5
const TPS_LOOK_OFFSET_UP = 0.8
const CAMERA_LERP = 0.1
const AIM_DISTANCE = 3  // 홀드 조준 시 카메라 거리

// 홀드 조준 시 오프셋 (더 정밀한 조준)
const AIM_LOOK_OFFSET_RIGHT = -1.0
const AIM_LOOK_OFFSET_UP = 0.4

// 3인칭 → 토글 조준 시 카메라 오프셋 (1인칭과 별도)
const TPS_TOGGLE_AIM_OFFSET_BACK = 0.4
const TPS_TOGGLE_AIM_OFFSET_UP = 0.5
const TPS_TOGGLE_AIM_OFFSET_RIGHT = 0

// 3인칭 → 토글 조준 시 바라보는 지점 오프셋
const TPS_TOGGLE_AIM_LOOK_RIGHT = -3.2
const TPS_TOGGLE_AIM_LOOK_UP = 2.1

// pitch 제한
const MIN_PITCH = -0.5
const MAX_PITCH = 1.2

// 조준 시 자세별 카메라 높이
const AIM_HEIGHT_STANDING = 2
const AIM_HEIGHT_SITTING = 1.2
const AIM_HEIGHT_CRAWLING = 0.5

// 1인칭 자세별 눈 높이
const FPS_EYE_HEIGHT_STANDING = 1.7
const FPS_EYE_HEIGHT_SITTING = 1.0
const FPS_EYE_HEIGHT_CRAWLING = 0.3

// 카메라 벽 충돌 설정
const CAMERA_WALL_OFFSET = 0.3          // 벽 앞 오프셋
const CAMERA_RAYCAST_CACHE_INTERVAL = 500 // 레이캐스트 타겟 캐시 갱신 간격 (ms)

// 재사용 객체
const _targetPos = new THREE.Vector3()
const _offset = new THREE.Vector3()
const _targetCamPos = new THREE.Vector3()
const _headPos = new THREE.Vector3()
const _camRayDir = new THREE.Vector3()
const _camRaycaster = new THREE.Raycaster()
const _eyePos = new THREE.Vector3()

// 삼각함수 캐시 (angle 기반)
let _cachedAngle = 0
let _sinAngle = 0
let _cosAngle = 0
let _sinAngleRight = 0
let _cosAngleRight = 0

function updateTrigCache(angle: number) {
  if (angle !== _cachedAngle) {
    _cachedAngle = angle
    _sinAngle = Math.sin(angle)
    _cosAngle = Math.cos(angle)
    const rightAngle = angle - Math.PI / 2
    _sinAngleRight = Math.sin(rightAngle)
    _cosAngleRight = Math.cos(rightAngle)
  }
}

// ============ ShooterCamera 컴포넌트 ============
const ShooterCamera = memo(function ShooterCamera() {
  const { camera, gl, scene } = useThree()

  const angleRef = useRef(0)
  const pitchRef = useRef(0.3)
  const currentCamPos = useRef(new THREE.Vector3())
  const currentLookPos = useRef(new THREE.Vector3())
  const initialized = useRef(false)
  const isLocked = useRef(false)
  const skipNextMove = useRef(false)
  const isAiming = useRef(false) // 우클릭 홀드 상태 (카메라 거리용)
  const currentEyeHeight = useRef(FPS_EYE_HEIGHT_STANDING)
  const camRaycastTargets = useRef<THREE.Object3D[]>([])
  const lastCamCacheTime = useRef(0)

  useEffect(() => {
    const canvas = gl.domElement

    const onClick = () => requestPointerLock(canvas)

    const onMouseMove = (e: MouseEvent) => {
      if (!isLocked.current) return
      if (skipNextMove.current) { skipNextMove.current = false; return }

      const maxMove = 50
      const moveX = Math.max(-maxMove, Math.min(maxMove, e.movementX))
      const moveY = Math.max(-maxMove, Math.min(maxMove, e.movementY))

      let angle = angleRef.current - moveX * MOUSE_SENSITIVITY
      angle = angle % (Math.PI * 2)
      if (angle < 0) angle += Math.PI * 2
      angleRef.current = angle

      let pitch = pitchRef.current + moveY * MOUSE_SENSITIVITY
      pitch = Math.max(MIN_PITCH, Math.min(MAX_PITCH, pitch))
      pitchRef.current = pitch

      const store = useGameStore.getState()
      store.setCameraPitch(pitch)
      store.setCameraAngle(angle)
    }

    const onMouseDown = (e: MouseEvent) => {
      if (e.button === 2) isAiming.current = true
    }

    const onMouseUp = (e: MouseEvent) => {
      if (e.button === 2) isAiming.current = false
    }

    const onContextMenu = (e: Event) => e.preventDefault()

    const onPointerLockChange = () => {
      const locked = document.pointerLockElement === canvas
      if (locked && !isLocked.current) skipNextMove.current = true
      isLocked.current = locked
    }

    canvas.addEventListener('click', onClick)
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('pointerlockchange', onPointerLockChange)
    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('mouseup', onMouseUp)
    document.addEventListener('contextmenu', onContextMenu)

    return () => {
      canvas.removeEventListener('click', onClick)
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('pointerlockchange', onPointerLockChange)
      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('mouseup', onMouseUp)
      document.removeEventListener('contextmenu', onContextMenu)
    }
  }, [gl])

  useFrame(() => {
    const store = useGameStore.getState()
    const playerPos = store.playerPos
    _targetPos.set(playerPos[0], playerPos[1], playerPos[2])

    // 레이캐스트 타겟 캐시 갱신
    const now = performance.now()
    if (now - lastCamCacheTime.current > CAMERA_RAYCAST_CACHE_INTERVAL) {
      const targets: THREE.Object3D[] = []
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh &&
            !obj.userData?.isPlayer &&
            !obj.userData?.isEffect) {
          targets.push(obj)
        }
      })
      camRaycastTargets.current = targets
      lastCamCacheTime.current = now
    }

    // FOV 줌 (스나이퍼 스코프)
    const targetFov = (store.weaponType === 'sniper' && store.isToggleAiming) ? SNIPER_SCOPE_FOV : DEFAULT_FOV
    const cam = camera as THREE.PerspectiveCamera
    const fovDiff = targetFov - cam.fov
    if (Math.abs(fovDiff) > 0.01) {
      cam.fov += fovDiff * FOV_LERP_SPEED
      cam.updateProjectionMatrix()
      store.setCurrentFov(cam.fov)
    }

    const basePitch = pitchRef.current
    const angle = angleRef.current

    // 반동을 pitch에 적용 (도 → 라디안)
    const recoilRad = THREE.MathUtils.degToRad(store.recoilPitch)
    const pitch = basePitch - recoilRad

    // 삼각함수 캐시 업데이트
    updateTrigCache(angle)

    // 1인칭 모드 또는 토글 조준 시 FPS 카메라 사용
    const useFpsCamera = store.viewMode === 'fps' || store.isToggleAiming
    const isTpsToggleAim = store.viewMode === 'tps' && store.isToggleAiming

    if (useFpsCamera) {
      // ===== 1인칭 / 토글 조준 =====
      let targetEyeHeight = FPS_EYE_HEIGHT_STANDING
      const posture = store.posture
      if (posture === 'sitting') targetEyeHeight = FPS_EYE_HEIGHT_SITTING
      else if (posture === 'crawling') targetEyeHeight = FPS_EYE_HEIGHT_CRAWLING

      // 눈 높이 부드럽게 전환
      currentEyeHeight.current += (targetEyeHeight - currentEyeHeight.current) * 0.08
      const eyeHeight = currentEyeHeight.current

      // 3인칭 토글 조준 vs 1인칭: 다른 오프셋 사용
      const offsetBack = isTpsToggleAim ? TPS_TOGGLE_AIM_OFFSET_BACK : 0.4
      const offsetUp = isTpsToggleAim ? TPS_TOGGLE_AIM_OFFSET_UP : 0.5
      const offsetRight = isTpsToggleAim ? TPS_TOGGLE_AIM_OFFSET_RIGHT : 0

      // 카메라 위치 (캐시된 삼각함수 사용)
      _targetCamPos.set(
        _targetPos.x - _sinAngle * offsetBack + _sinAngleRight * offsetRight,
        _targetPos.y + eyeHeight + offsetUp,
        _targetPos.z - _cosAngle * offsetBack + _cosAngleRight * offsetRight
      )

      // 바라보는 방향 계산
      const cosPitch = Math.cos(pitch)
      const sinPitch = Math.sin(pitch)
      const lookDistance = 10
      _headPos.set(
        _targetPos.x - _sinAngle * cosPitch * lookDistance,
        _targetPos.y + eyeHeight - sinPitch * lookDistance,
        _targetPos.z - _cosAngle * cosPitch * lookDistance
      )

      // 3인칭 토글 조준 시 바라보는 지점 오프셋 적용
      if (isTpsToggleAim) {
        _headPos.x += _sinAngleRight * TPS_TOGGLE_AIM_LOOK_RIGHT
        _headPos.z += _cosAngleRight * TPS_TOGGLE_AIM_LOOK_RIGHT
        _headPos.y += TPS_TOGGLE_AIM_LOOK_UP
      }

      // 카메라 벽 충돌: 눈 위치 → 목표 카메라 위치
      _eyePos.set(_targetPos.x, _targetPos.y + eyeHeight, _targetPos.z)
      _camRayDir.subVectors(_targetCamPos, _eyePos)
      const camDist = _camRayDir.length()
      if (camDist > 0.01) {
        _camRayDir.divideScalar(camDist)
        _camRaycaster.set(_eyePos, _camRayDir)
        _camRaycaster.far = camDist
        const hits = _camRaycaster.intersectObjects(camRaycastTargets.current, false)
        if (hits.length > 0) {
          const clampDist = Math.max(0, hits[0].distance - CAMERA_WALL_OFFSET)
          _targetCamPos.copy(_eyePos).addScaledVector(_camRayDir, clampDist)
        }
      }

      // 1인칭은 lerp 없이 즉시 따라감
      camera.position.copy(_targetCamPos)
      camera.lookAt(_headPos)

      // 전방 벽 근접 체크 (near plane 클리핑으로 벽 투시 방지)
      camera.getWorldDirection(_camRayDir)
      _camRaycaster.set(camera.position, _camRayDir)
      _camRaycaster.far = CAMERA_WALL_OFFSET
      const fpsFrontHits = _camRaycaster.intersectObjects(camRaycastTargets.current, false)
      if (fpsFrontHits.length > 0) {
        camera.position.addScaledVector(_camRayDir, -(CAMERA_WALL_OFFSET - fpsFrontHits[0].distance))
      }
      return
    }

    // ===== 3인칭 TPS =====
    let distance = 8
    if (isAiming.current) {
      distance = AIM_DISTANCE
    }

    // 조준 시 자세별 카메라 높이
    let cameraHeight = 2
    if (isAiming.current) {
      const posture = store.posture
      if (posture === 'sitting') cameraHeight = AIM_HEIGHT_SITTING
      else if (posture === 'crawling') cameraHeight = AIM_HEIGHT_CRAWLING
      else cameraHeight = AIM_HEIGHT_STANDING
    }

    // 구면 좌표계로 카메라 위치 계산 (캐시된 삼각함수 사용)
    const cosPitch = Math.cos(pitch)
    const sinPitch = Math.sin(pitch)
    _offset.set(
      _sinAngle * cosPitch * distance,
      sinPitch * distance + cameraHeight,
      _cosAngle * cosPitch * distance
    )

    _targetCamPos.copy(_targetPos).add(_offset)

    // TPS 카메라 벽 충돌: 플레이어 머리 → 목표 카메라 위치
    _eyePos.set(_targetPos.x, _targetPos.y + cameraHeight, _targetPos.z)
    _camRayDir.subVectors(_targetCamPos, _eyePos)
    const tpsCamDist = _camRayDir.length()
    if (tpsCamDist > 0.01) {
      _camRayDir.divideScalar(tpsCamDist)
      _camRaycaster.set(_eyePos, _camRayDir)
      _camRaycaster.far = tpsCamDist
      const hits = _camRaycaster.intersectObjects(camRaycastTargets.current, false)
      if (hits.length > 0) {
        const clampDist = Math.max(0, hits[0].distance - CAMERA_WALL_OFFSET)
        _targetCamPos.copy(_eyePos).addScaledVector(_camRayDir, clampDist)
      }
    }

    if (!initialized.current) {
      initialized.current = true
      currentCamPos.current.copy(_targetCamPos)
      currentLookPos.current.copy(_headPos)
    }

    currentCamPos.current.lerp(_targetCamPos, CAMERA_LERP)
    camera.position.copy(currentCamPos.current)

    _headPos.copy(_targetPos).add(HEAD_OFFSET)

    // 조준 시 자세별 바라보는 높이
    if (isAiming.current) {
      const posture = store.posture
      if (posture === 'sitting') _headPos.y = _targetPos.y + AIM_HEIGHT_SITTING
      else if (posture === 'crawling') _headPos.y = _targetPos.y + AIM_HEIGHT_CRAWLING
      else _headPos.y = _targetPos.y + AIM_HEIGHT_STANDING
    }

    // 조준 여부에 따라 다른 오프셋 사용
    const lookOffsetRight = isAiming.current ? AIM_LOOK_OFFSET_RIGHT : TPS_LOOK_OFFSET_RIGHT
    const lookOffsetUp = isAiming.current ? AIM_LOOK_OFFSET_UP : TPS_LOOK_OFFSET_UP

    // 오른쪽 방향 계산 (캐시된 삼각함수 사용)
    _headPos.x += _sinAngleRight * lookOffsetRight
    _headPos.z += _cosAngleRight * lookOffsetRight
    _headPos.y += lookOffsetUp

    // 바라보는 위치도 부드럽게 전환
    currentLookPos.current.lerp(_headPos, CAMERA_LERP)
    camera.lookAt(currentLookPos.current)

    // 전방 벽 근접 체크 (near plane 클리핑으로 벽 투시 방지)
    camera.getWorldDirection(_camRayDir)
    _camRaycaster.set(camera.position, _camRayDir)
    _camRaycaster.far = CAMERA_WALL_OFFSET
    const tpsFrontHits = _camRaycaster.intersectObjects(camRaycastTargets.current, false)
    if (tpsFrontHits.length > 0) {
      camera.position.addScaledVector(_camRayDir, -(CAMERA_WALL_OFFSET - tpsFrontHits[0].distance))
    }
  })

  return null
})

export default ShooterCamera
