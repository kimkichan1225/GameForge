import { useRef, useEffect, useState, useMemo, useCallback, memo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useGLTF, useAnimations, Grid } from '@react-three/drei';
import * as THREE from 'three';
import { useInput } from '../../hooks/useInput';
import { useGameStore } from '../../stores/gameStore';
import { useMultiplayerGameStore } from '../../stores/multiplayerGameStore';
import { useRoomStore } from '../../stores/roomStore';
import { socketManager } from '../../lib/socket';
import { RemotePlayer } from './RemotePlayer';
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
} from '../../lib/physics';
import type { Posture } from '../../stores/gameStore';
import type { MapObject, MapMarker, MapData } from '../../stores/editorStore';

// Constants
const WALK_SPEED = 4;
const RUN_SPEED = 8;
const SIT_SPEED = 2;
const CRAWL_SPEED = 1;
const JUMP_POWER = 8;
const DASH_SPEED = 12;
const DASH_DURATION = 0.5;
const DASH_COOLDOWN = 1.0;
const POSITION_SEND_RATE = 50; // Send position every 50ms
const FINISH_RADIUS = 1.5;  // 피니시 마커 도달 판정 반경
const CHECKPOINT_RADIUS = 2.0;  // 체크포인트 통과 판정 반경
const KILLZONE_RADIUS = 2.0;  // 킬존 마커 XZ 판정 반경
const KILLZONE_HEIGHT = 0.5;  // 킬존 마커 Y 판정 높이 (위아래 각각)
const FALL_THRESHOLD = -10;  // 이 Y좌표 아래로 떨어지면 낙사
const DEAD_DURATION = 2.5;  // 사망 애니메이션 지속 시간

const GROUND_ROTATION: [number, number, number] = [-Math.PI / 2, 0, 0];
const GROUND_POSITION: [number, number, number] = [0, 0, 0];
const GRID_POSITION: [number, number, number] = [0, 0.01, 0];
const HEAD_OFFSET = new THREE.Vector3(0, 1.5, 0);

const _move = new THREE.Vector3();
const _dashDir = new THREE.Vector3();
const _yAxis = new THREE.Vector3(0, 1, 0);
const _targetQuat = new THREE.Quaternion();

// Physics context type
interface PhysicsContext {
  world: RAPIER.World;
  playerBody: RAPIER.RigidBody;
  playerColliderRef: React.MutableRefObject<RAPIER.Collider>;
}

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
};

// 색상을 적용할 material 이름들
const COLOR_MATERIALS = ['Main.002', 'Grey.002', 'Helmet.002'];

// Local player component
const LocalPlayer = memo(function LocalPlayer({
  startPosition,
  physics,
  finishPosition,
  checkpoints,
  killzones,
  color,
}: {
  startPosition: [number, number, number];
  physics: PhysicsContext;
  finishPosition: [number, number, number] | null;
  checkpoints: MapMarker[];
  killzones: MapMarker[];
  color?: string;
}) {
  const group = useRef<THREE.Group>(null!);
  const { scene, animations } = useGLTF('/Runtest.glb');
  const { actions, names } = useAnimations(animations, scene);

  const animMapRef = useRef<Record<string, string>>({});
  const grounded = useRef(true);
  const jumping = useRef(false);
  const dashing = useRef(false);
  const dashTimer = useRef(0);
  const dashCooldown = useRef(0);
  const currentAnim = useRef('');
  const currentPosture = useRef<Posture>('standing');
  const prev = useRef({ space: false, c: false, z: false, v: false });
  const lastPositionSent = useRef(0);
  const dying = useRef(false);
  const dyingTimer = useRef(0);
  const passedCheckpoints = useRef<Set<string>>(new Set());
  const initializedPosition = useRef(false);
  const prevGameStatus = useRef<string>('');

  const input = useInput();
  const sendPosition = useMultiplayerGameStore((state) => state.sendPosition);
  const reachCheckpoint = useMultiplayerGameStore((state) => state.reachCheckpoint);
  const finish = useMultiplayerGameStore((state) => state.finish);
  const notifyDeath = useMultiplayerGameStore((state) => state.notifyDeath);
  const clearPendingTeleport = useMultiplayerGameStore((state) => state.clearPendingTeleport);

  // 색상 적용
  useEffect(() => {
    if (!color || !scene) return;

    const hexColor = COLOR_MAP[color] || '#FFFFFF';
    const threeColor = new THREE.Color(hexColor);

    scene.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material) {
        const mat = child.material as THREE.MeshStandardMaterial;
        if (COLOR_MATERIALS.includes(mat.name)) {
          mat.color = threeColor;
        }
      }
    });
  }, [color, scene]);

  // Build animation map
  useEffect(() => {
    const map: Record<string, string> = {};
    const targets = ['Idle', 'Walk', 'Run', 'Jump', 'SitPose', 'SitWalk', 'CrawlPose', 'Crawl', 'Roll', 'Dead'];

    for (const target of targets) {
      const found = names.find((n) => {
        const parts = n.split('|');
        return parts[parts.length - 1].toLowerCase() === target.toLowerCase();
      }) || names.find((n) => n.toLowerCase().includes(target.toLowerCase()));
      if (found) map[target] = found;
    }

    animMapRef.current = map;
    if (Object.keys(map).length > 0) {
      playAnim('Idle');
    }
  }, [names]);

  const playAnim = useCallback(
    (name: string) => {
      const animMap = animMapRef.current;
      if (currentAnim.current === name || !animMap[name]) return;

      const clipName = animMap[name];
      const action = actions[clipName];
      if (!action) return;

      const prevClip = animMap[currentAnim.current];
      if (prevClip) actions[prevClip]?.fadeOut(0.2);

      action.reset().fadeIn(0.2).play();

      // One-shot animations
      if (name === 'Jump' || name === 'Roll' || name === 'Dead') {
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
        if (name === 'Roll') action.timeScale = 2.3;
      } else {
        action.setLoop(THREE.LoopRepeat, Infinity);
      }

      currentAnim.current = name;
    },
    [actions]
  );

  const getAnim = useCallback((moving: boolean, running: boolean, posture: string): string => {
    if (posture === 'sitting') return moving ? 'SitWalk' : 'SitPose';
    if (posture === 'crawling') return moving ? 'Crawl' : 'CrawlPose';
    if (moving) return running ? 'Run' : 'Walk';
    return 'Idle';
  }, []);

  useFrame((_, dt) => {
    const gameStatus = useMultiplayerGameStore.getState().status;
    const localFinished = useMultiplayerGameStore.getState().localFinished;
    const pendingTeleport = useMultiplayerGameStore.getState().pendingTeleport;

    // 물리 객체 유효성 검사
    if (!physics?.playerBody || !physics?.playerColliderRef?.current) {
      prevGameStatus.current = gameStatus;
      return;
    }

    // 게임 시작 시 (countdown → playing 전환) 플레이어 위치 초기화
    if (gameStatus === 'playing' && prevGameStatus.current !== 'playing' && !initializedPosition.current) {
      const store = useGameStore.getState();
      const centerY = COLLIDER_CONFIG[store.posture].centerY;
      try {
        physics.playerBody.setTranslation(
          { x: startPosition[0], y: startPosition[1] + centerY + 0.5, z: startPosition[2] },
          true
        );
        physics.playerBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
      } catch {
        // 물리 객체가 이미 해제됨
        prevGameStatus.current = gameStatus;
        return;
      }
      if (group.current) {
        group.current.position.set(startPosition[0], startPosition[1], startPosition[2]);
      }
      store.setPlayerPos([startPosition[0], startPosition[1], startPosition[2]]);
      initializedPosition.current = true;
    }
    prevGameStatus.current = gameStatus;

    if (!group.current || gameStatus !== 'playing') return;

    const keys = input.current;
    const store = useGameStore.getState();
    const { posture, cameraAngle } = store;
    const { world, playerBody, playerColliderRef } = physics;

    if (!playerColliderRef.current) return;

    let vel: { x: number; y: number; z: number };
    try {
      vel = playerBody.linvel();
    } catch {
      return;
    }

    const centerY = COLLIDER_CONFIG[posture].centerY;

    // 릴레이 레이스 텔레포트 처리
    if (pendingTeleport) {
      playerBody.setTranslation(
        { x: pendingTeleport[0], y: pendingTeleport[1] + centerY + 0.5, z: pendingTeleport[2] },
        true
      );
      playerBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
      group.current.position.set(pendingTeleport[0], pendingTeleport[1], pendingTeleport[2]);
      store.setPlayerPos([pendingTeleport[0], pendingTeleport[1], pendingTeleport[2]]);
      clearPendingTeleport();
      return;
    }

    // 사망 애니메이션 처리 중
    if (dying.current) {
      dyingTimer.current -= dt;
      // 수평 이동 멈추고 중력만 적용
      playerBody.setLinvel({ x: 0, y: vel.y, z: 0 }, true);
      world.step();

      const pos = playerBody.translation();
      group.current.position.set(pos.x, pos.y - centerY, pos.z);
      store.setPlayerPos([pos.x, pos.y - centerY, pos.z]);

      // 사망 중에도 위치 및 애니메이션 전송
      const now = Date.now();
      if (now - lastPositionSent.current >= POSITION_SEND_RATE) {
        lastPositionSent.current = now;
        sendPosition(
          { x: pos.x, y: pos.y - centerY, z: pos.z },
          { x: 0, y: vel.y, z: 0 },
          'Dead'
        );
      }

      if (dyingTimer.current <= 0) {
        // 사망 애니메이션 끝 - 리스폰
        dying.current = false;
        const lastCheckpointPos = useMultiplayerGameStore.getState().lastCheckpointPos;
        const respawnPos = lastCheckpointPos || startPosition;
        playerBody.setTranslation(
          { x: respawnPos[0], y: respawnPos[1] + centerY + 1, z: respawnPos[2] },
          true
        );
        playerBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
        group.current.position.set(respawnPos[0], respawnPos[1], respawnPos[2]);
        store.setPlayerPos([respawnPos[0], respawnPos[1], respawnPos[2]]);
        playAnim('Idle');
      }
      return; // 사망 중에는 다른 처리 스킵
    }

    // 완주한 플레이어는 조작 불가 (위치 유지, 시네마틱 카메라용 위치만 업데이트)
    if (localFinished) {
      playerBody.setLinvel({ x: 0, y: vel.y, z: 0 }, true);
      world.step();
      const pos = playerBody.translation();
      group.current.position.set(pos.x, pos.y - centerY, pos.z);
      store.setPlayerPos([pos.x, pos.y - centerY, pos.z]);
      if (grounded.current && currentAnim.current !== 'Idle') {
        playAnim('Idle');
      }
      return;
    }

    // Update cooldowns
    if (dashCooldown.current > 0) dashCooldown.current -= dt;

    // Update collider on posture change
    if (posture !== currentPosture.current) {
      const newCollider = updatePlayerCollider(
        world,
        playerBody,
        playerColliderRef.current,
        currentPosture.current,
        posture
      );
      playerColliderRef.current = newCollider;
      currentPosture.current = posture;
    }

    const isGrounded = checkGrounded(world, playerBody, playerColliderRef.current, posture);
    grounded.current = isGrounded;

    // Posture toggle
    if (keys.c && !prev.current.c && isGrounded && !dashing.current) {
      store.setPosture(posture === 'sitting' ? 'standing' : 'sitting');
    }
    if (keys.z && !prev.current.z && isGrounded && !dashing.current) {
      store.setPosture(posture === 'crawling' ? 'standing' : 'crawling');
    }

    // Jump
    let shouldJump = false;
    if (keys.space && !prev.current.space && isGrounded && !jumping.current && posture === 'standing' && !dashing.current) {
      shouldJump = true;
      jumping.current = true;
      playAnim('Jump');
    }

    // Land detection
    if (jumping.current && isGrounded && vel.y <= 0 && !shouldJump) {
      jumping.current = false;
      if (!dashing.current) {
        const moving = keys.forward || keys.backward || keys.left || keys.right;
        playAnim(getAnim(moving, keys.shift && posture === 'standing', posture));
      }
    }

    // Dash/Roll
    if (keys.v && !prev.current.v && isGrounded && posture === 'standing' && !dashing.current && dashCooldown.current <= 0) {
      dashing.current = true;
      dashTimer.current = DASH_DURATION;
      dashCooldown.current = DASH_COOLDOWN;

      _dashDir.set(0, 0, 0);
      if (keys.forward) _dashDir.z -= 1;
      if (keys.backward) _dashDir.z += 1;
      if (keys.left) _dashDir.x -= 1;
      if (keys.right) _dashDir.x += 1;

      if (_dashDir.lengthSq() === 0) {
        scene.getWorldDirection(_dashDir);
        _dashDir.y = 0;
      }
      _dashDir.normalize().applyAxisAngle(_yAxis, cameraAngle);
      playAnim('Roll');
    }

    prev.current = { space: keys.space, c: keys.c, z: keys.z, v: keys.v };

    // Movement
    _move.set(0, 0, 0);

    if (dashing.current) {
      dashTimer.current -= dt;
      _move.copy(_dashDir);
      if (dashTimer.current <= 0) dashing.current = false;
    } else {
      if (keys.forward) _move.z -= 1;
      if (keys.backward) _move.z += 1;
      if (keys.left) _move.x -= 1;
      if (keys.right) _move.x += 1;

      if (_move.lengthSq() > 0) {
        _move.normalize().applyAxisAngle(_yAxis, cameraAngle);
        const angle = Math.atan2(_move.x, _move.z);
        _targetQuat.setFromAxisAngle(_yAxis, angle);
        const rotLerpFactor = 1 - Math.exp(-10 * dt);
        scene.quaternion.slerp(_targetQuat, rotLerpFactor);
      }
    }

    // Speed
    let speed = WALK_SPEED;
    if (dashing.current) speed = DASH_SPEED;
    else if (posture === 'sitting') speed = SIT_SPEED;
    else if (posture === 'crawling') speed = CRAWL_SPEED;
    else if (keys.shift && posture === 'standing') speed = RUN_SPEED;

    // Apply physics
    playerBody.setLinvel(
      { x: _move.x * speed, y: shouldJump ? JUMP_POWER : vel.y, z: _move.z * speed },
      true
    );
    world.step();

    // Sync position
    const pos = playerBody.translation();
    group.current.position.set(pos.x, pos.y - centerY, pos.z);
    const playerFootY = pos.y - centerY;

    // Animation
    if (isGrounded && !jumping.current && !dashing.current) {
      playAnim(getAnim(_move.lengthSq() > 0, keys.shift && posture === 'standing', posture));
    }

    // Update store
    store.setPlayerPos([pos.x, playerFootY, pos.z]);

    // 체크포인트 통과 체크
    for (const cp of checkpoints) {
      if (passedCheckpoints.current.has(cp.id)) continue;
      const dx = pos.x - cp.position[0];
      const dy = playerFootY - cp.position[1];
      const dz = pos.z - cp.position[2];
      const distSq = dx * dx + dy * dy + dz * dz;
      if (distSq < CHECKPOINT_RADIUS * CHECKPOINT_RADIUS) {
        passedCheckpoints.current.add(cp.id);

        // 모든 체크포인트를 서버에 알림 (서버에서 player.checkpoint 증가 → 모든 클라이언트에 동기화)
        // 릴레이 체크포인트(relay-checkpoint-*)는 텔레포트 트리거, 나머지는 카운트만 증가
        const isRelayCheckpoint = cp.id.startsWith('relay-checkpoint-');
        // relay-checkpoint-N: N번째 세그먼트의 끝 → 서버에서 N+1 세그먼트로 텔레포트
        const checkpointIndex = isRelayCheckpoint
          ? parseInt(cp.id.replace('relay-checkpoint-', ''), 10)
          : 0;  // 일반 체크포인트는 인덱스 무관 (카운트 증가만)
        reachCheckpoint(checkpointIndex, [cp.position[0], cp.position[1], cp.position[2]], isRelayCheckpoint);
      }
    }

    // 피니시 도달 체크
    if (finishPosition) {
      const dx = pos.x - finishPosition[0];
      const dy = playerFootY - finishPosition[1];
      const dz = pos.z - finishPosition[2];
      const distSq = dx * dx + dy * dy + dz * dz;
      if (distSq < FINISH_RADIUS * FINISH_RADIUS) {
        finish();
      }
    }

    // 킬존 체크 (원판 형태: XZ 반경 + Y 높이 제한)
    let hitKillzone = false;
    for (const kz of killzones) {
      const dx = pos.x - kz.position[0];
      const dy = playerFootY - kz.position[1];
      const dz = pos.z - kz.position[2];
      const distXZ = dx * dx + dz * dz;  // XZ 평면 거리
      const inRadius = distXZ < KILLZONE_RADIUS * KILLZONE_RADIUS;
      const inHeight = Math.abs(dy) < KILLZONE_HEIGHT;
      if (inRadius && inHeight) {
        hitKillzone = true;
        break;
      }
    }

    // 킬존 진입 시 사망 애니메이션 시작
    if (hitKillzone) {
      dying.current = true;
      dyingTimer.current = DEAD_DURATION;
      notifyDeath();
      playAnim('Dead');
      return;
    }

    // 낙사 체크 (Y < -10) - 즉시 리스폰
    if (playerFootY < FALL_THRESHOLD) {
      const lastCheckpointPos = useMultiplayerGameStore.getState().lastCheckpointPos;
      const respawnPos = lastCheckpointPos || startPosition;
      playerBody.setTranslation(
        { x: respawnPos[0], y: respawnPos[1] + centerY + 1, z: respawnPos[2] },
        true
      );
      playerBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
      notifyDeath();
    }

    // Send position to server at limited rate
    const now = Date.now();
    if (now - lastPositionSent.current >= POSITION_SEND_RATE) {
      lastPositionSent.current = now;
      sendPosition(
        { x: pos.x, y: playerFootY, z: pos.z },
        { x: _move.x * speed, y: vel.y, z: _move.z * speed },
        currentAnim.current
      );
    }
  });

  return (
    <group ref={group} position={startPosition}>
      <primitive object={scene} />
    </group>
  );
});

// Camera component
const FollowCamera = memo(function FollowCamera({ startPosition }: { startPosition: [number, number, number] }) {
  const { camera, gl } = useThree();

  const angleRef = useRef(0);
  const pitchRef = useRef(0.3);
  const distanceRef = useRef(8);
  const currentCamPos = useRef(new THREE.Vector3());
  const initialized = useRef(false);
  const isLocked = useRef(false);
  const skipNextMove = useRef(false);
  const cinematicAngle = useRef(0); // 시네마틱 카메라용 각도
  const prevGameStatus = useRef<string>('');
  const playingFrameCount = useRef(0); // playing 상태 진입 후 프레임 수

  const _targetPos = useRef(new THREE.Vector3());
  const _offset = useRef(new THREE.Vector3());
  const _targetCamPos = useRef(new THREE.Vector3());
  const _headPos = useRef(new THREE.Vector3());

  // 게임 시작 시 자동 포인터락
  useEffect(() => {
    const canvas = gl.domElement;
    // 약간의 지연 후 포인터락 요청
    const timer = setTimeout(async () => {
      try {
        await canvas.requestPointerLock();
      } catch {
        // 포인터 락 요청이 취소된 경우 무시
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [gl]);

  useEffect(() => {
    const canvas = gl.domElement;

    const onClick = async () => {
      try {
        await canvas.requestPointerLock();
      } catch (e) {
        // 무시
      }
    };

    const onMouseMove = (e: MouseEvent) => {
      // 카운트다운 중에는 마우스 입력 무시
      if (useMultiplayerGameStore.getState().status !== 'playing') return;
      if (!isLocked.current) return;
      if (skipNextMove.current) {
        skipNextMove.current = false;
        return;
      }

      const maxMove = 50;
      const moveX = Math.max(-maxMove, Math.min(maxMove, e.movementX));
      const moveY = Math.max(-maxMove, Math.min(maxMove, e.movementY));

      let angle = angleRef.current - moveX * 0.002;
      angle = angle % (Math.PI * 2);
      if (angle < 0) angle += Math.PI * 2;
      angleRef.current = angle;

      let pitch = pitchRef.current + moveY * 0.002;
      pitchRef.current = Math.max(-0.5, Math.min(1.2, pitch));

      const store = useGameStore.getState();
      store.setCameraAngle(angle);
      store.setCameraPitch(pitchRef.current);
    };

    const onWheel = (e: WheelEvent) => {
      // 카운트다운 중에는 휠 입력 무시
      if (useMultiplayerGameStore.getState().status !== 'playing') return;
      distanceRef.current = Math.max(3, Math.min(20, distanceRef.current + e.deltaY * 0.01));
      useGameStore.getState().setCameraDistance(distanceRef.current);
    };

    const onPointerLockChange = () => {
      const locked = document.pointerLockElement === canvas;
      if (locked && !isLocked.current) skipNextMove.current = true;
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

  useFrame((_, delta) => {
    const gameStatus = useMultiplayerGameStore.getState().status;
    const localFinished = useMultiplayerGameStore.getState().localFinished;

    // 상태 전환 감지 및 프레임 카운트
    if (gameStatus === 'playing' && prevGameStatus.current !== 'playing') {
      playingFrameCount.current = 0;
    }
    if (gameStatus === 'playing') {
      playingFrameCount.current++;
    } else {
      playingFrameCount.current = 0;
    }
    prevGameStatus.current = gameStatus;

    // 카운트다운 중이거나 playing 전환 직후(10프레임 이내)는 startPosition 사용
    if (gameStatus === 'countdown' || (gameStatus === 'playing' && playingFrameCount.current < 10)) {
      _targetPos.current.set(startPosition[0], startPosition[1], startPosition[2]);
    } else {
      const playerPos = useGameStore.getState().playerPos;
      // playerPos가 (0,0,0)이고 startPosition이 다른 곳이면 startPosition 사용
      const distFromStart = Math.sqrt(
        (playerPos[0] - startPosition[0]) ** 2 +
        (playerPos[2] - startPosition[2]) ** 2
      );
      if (playerPos[0] === 0 && playerPos[1] === 0 && playerPos[2] === 0 && distFromStart > 5) {
        _targetPos.current.set(startPosition[0], startPosition[1], startPosition[2]);
      } else {
        _targetPos.current.set(playerPos[0], playerPos[1], playerPos[2]);
      }
    }

    // 시네마틱 카메라: 카운트다운 중이거나 완주한 경우
    if (gameStatus === 'countdown' || localFinished) {
      // 시네마틱 카메라: 캐릭터 주위를 천천히 회전
      cinematicAngle.current += delta * 0.5;
      const cinematicDistance = 10;
      const cinematicPitch = 0.4;

      _offset.current.set(
        Math.sin(cinematicAngle.current) * cinematicDistance,
        Math.sin(cinematicPitch) * cinematicDistance + 3,
        Math.cos(cinematicAngle.current) * cinematicDistance
      );

      _targetCamPos.current.copy(_targetPos.current).add(_offset.current);
      currentCamPos.current.lerp(_targetCamPos.current, 0.05);
      camera.position.copy(currentCamPos.current);

      _headPos.current.copy(_targetPos.current).add(HEAD_OFFSET);
      camera.lookAt(_headPos.current);
    } else {
      // 일반 3인칭 카메라
      const { current: distance } = distanceRef;
      const { current: pitch } = pitchRef;
      const { current: angle } = angleRef;

      _offset.current.set(
        Math.sin(angle) * Math.cos(pitch) * distance,
        Math.sin(pitch) * distance + 2,
        Math.cos(angle) * Math.cos(pitch) * distance
      );

      _targetCamPos.current.copy(_targetPos.current).add(_offset.current);

      if (!initialized.current) {
        initialized.current = true;
        currentCamPos.current.copy(_targetCamPos.current);
      }

      currentCamPos.current.lerp(_targetCamPos.current, 0.1);
      camera.position.copy(currentCamPos.current);

      _headPos.current.copy(_targetPos.current).add(HEAD_OFFSET);
      camera.lookAt(_headPos.current);
    }
  });

  return null;
});

// Ground component
const Ground = memo(function Ground() {
  return (
    <mesh rotation={GROUND_ROTATION} position={GROUND_POSITION}>
      <planeGeometry args={[200, 200]} />
      <meshStandardMaterial color="#3a5a40" side={THREE.DoubleSide} />
    </mesh>
  );
});

// Cached geometries for map objects (with cleanup support)
let cachedBoxGeometry: THREE.BoxGeometry | null = null;
let cachedPlaneObjGeometry: THREE.BoxGeometry | null = null;
let cachedCylinderGeometry: THREE.CylinderGeometry | null = null;
let cachedSphereGeometry: THREE.SphereGeometry | null = null;
let cachedWedgeGeometry: THREE.BufferGeometry | null = null;
const cachedMaterials: Map<string, THREE.MeshStandardMaterial> = new Map();

// 캐시 정리 함수 (컴포넌트 언마운트 시 호출)
function cleanupGeometryCache() {
  cachedBoxGeometry?.dispose();
  cachedBoxGeometry = null;
  cachedPlaneObjGeometry?.dispose();
  cachedPlaneObjGeometry = null;
  cachedCylinderGeometry?.dispose();
  cachedCylinderGeometry = null;
  cachedSphereGeometry?.dispose();
  cachedSphereGeometry = null;
  cachedWedgeGeometry?.dispose();
  cachedWedgeGeometry = null;
  cachedMaterials.forEach(mat => mat.dispose());
  cachedMaterials.clear();
}

function getBoxGeometry() {
  if (!cachedBoxGeometry) cachedBoxGeometry = new THREE.BoxGeometry(1, 1, 1);
  return cachedBoxGeometry;
}
function getPlaneObjGeometry() {
  if (!cachedPlaneObjGeometry) cachedPlaneObjGeometry = new THREE.BoxGeometry(1, 0.1, 1);
  return cachedPlaneObjGeometry;
}
function getCylinderGeometry() {
  if (!cachedCylinderGeometry) cachedCylinderGeometry = new THREE.CylinderGeometry(0.5, 0.5, 1, 16);
  return cachedCylinderGeometry;
}
function getSphereGeometry() {
  if (!cachedSphereGeometry) cachedSphereGeometry = new THREE.SphereGeometry(0.5, 16, 16);
  return cachedSphereGeometry;
}
function getWedgeGeometry(): THREE.BufferGeometry {
  if (cachedWedgeGeometry) return cachedWedgeGeometry;
  const geometry = new THREE.BufferGeometry();
  const posArray = new Float32Array([
    -0.5, 0, -0.5, 0.5, 0, -0.5, 0.5, 0, 0.5,
    -0.5, 0, -0.5, 0.5, 0, 0.5, -0.5, 0, 0.5,
    -0.5, 0, 0.5, 0.5, 0, 0.5, 0.5, 1, 0.5,
    -0.5, 0, 0.5, 0.5, 1, 0.5, -0.5, 1, 0.5,
    -0.5, 1, 0.5, 0.5, 1, 0.5, 0.5, 0, -0.5,
    -0.5, 1, 0.5, 0.5, 0, -0.5, -0.5, 0, -0.5,
    -0.5, 0, -0.5, -0.5, 0, 0.5, -0.5, 1, 0.5,
    0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 1, 0.5,
  ]);
  const normArray = new Float32Array([
    0, -1, 0, 0, -1, 0, 0, -1, 0,
    0, -1, 0, 0, -1, 0, 0, -1, 0,
    0, 0, 1, 0, 0, 1, 0, 0, 1,
    0, 0, 1, 0, 0, 1, 0, 0, 1,
    0, 0.707, -0.707, 0, 0.707, -0.707, 0, 0.707, -0.707,
    0, 0.707, -0.707, 0, 0.707, -0.707, 0, 0.707, -0.707,
    -1, 0, 0, -1, 0, 0, -1, 0, 0,
    1, 0, 0, 1, 0, 0, 1, 0, 0,
  ]);
  geometry.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normArray, 3));
  cachedWedgeGeometry = geometry;
  return geometry;
}
function getMaterial(color: string): THREE.MeshStandardMaterial {
  let mat = cachedMaterials.get(color);
  if (!mat) {
    mat = new THREE.MeshStandardMaterial({ color });
    cachedMaterials.set(color, mat);
  }
  return mat;
}

// Map object mesh
const MapObjectMesh = memo(function MapObjectMesh({ obj }: { obj: MapObject }) {
  const geometry = useMemo(() => {
    switch (obj.type) {
      case 'box': return getBoxGeometry();
      case 'plane': return getPlaneObjGeometry();
      case 'cylinder': return getCylinderGeometry();
      case 'sphere': return getSphereGeometry();
      case 'ramp': return getWedgeGeometry();
      default: return undefined;
    }
  }, [obj.type]);

  const material = useMemo(() => getMaterial(obj.color), [obj.color]);

  return (
    <mesh position={obj.position} rotation={obj.rotation} scale={obj.scale} geometry={geometry} material={material} />
  );
});

// Map objects component
const MapObjects = memo(function MapObjects({ objects }: { objects: MapObject[] }) {
  return <>{objects.map(obj => <MapObjectMesh key={obj.id} obj={obj} />)}</>;
});

// Marker colors
const MARKER_COLORS: Record<string, string> = {
  spawn: '#00ff00',
  checkpoint: '#ffff00',
  finish: '#ff0000',
  killzone: '#ff00ff',
};

// Marker mesh
const MarkerMesh = memo(function MarkerMesh({ marker }: { marker: MapMarker }) {
  const color = MARKER_COLORS[marker.type] || '#ffffff';
  const isKillzone = marker.type === 'killzone';

  return (
    <group position={marker.position} rotation={marker.rotation}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]}>
        <ringGeometry args={[isKillzone ? 1.8 : 1.2, isKillzone ? 2.0 : 1.5, 32]} />
        <meshBasicMaterial color={color} transparent opacity={0.5} side={THREE.DoubleSide} />
      </mesh>
      {!isKillzone && (
        <>
          <mesh position={[0, 1.5, 0]}>
            <cylinderGeometry args={[0.1, 0.1, 3, 8]} />
            <meshBasicMaterial color={color} transparent opacity={0.3} />
          </mesh>
          <mesh position={[0, 3.2, 0]}>
            <coneGeometry args={[0.3, 0.5, 4]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.5} />
          </mesh>
        </>
      )}
    </group>
  );
});

// Map markers component
const MapMarkers = memo(function MapMarkers({ markers }: { markers: MapMarker[] }) {
  return <>{markers.map(marker => <MarkerMesh key={marker.id} marker={marker} />)}</>;
});

// Remote players component
const RemotePlayers = memo(function RemotePlayers() {
  const players = useMultiplayerGameStore((state) => state.players);
  const myId = socketManager.getSocket()?.id;

  const otherPlayers = useMemo(() => {
    return players.filter((p) => p.id !== myId);
  }, [players, myId]);

  return (
    <>
      {otherPlayers.map((player) => (
        <RemotePlayer
          key={player.id}
          id={player.id}
          nickname={player.nickname}
          color={player.color}
          position={player.position}
          velocity={player.velocity}
          animation={player.animation}
          checkpoint={player.checkpoint}
          finished={player.finished}
        />
      ))}
    </>
  );
});

// 릴레이 레이스 영역 경계 벽
const RelayRegionBoundaries = memo(function RelayRegionBoundaries({
  segments,
}: {
  segments: Array<{
    playerId: string;
    order: number;
    spawnPosition: [number, number, number];
    region?: { startX: number; endX: number };
  }>;
}) {
  const boundaryMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#ff4444',
        transparent: true,
        opacity: 0.3,
        side: THREE.DoubleSide,
      }),
    []
  );

  const walls: React.ReactElement[] = [];
  const wallHeight = 20;
  const depth = 100; // Z축 범위: -50 ~ +50

  // 세그먼트를 order 순으로 정렬
  const sortedSegments = [...segments].sort((a, b) => a.order - b.order);

  for (let i = 0; i < sortedSegments.length; i++) {
    const seg = sortedSegments[i];

    // 실제 region 데이터 사용, 없으면 spawn 위치 기반으로 계산 (fallback)
    let startX: number;
    let endX: number;

    if (seg.region) {
      startX = seg.region.startX;
      endX = seg.region.endX;
    } else {
      // fallback: spawn 위치 기반 계산
      const spawnX = seg.spawnPosition[0];
      const regionWidth = 50;
      startX = Math.floor(spawnX / regionWidth) * regionWidth;
      endX = startX + regionWidth;
    }

    const regionWidth = endX - startX;
    const centerX = (startX + endX) / 2;

    // 각 영역의 4면 벽 (왼쪽, 오른쪽, 앞, 뒤)
    walls.push(
      // 왼쪽 벽
      <mesh key={`wall-left-${i}`} position={[startX, wallHeight / 2, 0]} material={boundaryMaterial}>
        <boxGeometry args={[0.2, wallHeight, depth]} />
      </mesh>,
      // 오른쪽 벽
      <mesh key={`wall-right-${i}`} position={[endX, wallHeight / 2, 0]} material={boundaryMaterial}>
        <boxGeometry args={[0.2, wallHeight, depth]} />
      </mesh>,
      // 앞 벽 (Z-)
      <mesh key={`wall-front-${i}`} position={[centerX, wallHeight / 2, -depth / 2]} material={boundaryMaterial}>
        <boxGeometry args={[regionWidth, wallHeight, 0.2]} />
      </mesh>,
      // 뒤 벽 (Z+)
      <mesh key={`wall-back-${i}`} position={[centerX, wallHeight / 2, depth / 2]} material={boundaryMaterial}>
        <boxGeometry args={[regionWidth, wallHeight, 0.2]} />
      </mesh>
    );
  }

  return <group>{walls}</group>;
});

// Scene content
const SceneContent = memo(function SceneContent({
  startPosition,
  physics,
  mapData,
  finishPosition,
  checkpoints,
  killzones,
  relaySegments,
  myColor,
}: {
  startPosition: [number, number, number];
  physics: PhysicsContext | null;
  mapData: MapData | null;
  finishPosition: [number, number, number] | null;
  checkpoints: MapMarker[];
  killzones: MapMarker[];
  relaySegments: Array<{
    playerId: string;
    order: number;
    spawnPosition: [number, number, number];
    region?: { startX: number; endX: number };
  }> | null;
  myColor?: string;
}) {
  if (!physics) return null;

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
      {mapData && <MapObjects objects={mapData.objects} />}
      {mapData && <MapMarkers markers={mapData.markers} />}
      {relaySegments && <RelayRegionBoundaries segments={relaySegments} />}
      <LocalPlayer
        startPosition={startPosition}
        physics={physics}
        finishPosition={finishPosition}
        checkpoints={checkpoints}
        killzones={killzones}
        color={myColor}
      />
      <RemotePlayers />
      <FollowCamera startPosition={startPosition} />
    </>
  );
});

// UI component
const MultiplayerUI = memo(function MultiplayerUI({
  onExit,
  onReturnToWaitingRoom,
  totalCheckpoints,
  finishPosition,
}: {
  onExit: () => void;
  onReturnToWaitingRoom: () => void;
  totalCheckpoints: number;
  finishPosition: [number, number, number] | null;
}) {
  const status = useMultiplayerGameStore((state) => state.status);
  const countdown = useMultiplayerGameStore((state) => state.countdown);
  const startTime = useMultiplayerGameStore((state) => state.startTime);
  const rankings = useMultiplayerGameStore((state) => state.rankings);
  const players = useMultiplayerGameStore((state) => state.players);
  const gracePeriod = useMultiplayerGameStore((state) => state.gracePeriod);
  const localFinished = useMultiplayerGameStore((state) => state.localFinished);
  const localCheckpoint = useMultiplayerGameStore((state) => state.localCheckpoint);

  const [showPauseMenu, setShowPauseMenu] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);

  const myId = socketManager.getSocket()?.id;

  // Refs for event listeners (avoid re-registration)
  const statusRef = useRef(status);
  const showPauseMenuRef = useRef(showPauseMenu);
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    showPauseMenuRef.current = showPauseMenu;
  }, [showPauseMenu]);

  // 포인터락 해제 시 일시정지 메뉴 표시
  useEffect(() => {
    const handlePointerLockChange = () => {
      const isLocked = document.pointerLockElement !== null;
      // 포인터락이 해제되었고 게임 중이면 메뉴 표시
      if (!isLocked && (statusRef.current === 'playing' || statusRef.current === 'countdown')) {
        setShowPauseMenu(true);
      }
    };

    document.addEventListener('pointerlockchange', handlePointerLockChange);
    return () => document.removeEventListener('pointerlockchange', handlePointerLockChange);
  }, []);

  // ESC 키 처리 - 메뉴가 열려있을 때 닫고 포인터락 재요청
  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      if (e.key === 'Escape' && showPauseMenuRef.current) {
        // 메뉴가 열려있으면 닫고 포인터락 재요청
        setShowPauseMenu(false);
        try {
          const canvas = document.querySelector('#game-canvas canvas') as HTMLCanvasElement;
          if (canvas) {
            await canvas.requestPointerLock();
          }
        } catch {
          // 무시
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // 게임 종료 시 포인터락 해제
  useEffect(() => {
    if (status === 'finished') {
      document.exitPointerLock();
      setShowPauseMenu(false);
    }
  }, [status]);

  // 실시간 타이머 업데이트
  useEffect(() => {
    // 기존 인터벌 정리
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }

    if (status !== 'playing' || !startTime || localFinished) {
      return;
    }

    timerIntervalRef.current = setInterval(() => {
      setElapsedTime(Date.now() - startTime);
    }, 10);

    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
    };
  }, [status, startTime, localFinished]);

  // 게임 시작 시 타이머 리셋
  useEffect(() => {
    if (status === 'countdown') {
      setElapsedTime(0);
    }
  }, [status]);

  const formatTime = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const milliseconds = Math.floor((ms % 1000) / 10);
    if (minutes > 0) {
      return `${minutes}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(2, '0')}`;
    }
    return `${seconds}.${milliseconds.toString().padStart(2, '0')}`;
  };

  // 피니시까지의 거리 계산 함수
  const getDistanceToFinish = useCallback((position: { x: number; y: number; z: number }) => {
    if (!finishPosition) return Infinity;
    const dx = position.x - finishPosition[0];
    const dy = position.y - finishPosition[1];
    const dz = position.z - finishPosition[2];
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }, [finishPosition]);

  // 플레이어 정렬 함수 (체크포인트 > 거리)
  const sortRacingPlayers = useCallback((a: typeof players[0], b: typeof players[0]) => {
    // 체크포인트가 많은 순
    if (b.checkpoint !== a.checkpoint) {
      return b.checkpoint - a.checkpoint;
    }
    // 체크포인트가 같으면 피니시에 가까운 순
    const distA = getDistanceToFinish(a.position);
    const distB = getDistanceToFinish(b.position);
    return distA - distB;
  }, [getDistanceToFinish]);

  // 현재 순위 계산 (체크포인트 기준 + 거리)
  const currentRank = useMemo(() => {
    if (!myId) return 1;

    // 완주한 플레이어들 (완주 시간순)
    const finishedPlayers = players.filter(p => p.finished).sort((a, b) => (a.finishTime || 0) - (b.finishTime || 0));

    // 아직 완주하지 않은 플레이어들 (체크포인트 많은 순 > 피니시 거리 가까운 순)
    const racingPlayers = players.filter(p => !p.finished).sort(sortRacingPlayers);

    const myPlayer = players.find(p => p.id === myId);
    if (!myPlayer) return 1;

    if (myPlayer.finished) {
      return finishedPlayers.findIndex(p => p.id === myId) + 1;
    }

    return finishedPlayers.length + racingPlayers.findIndex(p => p.id === myId) + 1;
  }, [players, myId, sortRacingPlayers]);

  const handleResume = async () => {
    setShowPauseMenu(false);
    // 캔버스에 포인터락 다시 요청
    try {
      const canvas = document.querySelector('#game-canvas canvas') as HTMLCanvasElement;
      if (canvas) {
        await canvas.requestPointerLock();
      }
    } catch {
      // 포인터락 요청 실패 시 무시 (사용자가 캔버스 클릭하면 됨)
    }
  };

  const handleLeaveRoom = () => {
    setShowPauseMenu(false);
    onExit();
  };

  return (
    <>
      {/* Countdown */}
      {status === 'countdown' && countdown > 0 && (
        <div className="absolute inset-0 z-20 flex items-center justify-center">
          <div className="text-9xl font-bold text-white drop-shadow-lg animate-pulse">{countdown}</div>
        </div>
      )}

      {/* GO! */}
      {status === 'countdown' && countdown === 0 && (
        <div className="absolute inset-0 z-20 flex items-center justify-center">
          <div className="text-9xl font-bold text-green-400 drop-shadow-lg">GO!</div>
        </div>
      )}

      {/* 상단 중앙: 타이머 + 순위 + 체크포인트 */}
      {status === 'playing' && !localFinished && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10">
          <div className="bg-slate-900/80 backdrop-blur-sm rounded-xl px-6 py-3 border border-white/10">
            {/* 타이머 */}
            <div className="text-4xl font-mono font-bold text-white text-center">
              {formatTime(elapsedTime)}
            </div>
            {/* 순위 + 체크포인트 */}
            <div className="flex items-center justify-center gap-4 mt-1">
              <div className="flex items-center gap-1">
                <span className="text-yellow-400 font-bold">{currentRank}</span>
                <span className="text-white/60 text-sm">/{players.length}위</span>
              </div>
              {totalCheckpoints > 0 && (
                <div className="flex items-center gap-1">
                  <span className="text-sky-400 font-bold">{localCheckpoint}</span>
                  <span className="text-white/60 text-sm">/{totalCheckpoints} 체크포인트</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Grace period countdown - shown during playing when someone finished */}
      {status === 'playing' && gracePeriod > 0 && !localFinished && (
        <div className="absolute top-28 left-1/2 -translate-x-1/2 z-20">
          <div className="bg-red-500/90 backdrop-blur-sm rounded-xl px-6 py-3 text-center border border-red-400/50">
            <div className="text-white/80 text-sm mb-1">누군가 완주했습니다!</div>
            <div className="text-5xl font-bold text-white">{Math.max(1, Math.ceil(gracePeriod))}</div>
            <div className="text-white/80 text-sm">초 남음</div>
          </div>
        </div>
      )}

      {/* Local player finished message */}
      {status === 'playing' && localFinished && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-20">
          <div className="bg-green-500/90 backdrop-blur-sm rounded-xl px-6 py-3 text-center border border-green-400/50">
            <div className="text-3xl font-bold text-white mb-1">완주!</div>
            <div className="text-white/80 text-sm">다른 플레이어를 기다리는 중...</div>
            {gracePeriod > 0 && (
              <div className="text-2xl font-bold text-white mt-2">{Math.max(1, Math.ceil(gracePeriod))}초</div>
            )}
          </div>
        </div>
      )}

      {/* Finished screen */}
      {status === 'finished' && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/50">
          <div className="bg-slate-800/95 backdrop-blur-sm rounded-2xl p-8 text-center border border-white/20 min-w-96">
            <div className="text-4xl font-bold mb-6 text-white">레이스 완료!</div>
            <div className="space-y-2 mb-6">
              {rankings.map((entry) => (
                <div
                  key={entry.playerId}
                  className={`flex items-center justify-between p-3 rounded-lg ${
                    entry.playerId === myId ? 'ring-2 ring-sky-400' : ''
                  } ${
                    entry.dnf
                      ? 'bg-red-500/20'
                      : entry.rank === 1
                      ? 'bg-yellow-500/30'
                      : entry.rank === 2
                      ? 'bg-gray-400/30'
                      : entry.rank === 3
                      ? 'bg-orange-600/30'
                      : 'bg-white/10'
                  }`}
                >
                  <span className={`font-bold min-w-12 ${
                    entry.dnf ? 'text-red-400' :
                    entry.rank === 1 ? 'text-yellow-400' :
                    entry.rank === 2 ? 'text-gray-300' :
                    entry.rank === 3 ? 'text-orange-400' :
                    'text-white'
                  }`}>
                    {entry.dnf ? 'DNF' : `#${entry.rank}`}
                  </span>
                  <span className="text-white flex-1 text-left ml-4">{entry.nickname}</span>
                  <span className="text-white/70 font-mono">
                    {entry.dnf ? '--:--.--' : formatTime(entry.time)}
                  </span>
                </div>
              ))}
            </div>
            <div className="flex gap-4 justify-center">
              <button
                onClick={onReturnToWaitingRoom}
                className="px-6 py-2 bg-green-500 hover:bg-green-400 text-white rounded-lg font-medium transition-colors"
              >
                대기방으로
              </button>
              <button
                onClick={onExit}
                className="px-6 py-2 bg-slate-600 hover:bg-slate-500 text-white rounded-lg font-medium transition-colors"
              >
                로비로
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 플레이어 목록 (체크포인트 진행도 + 거리 포함) */}
      <div className="absolute top-4 left-4 z-10 bg-slate-900/80 backdrop-blur-sm rounded-xl p-3 border border-white/10 min-w-48">
        <div className="text-white/60 text-xs mb-2">플레이어</div>
        <div className="space-y-1.5">
          {players
            .slice()
            .sort((a, b) => {
              // 완주한 플레이어 먼저 (완주 시간순)
              if (a.finished && !b.finished) return -1;
              if (!a.finished && b.finished) return 1;
              if (a.finished && b.finished) return (a.finishTime || 0) - (b.finishTime || 0);
              // 레이싱 중인 플레이어는 체크포인트 > 거리 순
              return sortRacingPlayers(a, b);
            })
            .map((p, index) => (
              <div
                key={p.id}
                className={`flex items-center gap-2 text-sm py-1 px-2 rounded ${
                  p.id === myId ? 'bg-sky-500/20' : ''
                }`}
              >
                <span className={`font-bold min-w-5 ${
                  p.finished ? 'text-green-400' :
                  index === 0 ? 'text-yellow-400' :
                  'text-white/60'
                }`}>
                  {index + 1}
                </span>
                <span className={`flex-1 ${p.id === myId ? 'text-sky-400' : 'text-white'}`}>
                  {p.nickname}
                </span>
                {p.finished ? (
                  <span className="text-green-400 text-xs">완주</span>
                ) : totalCheckpoints > 0 ? (
                  <span className="text-white/40 text-xs">
                    {p.checkpoint}/{totalCheckpoints}
                  </span>
                ) : null}
              </div>
            ))}
        </div>
      </div>

      {/* 조작 안내 (한글) */}
      <div className="absolute bottom-4 left-4 z-10 bg-slate-900/70 backdrop-blur-sm rounded-xl p-3 border border-white/10">
        <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs">
          <span className="text-white/40">WASD</span>
          <span className="text-white/60">이동</span>
          <span className="text-white/40">Shift</span>
          <span className="text-white/60">달리기</span>
          <span className="text-white/40">Space</span>
          <span className="text-white/60">점프</span>
          <span className="text-white/40">V</span>
          <span className="text-white/60">구르기</span>
          <span className="text-white/40">C / Z</span>
          <span className="text-white/60">앉기 / 엎드리기</span>
          <span className="text-white/40">ESC</span>
          <span className="text-white/60">메뉴</span>
        </div>
      </div>

      {/* 일시정지 메뉴 */}
      {showPauseMenu && status !== 'finished' && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/60">
          <div className="bg-slate-800/95 backdrop-blur-sm rounded-2xl p-8 text-center border border-white/20 min-w-72">
            <div className="text-2xl font-bold text-white mb-6">일시정지</div>
            <div className="space-y-3">
              <button
                onClick={handleResume}
                className="w-full px-6 py-3 bg-sky-500 hover:bg-sky-400 text-white rounded-lg font-medium transition-colors"
              >
                게임으로 돌아가기
              </button>
              <button
                onClick={handleLeaveRoom}
                className="w-full px-6 py-3 bg-red-500/80 hover:bg-red-500 text-white rounded-lg font-medium transition-colors"
              >
                방 나가기
              </button>
            </div>
            <div className="text-white/40 text-xs mt-4">ESC를 다시 눌러 게임으로 돌아가기</div>
          </div>
        </div>
      )}

      {/* Crosshair */}
      {!showPauseMenu && status === 'playing' && (
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-10">
          <div className="w-1 h-1 bg-white/70 rounded-full" />
        </div>
      )}
    </>
  );
});

// Loading screen
const LoadingScreen = memo(function LoadingScreen() {
  return (
    <div className="w-full h-full bg-slate-900 flex items-center justify-center">
      <div className="text-white text-xl">Loading...</div>
    </div>
  );
});

// Main component
export function MultiplayerCanvas({
  onExit,
  onReturnToWaitingRoom,
}: {
  onExit: () => void;
  onReturnToWaitingRoom: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [mapData, setMapData] = useState<MapData | null>(null);
  const physicsRef = useRef<{
    world: RAPIER.World;
    playerBody: RAPIER.RigidBody;
  } | null>(null);
  const playerColliderRef = useRef<RAPIER.Collider | null>(null);
  const [physicsReady, setPhysicsReady] = useState(false);

  const initGame = useMultiplayerGameStore((state) => state.initGame);
  const cleanupGame = useMultiplayerGameStore((state) => state.cleanupGame);
  const players = useMultiplayerGameStore((state) => state.players);
  const currentRoom = useRoomStore((state) => state.currentRoom);
  const isRelayRace = useMultiplayerGameStore((state) => state.isRelayRace);
  const relayMapData = useMultiplayerGameStore((state) => state.relayMapData);

  // 내 플레이어 색상
  const myId = socketManager.getSocket()?.id;
  const myColor = useMemo(() => {
    const myPlayer = players.find(p => p.id === myId);
    return myPlayer?.color;
  }, [players, myId]);

  // 릴레이 레이스용 병합된 맵 데이터
  const mergedRelayMapData = useMemo((): MapData | null => {
    if (!isRelayRace || !relayMapData) return null;

    const mergedObjects: MapObject[] = [];
    const mergedMarkers: MapMarker[] = [];

    // 모든 세그먼트의 오브젝트와 추가 마커(checkpoint, killzone) 병합
    for (const segment of relayMapData.segments) {
      mergedObjects.push(...segment.objects);
      // 각 세그먼트의 추가 마커 (checkpoint, killzone) 추가
      if (segment.markers) {
        for (const marker of segment.markers) {
          mergedMarkers.push({
            ...marker,
            id: `${segment.playerId}-${marker.id}`,  // 고유 ID 보장
          });
        }
      }
    }

    // 첫 번째 세그먼트의 spawnPosition -> spawn 마커
    const firstSegment = relayMapData.segments[0];
    if (firstSegment) {
      mergedMarkers.push({
        id: 'relay-spawn',
        type: 'spawn',
        position: firstSegment.spawnPosition,
        rotation: [0, 0, 0],
      });
    }

    // 두 번째 이후 세그먼트의 spawnPosition -> checkpoint 마커 (텔레포트 목적지 표시)
    for (let i = 1; i < relayMapData.segments.length; i++) {
      const segment = relayMapData.segments[i];
      mergedMarkers.push({
        id: `relay-spawn-checkpoint-${i}`,
        type: 'checkpoint',
        position: segment.spawnPosition,
        rotation: [0, 0, 0],
      });
    }

    // 중간 세그먼트들의 finishPosition -> checkpoint 마커 (텔레포트 트리거)
    for (let i = 0; i < relayMapData.segments.length - 1; i++) {
      const segment = relayMapData.segments[i];
      mergedMarkers.push({
        id: `relay-checkpoint-${i}`,
        type: 'checkpoint',
        position: segment.finishPosition,
        rotation: [0, 0, 0],
      });
    }

    // 마지막 세그먼트의 finishPosition -> finish 마커
    const lastSegment = relayMapData.segments[relayMapData.segments.length - 1];
    if (lastSegment) {
      mergedMarkers.push({
        id: 'relay-finish',
        type: 'finish',
        position: lastSegment.finishPosition,
        rotation: [0, 0, 0],
      });
    }

    const now = Date.now();
    return {
      id: 'relay-merged',
      name: 'Relay Race Map',
      mode: 'race',
      objects: mergedObjects,
      markers: mergedMarkers,
      createdAt: now,
      updatedAt: now,
    };
  }, [isRelayRace, relayMapData]);

  // 실제 사용할 맵 데이터 (릴레이 레이스면 병합된 데이터, 아니면 일반 맵 데이터)
  const effectiveMapData = useMemo(() => {
    return mergedRelayMapData || mapData;
  }, [mergedRelayMapData, mapData]);

  // 스폰 위치 계산
  const startPosition = useMemo((): [number, number, number] => {
    if (effectiveMapData) {
      const spawnMarker = effectiveMapData.markers.find(m => m.type === 'spawn' || m.type === 'spawn_a');
      if (spawnMarker) {
        return [spawnMarker.position[0], spawnMarker.position[1], spawnMarker.position[2]];
      }
    }
    return [0, 0, 0];
  }, [effectiveMapData]);

  // 피니시 위치 계산
  const finishPosition = useMemo((): [number, number, number] | null => {
    if (effectiveMapData) {
      const finishMarker = effectiveMapData.markers.find(m => m.type === 'finish');
      if (finishMarker) {
        return [finishMarker.position[0], finishMarker.position[1], finishMarker.position[2]];
      }
    }
    return null;
  }, [effectiveMapData]);

  // 체크포인트 목록
  const checkpoints = useMemo(() => {
    return effectiveMapData?.markers.filter(m => m.type === 'checkpoint') || [];
  }, [effectiveMapData]);

  // 카운트 가능한 체크포인트 수 (모든 체크포인트 포함)
  const countableCheckpoints = useMemo(() => {
    return checkpoints.length;
  }, [checkpoints]);

  // 킬존 목록
  const killzones = useMemo(() => {
    return effectiveMapData?.markers.filter(m => m.type === 'killzone') || [];
  }, [effectiveMapData]);

  const physics = useMemo((): PhysicsContext | null => {
    if (!physicsRef.current || !playerColliderRef.current || !physicsReady) return null;
    return {
      world: physicsRef.current.world,
      playerBody: physicsRef.current.playerBody,
      playerColliderRef: playerColliderRef as React.MutableRefObject<RAPIER.Collider>,
    };
  }, [physicsReady]);

  useEffect(() => {
    // 릴레이 레이스인 경우 MultiplayerGame.tsx에서 이미 initGame()을 호출했으므로 여기서 다시 호출하지 않음
    // load_map 모드인 경우에만 여기서 initGame() 호출
    const shouldInitGame = currentRoom?.roomType !== 'create_map';
    if (shouldInitGame) {
      initGame();
    }

    let mounted = true;

    async function init() {
      try {
        // 릴레이 레이스인 경우 relayMapData가 올 때까지 대기
        const storeState = useMultiplayerGameStore.getState();
        const isRelay = storeState.isRelayRace;
        const relayData = storeState.relayMapData;

        // 맵 데이터 로드
        let loadedMapData: MapData | null = null;

        if (isRelay && relayData) {
          // 릴레이 레이스: relayMapData에서 병합된 맵 데이터 생성
          const mergedObjects: MapObject[] = [];
          const mergedMarkers: MapMarker[] = [];

          // 모든 세그먼트의 오브젝트와 추가 마커 병합
          for (const segment of relayData.segments) {
            mergedObjects.push(...segment.objects);
            // 각 세그먼트의 추가 마커 (checkpoint, killzone) 추가
            if (segment.markers) {
              for (const marker of segment.markers) {
                mergedMarkers.push({
                  ...marker,
                  id: `${segment.playerId}-${marker.id}`,
                });
              }
            }
          }

          // 첫 번째 세그먼트의 spawn
          const firstSeg = relayData.segments[0];
          if (firstSeg) {
            mergedMarkers.push({
              id: 'relay-spawn',
              type: 'spawn',
              position: firstSeg.spawnPosition,
              rotation: [0, 0, 0],
            });
          }

          // 두 번째 이후 세그먼트의 spawnPosition -> checkpoint
          for (let i = 1; i < relayData.segments.length; i++) {
            const seg = relayData.segments[i];
            mergedMarkers.push({
              id: `relay-spawn-checkpoint-${i}`,
              type: 'checkpoint',
              position: seg.spawnPosition,
              rotation: [0, 0, 0],
            });
          }

          // 중간 체크포인트들 (finishPosition)
          for (let i = 0; i < relayData.segments.length - 1; i++) {
            const seg = relayData.segments[i];
            mergedMarkers.push({
              id: `relay-checkpoint-${i}`,
              type: 'checkpoint',
              position: seg.finishPosition,
              rotation: [0, 0, 0],
            });
          }

          // 마지막 finish
          const lastSeg = relayData.segments[relayData.segments.length - 1];
          if (lastSeg) {
            mergedMarkers.push({
              id: 'relay-finish',
              type: 'finish',
              position: lastSeg.finishPosition,
              rotation: [0, 0, 0],
            });
          }

          const now = Date.now();
          loadedMapData = {
            id: 'relay-merged',
            name: 'Relay Race Map',
            mode: 'race',
            objects: mergedObjects,
            markers: mergedMarkers,
            createdAt: now,
            updatedAt: now,
          };
          if (mounted) setMapData(loadedMapData);
        } else if (currentRoom?.mapId && currentRoom.mapId !== 'default') {
          // 일반 맵 로드
          try {
            const { mapService } = await import('../../lib/mapService');
            const mapRecord = await mapService.getMap(currentRoom.mapId);
            loadedMapData = mapRecord.data as MapData;
            if (mounted) setMapData(loadedMapData);
          } catch (err) {
            console.error('맵 로드 실패:', err);
            // 맵 로드 실패 시 기본 맵으로 진행
            const now = Date.now();
            loadedMapData = {
              id: 'fallback',
              name: 'Fallback Map',
              mode: 'race',
              objects: [],
              markers: [{ id: 'default-spawn', type: 'spawn', position: [0, 0, 0] as [number, number, number], rotation: [0, 0, 0] as [number, number, number] }],
              createdAt: now,
              updatedAt: now,
            } as MapData;
            if (mounted) setMapData(loadedMapData);
          }
        }

        await initRapier();
        if (!mounted) return;

        const world = createWorld();
        createGround(world);

        // 맵 오브젝트를 물리 월드에 로드
        if (loadedMapData) {
          loadMapObjects(world, loadedMapData.objects);
        }

        // 스폰 위치 계산
        let spawnPos: [number, number, number] = [0, 0, 0];
        if (loadedMapData) {
          const spawnMarker = loadedMapData.markers.find(m => m.type === 'spawn' || m.type === 'spawn_a');
          if (spawnMarker) {
            spawnPos = [spawnMarker.position[0], spawnMarker.position[1], spawnMarker.position[2]];
          }
        }

        const { rigidBody, collider } = createPlayer(world, spawnPos);

        physicsRef.current = { world, playerBody: rigidBody };
        playerColliderRef.current = collider;
        setPhysicsReady(true);
        setLoading(false);
      } catch (error) {
        console.error('Failed to initialize physics:', error);
        if (mounted) setLoading(false);
      }
    }

    init();

    return () => {
      mounted = false;
      // 릴레이 레이스인 경우 MultiplayerGame.tsx에서 cleanupGame()을 처리하므로 여기서 호출하지 않음
      if (currentRoom?.roomType !== 'create_map') {
        cleanupGame();
      }
      cleanupGeometryCache();
      setPhysicsReady(false);
      playerColliderRef.current = null;
      if (physicsRef.current) {
        try {
          physicsRef.current.world.free();
        } catch { /* 이미 해제됨 */ }
        physicsRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentRoom?.roomType]);

  useEffect(() => {
    useGameStore.getState().reset();
  }, []);

  // 릴레이 레이스 영역 세그먼트 정보
  const relaySegments = useMemo(() => {
    if (!isRelayRace || !relayMapData) return null;
    return relayMapData.segments.map(seg => ({
      playerId: seg.playerId,
      order: seg.order,
      spawnPosition: seg.spawnPosition,
      region: seg.region,
    }));
  }, [isRelayRace, relayMapData]);

  if (loading) return <LoadingScreen />;

  return (
    <div id="game-canvas" className="w-full h-full relative">
      <Canvas camera={{ fov: 60, near: 0.1, far: 1000 }} shadows>
        <SceneContent
          startPosition={startPosition}
          physics={physics}
          mapData={effectiveMapData}
          finishPosition={finishPosition}
          checkpoints={checkpoints}
          killzones={killzones}
          relaySegments={relaySegments}
          myColor={myColor}
        />
      </Canvas>
      <MultiplayerUI onExit={onExit} onReturnToWaitingRoom={onReturnToWaitingRoom} totalCheckpoints={countableCheckpoints} finishPosition={finishPosition} />
    </div>
  );
}

useGLTF.preload('/Runtest.glb');
