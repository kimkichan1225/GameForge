import { useRef, useEffect, useMemo, useCallback } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF, useAnimations, useFBX } from '@react-three/drei';
import * as THREE from 'three';
import { useInput } from '../hooks/useInput';
import { useGameStore } from '../store/gameStore';

// Constants
const WALK_SPEED = 4;
const RUN_SPEED = 8;
const SIT_SPEED = 3;
const JUMP_POWER = 10;
const GRAVITY = -25;
const HEAD_MAX_ANGLE = Math.PI / 3;
const PI2 = Math.PI * 2;

// Reusable objects (GC 방지)
const _vel = new THREE.Vector3();
const _move = new THREE.Vector3();
const _yAxis = new THREE.Vector3(0, 1, 0);
const _targetQuat = new THREE.Quaternion();
const _weaponOffset = new THREE.Vector3();
const _armsOffset = new THREE.Vector3();
const _armsRotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);

// 풀암 모델 오프셋 (카메라 로컬 좌표 기준)
// x: 오른쪽(+)/왼쪽(-), y: 위(+)/아래(-), z: 뒤(+)/앞(-)
const ARMS_OFFSET_X = 0;      // 좌우
const ARMS_OFFSET_Y = -2.2;   // 아래로
const ARMS_OFFSET_Z = 0;    // 약간 앞으로

// 1인칭 시점에서 풀암 모델 애니메이션 매핑 (메인 애니메이션 → 풀암 애니메이션)
const FPS_ARMS_ANIM_MAP: Record<string, string> = {
  'Idle': 'IdleAiming',
  'WalkFront': 'WalkAiming',
};

// 총 재질 (싱글톤)
const GUN_MATERIAL = new THREE.MeshStandardMaterial({
  color: 0x333333,
  metalness: 0.8,
  roughness: 0.3
});

// 무기별 설정 (라디안으로 미리 변환)
const deg = THREE.MathUtils.degToRad;
type WeaponConfig = {
  rotation: THREE.Euler;
  position: [number, number, number];
  flashPosition: [number, number, number];
  flashSpeed: number;
};

const WEAPON_CONFIGS: Record<string, WeaponConfig> = {
  rifle: {
    rotation: new THREE.Euler(deg(0), deg(180), deg(80)),
    position: [0, 0.15, 0],
    flashPosition: [0, 145, 0],
    flashSpeed: 60,
  },
  shotgun: {
    rotation: new THREE.Euler(deg(0), deg(180), deg(80)),
    position: [0.2, 0.15, 0],
    flashPosition: [0, 155, 0],
    flashSpeed: 30,
  },
  sniper: {
    rotation: new THREE.Euler(deg(0), deg(180), deg(80)),
    position: [0.2, 0.15, 0],
    flashPosition: [0, 230, 0],
    flashSpeed: 20,
  },
};

// 애니메이션 매핑 (정적)
const ANIM_TARGETS: Record<string, string> = {
  'Idle': 'Idle-Rifle',
  'RunFront': 'RunFront-Rifle',
  'RunBack': 'RunBack-Rifle',
  'RunLeft': 'RunLeft-Rifle',
  'RunRight': 'RunRight-Rifle',
  'RunFrontLeft': 'RunFrontLeft-Rifle',
  'RunFrontRight': 'RunFrontRight-Rifle',
  'RunBackLeft': 'RunBackLeft-Rifle',
  'RunBackRight': 'RunBackRight-Rifle',
  'WalkFront': 'WalkFront-Rifle',
  'WalkBack': 'WalkBack-Rifle',
  'WalkLeft': 'WalkLeft-Rifle',
  'WalkRight': 'WalkRight-Rifle',
  'WalkFrontLeft': 'WalkFrontLeft-Rifle',
  'WalkFrontRight': 'WalkFrontRight-Rifle',
  'WalkBackLeft': 'WalkBackLeft-Rifle',
  'WalkBackRight': 'WalkBackRight-Rifle',
  'SitIdle': 'SitIdle-Rifle',
  'SitWalkFront': 'SitWalkFront-Rifle',
  'SitWalkBack': 'SitWalkBack-Rifle',
  'SitWalkLeft': 'SitWalkLeft-Rifle',
  'SitWalkRight': 'SitWalkRight-Rifle',
  'SitWalkFrontLeft': 'SitWalkFrontLeft-Rifle',
  'SitWalkFrontRight': 'SitWalkFrontRight-Rifle',
  'SitWalkBackLeft': 'SitWalkBackLeft-Rifle',
  'SitWalkBackRight': 'SitWalkBackRight-Rifle',
  'CrawlIdle': 'CrawlIdle-Rifle',
  'Jump': 'Jump',
  'IdleFiring': 'IdleFiring-Rifle',
  'WalkFiring': 'WalkFiring-Rifle',
  'RunFiring': 'RunFiring-Rifle',
  'IdleAiming': 'IdleAiming-Rifle',
  'WalkAiming': 'WalkAiming-Rifle',
};

// Utility functions (인라인 가능하도록 간결하게)
const clamp = (v: number, min: number, max: number) => v < min ? min : v > max ? max : v;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function normalizeAngle(angle: number): number {
  while (angle > Math.PI) angle -= PI2;
  while (angle < -Math.PI) angle += PI2;
  return angle;
}

function lerpAngle(from: number, to: number, t: number): number {
  return from + normalizeAngle(to - from) * t;
}

// 방향 계산 (비트마스크 사용)
const DIRS = ['', 'Front', 'Back', '', 'Left', 'FrontLeft', 'BackLeft', '', 'Right', 'FrontRight', 'BackRight'];
function getDirection(f: boolean, b: boolean, l: boolean, r: boolean): string {
  const idx = (f ? 1 : 0) | (b ? 2 : 0) | (l ? 4 : 0) | (r ? 8 : 0);
  return DIRS[idx] || '';
}

export function GunPlayer() {
  const group = useRef<THREE.Group>(null!);
  const armsGroup = useRef<THREE.Group>(null!);
  const { scene, animations } = useGLTF('/Untitled1.glb');
  const { scene: armsScene, animations: armsAnimations } = useGLTF('/Onlyarms.glb');
  const rifleFbx = useFBX('/Rifle.fbx');
  const shotgunFbx = useFBX('/Shotgun.fbx');
  const sniperFbx = useFBX('/Sniper.fbx');
  const { actions, names } = useAnimations(animations, scene);
  const { actions: armsActions, names: armsNames } = useAnimations(armsAnimations, armsScene);

  // Refs
  const headBone = useRef<THREE.Bone | null>(null);
  const rightHandBone = useRef<THREE.Bone | null>(null);
  const armsRightHandBone = useRef<THREE.Bone | null>(null);
  const weaponRef = useRef<THREE.Group>(null);
  const muzzleFlashRef = useRef<THREE.PointLight>(null);
  const animMapRef = useRef<Record<string, string>>({});
  const armsAnimMapRef = useRef<Record<string, string>>({});

  // State refs (useState 대신 ref 사용 - 리렌더 방지)
  const stateRef = useRef({
    velocityY: 0,
    grounded: true,
    currentAnim: '',
    currentArmsAnim: '',
    prevViewMode: useGameStore.getState().viewMode,
    prevSpace: false,
    prevC: false,
    prevZ: false,
    lastX: 0,
    lastY: 0,
    lastZ: 0,
    headRotY: 0,
    bodyAngle: useGameStore.getState().bodyAngle,
    muzzleTimer: 0,
    initialized: false,
    transitioning: false,
  });

  const mouseRef = useRef({ firing: false, aiming: false });
  const input = useInput();

  // Store selectors (개별 구독으로 최적화)
  const weaponType = useGameStore(s => s.weaponType);

  // 마우스 이벤트 (한 번만 등록)
  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      if (e.button === 0) mouseRef.current.firing = true;
      if (e.button === 2) mouseRef.current.aiming = true;
    };
    const onMouseUp = (e: MouseEvent) => {
      if (e.button === 0) mouseRef.current.firing = false;
      if (e.button === 2) mouseRef.current.aiming = false;
    };
    const onContextMenu = (e: MouseEvent) => e.preventDefault();

    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('contextmenu', onContextMenu);
    return () => {
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('contextmenu', onContextMenu);
    };
  }, []);

  // 본 탐색 (한 번만)
  useEffect(() => {
    // 메인 캐릭터 본 탐색
    scene.traverse((obj) => {
      if (obj instanceof THREE.Bone) {
        if (obj.name === 'mixamorigHead') headBone.current = obj;
        else if (obj.name === 'mixamorigRightHand') rightHandBone.current = obj;
      }
    });
    // 풀암 모델 본 탐색
    armsScene.traverse((obj) => {
      if (obj instanceof THREE.Bone) {
        if (obj.name === 'mixamorigRightHand') armsRightHandBone.current = obj;
      }
    });
  }, [scene, armsScene]);

  // 애니메이션 맵 빌드 및 초기 Idle 재생
  useEffect(() => {
    if (names.length === 0) return;

    // 메인 캐릭터 맵 빌드
    const map: Record<string, string> = {};
    for (const [key, term] of Object.entries(ANIM_TARGETS)) {
      const found = names.find(n => {
        const clipName = n.split('|').pop();
        return clipName === term;
      });
      if (found) map[key] = found;
    }
    animMapRef.current = map;

    // Idle 애니메이션 즉시 재생
    const idleClip = map['Idle'];
    if (idleClip && actions[idleClip]) {
      const action = actions[idleClip];
      action.reset().fadeIn(0).play();
      action.setLoop(THREE.LoopRepeat, Infinity);
      stateRef.current.currentAnim = 'Idle';
      stateRef.current.initialized = true;
      useGameStore.getState().setAnimation('Idle');
    }
  }, [names, actions]);

  // 풀암 모델 애니메이션 맵 빌드 및 초기 Idle 재생
  useEffect(() => {
    if (armsNames.length === 0) return;

    // 풀암 모델 맵 빌드
    const map: Record<string, string> = {};
    for (const [key, term] of Object.entries(ANIM_TARGETS)) {
      const found = armsNames.find(n => {
        const clipName = n.split('|').pop();
        return clipName === term;
      });
      if (found) map[key] = found;
    }
    armsAnimMapRef.current = map;

    // 풀암 모델 초기 애니메이션 (1인칭 시점이면 IdleAiming)
    const isFirstPerson = useGameStore.getState().viewMode === 'firstPerson';
    const initAnim = isFirstPerson ? 'IdleAiming' : 'Idle';
    const idleClip = map[initAnim] || map['Idle'];
    if (idleClip && armsActions[idleClip]) {
      const action = armsActions[idleClip];
      action.reset().fadeIn(0).play();
      action.setLoop(THREE.LoopRepeat, Infinity);
    }
  }, [armsNames, armsActions]);

  // 애니메이션 재생 (메인 캐릭터 + 풀암 모델 동시 재생)
  const playAnim = useCallback((name: string, onComplete?: () => void) => {
    const s = stateRef.current;
    const map = animMapRef.current;
    const armsMap = armsAnimMapRef.current;
    if (s.currentAnim === name && !onComplete) return;
    if (!map[name]) return;

    const clipName = map[name];
    const action = actions[clipName];
    if (!action) return;

    const prevClip = map[s.currentAnim];
    if (prevClip) actions[prevClip]?.fadeOut(0.2);

    action.reset().fadeIn(0.2).play();

    // 풀암 모델 애니메이션 재생 (1인칭 시점에서는 다른 애니메이션 사용)
    const isFirstPerson = useGameStore.getState().viewMode === 'firstPerson';
    const armsAnimName = isFirstPerson ? (FPS_ARMS_ANIM_MAP[name] || name) : name;
    const armsClipName = armsMap[armsAnimName];
    if (armsClipName && armsActions[armsClipName]) {
      // 이전 애니메이션 fadeOut
      if (s.currentArmsAnim && armsMap[s.currentArmsAnim]) {
        armsActions[armsMap[s.currentArmsAnim]]?.fadeOut(0.2);
      }

      const armsAction = armsActions[armsClipName];
      armsAction.reset().fadeIn(0.2).play();

      if (armsAnimName === 'Jump' || armsAnimName === 'SitDown' || armsAnimName === 'StandUp') {
        armsAction.setLoop(THREE.LoopOnce, 1);
        armsAction.clampWhenFinished = true;
      } else {
        armsAction.setLoop(THREE.LoopRepeat, Infinity);
      }
      s.currentArmsAnim = armsAnimName;
    }

    if (name === 'Jump' || name === 'SitDown' || name === 'StandUp') {
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
      if (onComplete) {
        const mixer = action.getMixer();
        const handleFinished = (e: { action: THREE.AnimationAction }) => {
          if (e.action === action) {
            mixer.removeEventListener('finished', handleFinished);
            onComplete();
          }
        };
        mixer.addEventListener('finished', handleFinished);
      }
    } else {
      action.setLoop(THREE.LoopRepeat, Infinity);
    }

    s.currentAnim = name;
    useGameStore.getState().setAnimation(name);
  }, [actions, armsActions]);

  // 방향별 애니메이션 결정
  const getDirectionalAnim = useCallback((
    dir: string, running: boolean, posture: string, firing: boolean, aiming: boolean
  ): string => {
    const canAim = aiming && !running && posture === 'standing';

    if (!dir) {
      if (posture === 'sitting') return 'SitIdle';
      if (posture === 'crawling') return 'CrawlIdle';
      if (canAim && firing) return 'IdleFiring';
      if (canAim) return 'IdleAiming';
      if (firing && posture === 'standing') return 'IdleFiring';
      return 'Idle';
    }

    if (posture === 'sitting') return `SitWalk${dir}`;
    if (posture === 'crawling') return 'CrawlIdle';

    if (dir === 'Front') {
      if (canAim && firing) return 'WalkFiring';
      if (canAim) return 'WalkAiming';
      if (firing) return running ? 'RunFiring' : 'WalkFiring';
    }

    return `${running ? 'Run' : 'Walk'}${dir}`;
  }, []);

  // 메인 루프
  useFrame((state, dt) => {
    if (!group.current) return;

    const s = stateRef.current;
    const keys = input.current;
    const mouse = mouseRef.current;
    const store = useGameStore.getState();
    const posture = store.posture;
    const lookDir = store.lookDirection;

    // 1인칭/3인칭 모드에 따라 모델 전환
    const isFirstPerson = store.viewMode === 'firstPerson';
    scene.visible = !isFirstPerson;  // 3인칭: 전체 캐릭터 표시
    armsScene.visible = isFirstPerson;  // 1인칭: 풀암 모델만 표시

    // 시점 변경 감지 시 풀암 애니메이션 업데이트
    if (s.prevViewMode !== store.viewMode && s.currentAnim) {
      s.prevViewMode = store.viewMode;
      const armsMap = armsAnimMapRef.current;
      const armsAnimName = isFirstPerson ? (FPS_ARMS_ANIM_MAP[s.currentAnim] || s.currentAnim) : s.currentAnim;
      const armsClipName = armsMap[armsAnimName];
      if (armsClipName && armsActions[armsClipName]) {
        // 이전 풀암 애니메이션 fadeOut
        if (s.currentArmsAnim && armsMap[s.currentArmsAnim]) {
          armsActions[armsMap[s.currentArmsAnim]]?.fadeOut(0.2);
        }
        const armsAction = armsActions[armsClipName];
        armsAction.reset().fadeIn(0.2).play();
        armsAction.setLoop(THREE.LoopRepeat, Infinity);
        s.currentArmsAnim = armsAnimName;
      }
    }

    // 1인칭 모드: 풀암 모델을 카메라에 고정
    if (isFirstPerson && armsGroup.current) {
      const camera = state.camera;
      // 카메라 로컬 좌표계 기준 오프셋 적용
      _armsOffset.set(ARMS_OFFSET_X, ARMS_OFFSET_Y, ARMS_OFFSET_Z);
      _armsOffset.applyQuaternion(camera.quaternion);
      armsGroup.current.position.copy(camera.position).add(_armsOffset);
      // 카메라 회전 + Y축 180도 회전 (모델이 카메라와 같은 방향 보도록)
      armsGroup.current.quaternion.copy(camera.quaternion).multiply(_armsRotation);
    }

    s.bodyAngle = store.bodyAngle;

    // 자세 전환 (C: 앉기, Z: 엎드리기)
    if (keys.c && !s.prevC && s.grounded && !s.transitioning) {
      store.setPosture(posture === 'sitting' ? 'standing' : 'sitting');
    }
    if (keys.z && !s.prevZ && s.grounded && !s.transitioning) {
      store.setPosture(posture === 'crawling' ? 'standing' : 'crawling');
    }

    // 점프
    if (keys.space && !s.prevSpace && s.grounded && posture === 'standing' && !s.transitioning) {
      s.velocityY = JUMP_POWER;
      s.grounded = false;
      playAnim('Jump');
    }

    s.prevSpace = keys.space;
    s.prevC = keys.c;
    s.prevZ = keys.z;

    // 머리 회전
    const angleDiff = normalizeAngle(lookDir - s.bodyAngle);
    if (headBone.current) {
      const clampedHead = clamp(angleDiff, -HEAD_MAX_ANGLE, HEAD_MAX_ANGLE);
      s.headRotY = lerp(s.headRotY, clampedHead, 0.15);
      headBone.current.rotation.y = s.headRotY;
    }

    // 몸체 회전 (머리 따라감)
    const absAngleDiff = Math.abs(angleDiff);
    if (absAngleDiff > 0.01) {
      const speedFactor = absAngleDiff > HEAD_MAX_ANGLE
        ? 0.12
        : 0.03 + (absAngleDiff / HEAD_MAX_ANGLE) * 0.05;
      s.bodyAngle = lerpAngle(s.bodyAngle, lookDir, speedFactor);
      store.setBodyAngle(s.bodyAngle);
    }

    // 이동
    _vel.set(0, 0, 0);

    if (!s.transitioning) {
      _move.set(0, 0, 0);
      if (keys.forward) _move.z -= 1;
      if (keys.backward) _move.z += 1;
      if (keys.left) _move.x -= 1;
      if (keys.right) _move.x += 1;

      const moving = _move.lengthSq() > 0;
      const running = keys.shift && posture === 'standing';

      if (moving && posture !== 'crawling') {
        _move.normalize().applyAxisAngle(_yAxis, s.bodyAngle);
        let speed = posture === 'sitting' ? SIT_SPEED : running ? RUN_SPEED : WALK_SPEED;
        if (!s.grounded) speed *= 0.8;
        _vel.copy(_move).multiplyScalar(speed * dt);
      }

      _targetQuat.setFromAxisAngle(_yAxis, s.bodyAngle + Math.PI);
      scene.quaternion.slerp(_targetQuat, 0.15);

      if (s.grounded) {
        const dir = getDirection(keys.forward, keys.backward, keys.left, keys.right);
        playAnim(getDirectionalAnim(dir, running, posture, mouse.firing, mouse.aiming));
      }
    }

    // 중력 & 위치
    s.velocityY += GRAVITY * dt;
    const pos = group.current.position;
    pos.x += _vel.x;
    pos.z += _vel.z;
    pos.y += s.velocityY * dt;

    if (pos.y <= 0) {
      pos.y = 0;
      s.velocityY = 0;
      if (!s.grounded) {
        s.grounded = true;
        if (!s.transitioning) {
          const dir = getDirection(keys.forward, keys.backward, keys.left, keys.right);
          const running = keys.shift && posture === 'standing';
          playAnim(getDirectionalAnim(dir, running, posture, mouse.firing, mouse.aiming));
        }
      }
    }

    // 위치 업데이트 (변경시에만)
    if (pos.x !== s.lastX || pos.y !== s.lastY || pos.z !== s.lastZ) {
      s.lastX = pos.x;
      s.lastY = pos.y;
      s.lastZ = pos.z;
      store.setPlayerPos([pos.x, pos.y, pos.z]);
    }

    // 무기 위치 (1인칭: 풀암 본, 3인칭: 메인 캐릭터 본)
    const activeHandBone = isFirstPerson ? armsRightHandBone.current : rightHandBone.current;
    if (weaponRef.current && activeHandBone) {
      activeHandBone.getWorldPosition(weaponRef.current.position);
      activeHandBone.getWorldQuaternion(weaponRef.current.quaternion);

      const cfg = WEAPON_CONFIGS[store.weaponType];
      _weaponOffset.set(cfg.position[0], cfg.position[1], cfg.position[2]);
      _weaponOffset.applyQuaternion(weaponRef.current.quaternion);
      weaponRef.current.position.add(_weaponOffset);
    }

    // 총구 플래시
    if (muzzleFlashRef.current) {
      if (mouse.firing) {
        s.muzzleTimer += dt;
        const cfg = WEAPON_CONFIGS[store.weaponType];
        muzzleFlashRef.current.intensity = Math.sin(s.muzzleTimer * cfg.flashSpeed) > 0 ? 5 : 0;
      } else {
        muzzleFlashRef.current.intensity = 0;
        s.muzzleTimer = 0;
      }
    }
  });

  // 무기 모델 (무기 변경시에만 재생성)
  const weaponFbxMap = useMemo(() => ({
    rifle: rifleFbx,
    shotgun: shotgunFbx,
    sniper: sniperFbx,
  }), [rifleFbx, shotgunFbx, sniperFbx]);

  const weaponModel = useMemo(() => {
    const fbx = weaponFbxMap[weaponType];
    const cfg = WEAPON_CONFIGS[weaponType];
    const model = fbx.clone();
    model.traverse((child) => {
      if (child instanceof THREE.Mesh) child.material = GUN_MATERIAL;
    });
    model.rotation.copy(cfg.rotation);
    return model;
  }, [weaponFbxMap, weaponType]);

  const flashPos = WEAPON_CONFIGS[weaponType].flashPosition;

  return (
    <>
      <group ref={group}>
        <primitive object={scene} />
      </group>
      {/* 풀암 모델: 카메라에 고정되므로 별도 그룹 */}
      <group ref={armsGroup}>
        <primitive object={armsScene} />
      </group>
      <group ref={weaponRef} scale={0.01}>
        <primitive object={weaponModel} />
        <pointLight
          ref={muzzleFlashRef}
          position={flashPos}
          color={0xffaa00}
          intensity={0}
          distance={3}
        />
      </group>
    </>
  );
}

useGLTF.preload('/Untitled1.glb');
useGLTF.preload('/Onlyarms.glb');
useFBX.preload('/Rifle.fbx');
useFBX.preload('/Shotgun.fbx');
useFBX.preload('/Sniper.fbx');
