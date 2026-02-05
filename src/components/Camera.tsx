import { useRef, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore } from '../store/gameStore';

// 카메라 설정
const HEAD_OFFSET = new THREE.Vector3(0, 2, 0);
const MOUSE_SENSITIVITY = 0.002;

// 총게임 모드 카메라 오프셋 (캐릭터를 왼쪽 아래로 배치)
const TPS_LOOK_OFFSET_RIGHT = -1.5;  // 왼쪽으로
const TPS_LOOK_OFFSET_UP = 0.8;     // 위로
const CAMERA_LERP = 0.1;
const AIM_DISTANCE = 3;  // 우클릭(조준) 시 카메라 거리

// 홀드 조준 시 오프셋 (더 정밀한 조준)
const AIM_LOOK_OFFSET_RIGHT = -1.0;  // 덜 왼쪽으로
const AIM_LOOK_OFFSET_UP = 0.4;      // 덜 위로

// 3인칭 → 토글 조준 시 카메라 오프셋 (1인칭과 별도)
const TPS_TOGGLE_AIM_OFFSET_BACK = 0.4;    // 뒤로 (0 = 눈 위치)
const TPS_TOGGLE_AIM_OFFSET_UP = 0.5;      // 위로
const TPS_TOGGLE_AIM_OFFSET_RIGHT = 0;     // 오른쪽으로

// 3인칭 → 토글 조준 시 바라보는 지점 오프셋 (+를 이동)
const TPS_TOGGLE_AIM_LOOK_RIGHT = -3.2;   // +를 오른쪽으로
const TPS_TOGGLE_AIM_LOOK_UP = 2.1;      // +를 위로

// 3인칭 모드별 이동 방향 보정 각도 (+위치 기준으로 이동)
const TPS_NORMAL_ANGLE_OFFSET = Math.atan2(TPS_LOOK_OFFSET_RIGHT, 10);      // 일반 3인칭
const TPS_HOLD_AIM_ANGLE_OFFSET = Math.atan2(AIM_LOOK_OFFSET_RIGHT, 5);     // 홀드 조준
const TPS_TOGGLE_AIM_ANGLE_OFFSET = Math.atan2(TPS_TOGGLE_AIM_LOOK_RIGHT, 15); // 토글 조준

// 조준 시 자세별 카메라 높이
const AIM_HEIGHT_STANDING = 2;
const AIM_HEIGHT_SITTING = 1.2;
const AIM_HEIGHT_CRAWLING = 0.5;

// 1인칭 자세별 눈 높이
const FPS_EYE_HEIGHT_STANDING = 1.7;
const FPS_EYE_HEIGHT_SITTING = 1.0;
const FPS_EYE_HEIGHT_CRAWLING = 0.3;
const MIN_DISTANCE = 5;
const MAX_DISTANCE = 50;
const MIN_PITCH = -0.5;
const MAX_PITCH = 1.2;

// 재사용 가능한 객체
const _targetPos = new THREE.Vector3();
const _offset = new THREE.Vector3();
const _targetCamPos = new THREE.Vector3();
const _headPos = new THREE.Vector3();

// 삼각함수 캐시 (angle 기반)
let _cachedAngle = 0;
let _sinAngle = 0;
let _cosAngle = 0;
let _sinAngleRight = 0;  // angle - PI/2
let _cosAngleRight = 0;

function updateTrigCache(angle: number) {
  if (angle !== _cachedAngle) {
    _cachedAngle = angle;
    _sinAngle = Math.sin(angle);
    _cosAngle = Math.cos(angle);
    const rightAngle = angle - Math.PI / 2;
    _sinAngleRight = Math.sin(rightAngle);
    _cosAngleRight = Math.cos(rightAngle);
  }
}

export function Camera() {
  const { camera, gl } = useThree();

  // useRef로 상태 관리 (성능 최적화)
  const angleRef = useRef(useGameStore.getState().cameraAngle);
  const pitchRef = useRef(useGameStore.getState().cameraPitch);
  const distanceRef = useRef(useGameStore.getState().cameraDistance);
  const currentCamPos = useRef(new THREE.Vector3());
  const initialized = useRef(false);
  const isLocked = useRef(false);
  const skipNextMove = useRef(false);
  const isAiming = useRef(false);
  const currentLookPos = useRef(new THREE.Vector3());
  const currentEyeHeight = useRef(FPS_EYE_HEIGHT_STANDING);  // 현재 눈 높이 (부드러운 전환용)

  useEffect(() => {
    const canvas = gl.domElement;

    const onClick = () => {
      canvas.requestPointerLock();
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!isLocked.current) return;

      if (skipNextMove.current) {
        skipNextMove.current = false;
        return;
      }

      const maxMove = 50;
      const moveX = Math.max(-maxMove, Math.min(maxMove, e.movementX));
      const moveY = Math.max(-maxMove, Math.min(maxMove, e.movementY));

      let angle = angleRef.current - moveX * MOUSE_SENSITIVITY;
      angle = angle % (Math.PI * 2);
      if (angle < 0) angle += Math.PI * 2;
      angleRef.current = angle;

      const store = useGameStore.getState();

      if (store.gameMode === 'gunGame') {
        if (store.cameraMode === 'free') {
          // 자유 모드: pitch도 조절, lookDirection은 업데이트 안함
          let pitch = pitchRef.current + moveY * MOUSE_SENSITIVITY;
          pitch = Math.max(MIN_PITCH, Math.min(MAX_PITCH, pitch));
          pitchRef.current = pitch;
          store.setCameraPitch(pitch);
          store.setCameraAngle(angle);
        } else {
          // 팔로우 모드: pitch도 조절 + lookDirection 업데이트
          let pitch = pitchRef.current + moveY * MOUSE_SENSITIVITY;
          pitch = Math.max(MIN_PITCH, Math.min(MAX_PITCH, pitch));
          pitchRef.current = pitch;
          store.setCameraPitch(pitch);

          // 3인칭 모드: +위치 기준으로 이동 방향 보정
          let adjustedAngle = angle;
          if (store.viewMode === 'thirdPerson') {
            if (store.isToggleAiming) {
              adjustedAngle = angle + TPS_TOGGLE_AIM_ANGLE_OFFSET;
            } else if (isAiming.current) {
              adjustedAngle = angle + TPS_HOLD_AIM_ANGLE_OFFSET;
            } else {
              adjustedAngle = angle + TPS_NORMAL_ANGLE_OFFSET;
            }
          }
          store.setLookDirection(adjustedAngle);
          store.setCameraAngle(angle);
        }
      } else {
        store.setCameraAngle(angle);
      }
    };

    const onWheel = (e: WheelEvent) => {
      const store = useGameStore.getState();
      if (store.gameMode === 'gunGame' && store.cameraMode === 'free') {
        let distance = distanceRef.current + e.deltaY * 0.02;
        distance = Math.max(MIN_DISTANCE, Math.min(MAX_DISTANCE, distance));
        distanceRef.current = distance;
        store.setCameraDistance(distance);
      }
    };

    const onPointerLockChange = () => {
      const locked = document.pointerLockElement === canvas;
      if (locked && !isLocked.current) {
        skipNextMove.current = true;
      }
      isLocked.current = locked;
    };

    const onMouseDown = (e: MouseEvent) => {
      if (e.button === 2) isAiming.current = true;
    };

    const onMouseUp = (e: MouseEvent) => {
      if (e.button === 2) isAiming.current = false;
    };

    const onContextMenu = (e: MouseEvent) => e.preventDefault();

    canvas.addEventListener('click', onClick);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('pointerlockchange', onPointerLockChange);
    document.addEventListener('wheel', onWheel);
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mouseup', onMouseUp);
    document.addEventListener('contextmenu', onContextMenu);

    return () => {
      canvas.removeEventListener('click', onClick);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('pointerlockchange', onPointerLockChange);
      document.removeEventListener('wheel', onWheel);
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('mouseup', onMouseUp);
      document.removeEventListener('contextmenu', onContextMenu);
    };
  }, [gl]);

  useFrame(() => {
    const store = useGameStore.getState();
    const playerPos = store.playerPos;
    _targetPos.set(playerPos[0], playerPos[1], playerPos[2]);

    const pitch = pitchRef.current;
    const angle = angleRef.current;

    // 삼각함수 캐시 업데이트
    updateTrigCache(angle);

    // 1인칭 모드 또는 토글 조준 시 1인칭 카메라 사용
    const useFpsCamera = store.viewMode === 'firstPerson' || store.isToggleAiming;
    // 3인칭에서 토글 조준 시 별도 처리
    const isTpsToggleAim = store.viewMode === 'thirdPerson' && store.isToggleAiming;

    if (store.gameMode === 'gunGame' && useFpsCamera) {
      // 자세별 목표 눈 높이
      let targetEyeHeight = FPS_EYE_HEIGHT_STANDING;
      const posture = store.posture;
      if (posture === 'sitting') {
        targetEyeHeight = FPS_EYE_HEIGHT_SITTING;
      } else if (posture === 'crawling') {
        targetEyeHeight = FPS_EYE_HEIGHT_CRAWLING;
      }

      // 눈 높이 부드럽게 전환 (lerp)
      currentEyeHeight.current += (targetEyeHeight - currentEyeHeight.current) * 0.08;

      const eyeHeight = currentEyeHeight.current;

      // 3인칭 토글 조준 vs 1인칭: 다른 오프셋 사용
      const offsetBack = isTpsToggleAim ? TPS_TOGGLE_AIM_OFFSET_BACK : 0.4;
      const offsetUp = isTpsToggleAim ? TPS_TOGGLE_AIM_OFFSET_UP : 0.5;
      const offsetRight = isTpsToggleAim ? TPS_TOGGLE_AIM_OFFSET_RIGHT : 0;

      // 카메라 위치: 플레이어 눈 위치 + 오프셋 (캐시된 삼각함수 사용)
      _targetCamPos.set(
        _targetPos.x - _sinAngle * offsetBack + _sinAngleRight * offsetRight,
        _targetPos.y + eyeHeight + offsetUp,
        _targetPos.z - _cosAngle * offsetBack + _cosAngleRight * offsetRight
      );

      // 바라보는 방향 계산
      const cosPitch = Math.cos(pitch);
      const sinPitch = Math.sin(pitch);
      const lookDistance = 10;
      _headPos.set(
        _targetPos.x - _sinAngle * cosPitch * lookDistance,
        _targetPos.y + eyeHeight - sinPitch * lookDistance,
        _targetPos.z - _cosAngle * cosPitch * lookDistance
      );

      // 3인칭 토글 조준 시 바라보는 지점 오프셋 적용
      if (isTpsToggleAim) {
        _headPos.x += _sinAngleRight * TPS_TOGGLE_AIM_LOOK_RIGHT;
        _headPos.z += _cosAngleRight * TPS_TOGGLE_AIM_LOOK_RIGHT;
        _headPos.y += TPS_TOGGLE_AIM_LOOK_UP;
      }

      // 1인칭은 lerp 없이 즉시 따라감
      camera.position.copy(_targetCamPos);
      camera.lookAt(_headPos);
      return;
    }

    // 3인칭 모드
    // 총게임 모드에서 우클릭 시 카메라 거리 변경
    let distance = distanceRef.current;
    if (store.gameMode === 'gunGame' && isAiming.current) {
      distance = AIM_DISTANCE;
    }

    // 조준 시 자세별 카메라 높이 계산
    let cameraHeight = 2;
    if (store.gameMode === 'gunGame' && isAiming.current) {
      const posture = store.posture;
      if (posture === 'sitting') {
        cameraHeight = AIM_HEIGHT_SITTING;
      } else if (posture === 'crawling') {
        cameraHeight = AIM_HEIGHT_CRAWLING;
      } else {
        cameraHeight = AIM_HEIGHT_STANDING;
      }
    }

    // 구면 좌표계로 카메라 위치 계산 (캐시된 삼각함수 사용)
    const cosPitch = Math.cos(pitch);
    const sinPitch = Math.sin(pitch);
    _offset.set(
      _sinAngle * cosPitch * distance,
      sinPitch * distance + cameraHeight,
      _cosAngle * cosPitch * distance
    );

    _targetCamPos.copy(_targetPos).add(_offset);

    if (!initialized.current) {
      initialized.current = true;
      currentCamPos.current.copy(_targetCamPos);
      currentLookPos.current.copy(_headPos);
    }

    currentCamPos.current.lerp(_targetCamPos, CAMERA_LERP);
    camera.position.copy(currentCamPos.current);

    _headPos.copy(_targetPos).add(HEAD_OFFSET);

    // 총게임 모드: 카메라가 바라보는 지점을 오른쪽 위로 이동 (캐릭터가 왼쪽 아래에 위치)
    if (store.gameMode === 'gunGame') {
      // 조준 시 자세별 바라보는 높이도 적용
      if (isAiming.current) {
        const posture = store.posture;
        if (posture === 'sitting') {
          _headPos.y = _targetPos.y + AIM_HEIGHT_SITTING;
        } else if (posture === 'crawling') {
          _headPos.y = _targetPos.y + AIM_HEIGHT_CRAWLING;
        } else {
          _headPos.y = _targetPos.y + AIM_HEIGHT_STANDING;
        }
      }

      // 조준 여부에 따라 다른 오프셋 사용
      const lookOffsetRight = isAiming.current ? AIM_LOOK_OFFSET_RIGHT : TPS_LOOK_OFFSET_RIGHT;
      const lookOffsetUp = isAiming.current ? AIM_LOOK_OFFSET_UP : TPS_LOOK_OFFSET_UP;

      // 오른쪽 방향 계산 (캐시된 삼각함수 사용)
      _headPos.x += _sinAngleRight * lookOffsetRight;
      _headPos.z += _cosAngleRight * lookOffsetRight;
      _headPos.y += lookOffsetUp;
    }

    // 바라보는 위치도 부드럽게 전환
    currentLookPos.current.lerp(_headPos, CAMERA_LERP);
    camera.lookAt(currentLookPos.current);
  });

  return null;
}
