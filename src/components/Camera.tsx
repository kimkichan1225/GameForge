import { useRef, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore } from '../store/gameStore';

// 카메라 설정
const HEAD_OFFSET = new THREE.Vector3(0, 2, 0);
const MOUSE_SENSITIVITY = 0.002;

// 총게임 모드 카메라 오프셋 (캐릭터를 왼쪽 아래로 배치)
const TPS_LOOK_OFFSET_RIGHT = -1.5;  // 왼쪽으로
const TPS_LOOK_OFFSET_UP = 0.8;     // 아래로
const CAMERA_LERP = 0.1;
const AIM_DISTANCE = 3;  // 우클릭(조준) 시 카메라 거리

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
          store.setLookDirection(angle);
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

    // 1인칭 모드
    if (store.gameMode === 'gunGame' && store.viewMode === 'firstPerson') {
      // 자세별 눈 높이 계산
      let eyeHeight = FPS_EYE_HEIGHT_STANDING;
      const posture = store.posture;
      if (posture === 'sitting') {
        eyeHeight = FPS_EYE_HEIGHT_SITTING;
      } else if (posture === 'crawling') {
        eyeHeight = FPS_EYE_HEIGHT_CRAWLING;
      }

      // 카메라 위치: 플레이어 눈 위치
      _targetCamPos.set(
        _targetPos.x - Math.sin(angle) * 0.4,
        _targetPos.y + eyeHeight + 0.4,
        _targetPos.z - Math.cos(angle) * 0.4
      );

      // 바라보는 방향 계산
      const lookDistance = 10;
      _headPos.set(
        _targetPos.x - Math.sin(angle) * Math.cos(pitch) * lookDistance,
        _targetPos.y + eyeHeight - Math.sin(pitch) * lookDistance,
        _targetPos.z - Math.cos(angle) * Math.cos(pitch) * lookDistance
      );

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

    // 구면 좌표계로 카메라 위치 계산
    _offset.set(
      Math.sin(angle) * Math.cos(pitch) * distance,
      Math.sin(pitch) * distance + cameraHeight,
      Math.cos(angle) * Math.cos(pitch) * distance
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

      // 오른쪽 방향 계산 (카메라 기준)
      const rightX = Math.sin(angle - Math.PI / 2) * TPS_LOOK_OFFSET_RIGHT;
      const rightZ = Math.cos(angle - Math.PI / 2) * TPS_LOOK_OFFSET_RIGHT;
      _headPos.x += rightX;
      _headPos.z += rightZ;
      _headPos.y += TPS_LOOK_OFFSET_UP;
    }

    // 바라보는 위치도 부드럽게 전환
    currentLookPos.current.lerp(_headPos, CAMERA_LERP);
    camera.lookAt(currentLookPos.current);
  });

  return null;
}
