import { useRef, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore } from '../store/gameStore';

// 카메라 설정
const HEAD_OFFSET = new THREE.Vector3(0, 2, 0);
const MOUSE_SENSITIVITY = 0.002;
const CAMERA_LERP = 0.1;
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

    canvas.addEventListener('click', onClick);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('pointerlockchange', onPointerLockChange);
    document.addEventListener('wheel', onWheel);

    return () => {
      canvas.removeEventListener('click', onClick);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('pointerlockchange', onPointerLockChange);
      document.removeEventListener('wheel', onWheel);
    };
  }, [gl]);

  useFrame(() => {
    const store = useGameStore.getState();
    const playerPos = store.playerPos;
    _targetPos.set(playerPos[0], playerPos[1], playerPos[2]);

    // 카메라 오프셋 계산
    const distance = distanceRef.current;
    const pitch = pitchRef.current;
    const angle = angleRef.current;

    // 구면 좌표계로 카메라 위치 계산
    _offset.set(
      Math.sin(angle) * Math.cos(pitch) * distance,
      Math.sin(pitch) * distance + 2,
      Math.cos(angle) * Math.cos(pitch) * distance
    );

    _targetCamPos.copy(_targetPos).add(_offset);

    if (!initialized.current) {
      initialized.current = true;
      currentCamPos.current.copy(_targetCamPos);
    }

    currentCamPos.current.lerp(_targetCamPos, CAMERA_LERP);
    camera.position.copy(currentCamPos.current);

    _headPos.copy(_targetPos).add(HEAD_OFFSET);
    camera.lookAt(_headPos);
  });

  return null;
}
