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

// 무기별 재장전 시간
const RELOAD_TIME: Record<string, number> = {
  rifle: 2.0,
  shotgun: 2.5,
  sniper: 3.0,
};

// Reusable objects (GC 방지)
const _vel = new THREE.Vector3();
const _move = new THREE.Vector3();
const _yAxis = new THREE.Vector3(0, 1, 0);
const _targetQuat = new THREE.Quaternion();
const _weaponOffset = new THREE.Vector3();
const _armsOffset = new THREE.Vector3();
const _armsRotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
const _aimWeaponTarget = new THREE.Vector3();
const _aimWeaponQuat = new THREE.Quaternion();
const _aimRotationOffset = new THREE.Quaternion();
const _muzzleWorldPos = new THREE.Vector3();
const _armsTargetPos = new THREE.Vector3();
const _armsTargetQuat = new THREE.Quaternion();
const _recoilEuler = new THREE.Euler();

// 풀암 모델 오프셋 (카메라 로컬 좌표 기준)
// x: 오른쪽(+)/왼쪽(-), y: 위(+)/아래(-), z: 뒤(+)/앞(-)

// 서있을 때
const ARMS_OFFSET_STANDING_X = 0;
const ARMS_OFFSET_STANDING_Y = -2.2;
const ARMS_OFFSET_STANDING_Z = 0;

// 앉을 때
const ARMS_OFFSET_SITTING_X = -0.3;
const ARMS_OFFSET_SITTING_Y = -1.4;
const ARMS_OFFSET_SITTING_Z = 0.4;

// 엎드릴 때
const ARMS_OFFSET_CRAWLING_X = 0;
const ARMS_OFFSET_CRAWLING_Y = -0.7;
const ARMS_OFFSET_CRAWLING_Z = 0;

// 1인칭 토글 조준 시 총 위치 오프셋 (카메라 로컬 좌표 기준)
const AIM_WEAPON_OFFSET_X = 0;       // 화면 중앙
const AIM_WEAPON_OFFSET_Y = -0.4;   // 약간 아래
const AIM_WEAPON_OFFSET_Z = -0.5;    // 카메라 앞쪽

// 1인칭 토글 조준 시 총 각도 오프셋 (라디안)
const AIM_WEAPON_ROT_X = Math.PI / 22;          // 위아래 기울기
const AIM_WEAPON_ROT_Y = -Math.PI /2;    // 좌우 회전 (180도 = 카메라 방향)
const AIM_WEAPON_ROT_Z = Math.PI /2; // 롤 회전 (90도)

// 1인칭 토글 조준 시 풀암 모델 오프셋 (기본 오프셋에 더해짐)
const AIM_ARMS_OFFSET_X = -0.35;   // 왼쪽으로
const AIM_ARMS_OFFSET_Y = 0;      // 위아래
const AIM_ARMS_OFFSET_Z = 0;      // 앞뒤

// 1인칭 시점에서 풀암 모델 애니메이션 매핑 (메인 애니메이션 → 풀암 애니메이션)
const FPS_ARMS_ANIM_MAP: Record<string, string> = {
  'Idle': 'IdleAiming',
  'IdleAiming': 'IdleAiming',
  'WalkFront': 'WalkAiming',
  'WalkAiming': 'WalkAiming',
};

// 총 재질 (싱글톤)
const GUN_MATERIAL = new THREE.MeshStandardMaterial({
  color: 0x333333,
  metalness: 0.8,
  roughness: 0.3
});

// 총구 플래시 스프라이트 텍스처 생성
const createMuzzleFlashTexture = () => {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;

  // 방사형 그라데이션 (중심이 밝고 바깥이 투명)
  const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(255, 255, 200, 1)');
  gradient.addColorStop(0.2, 'rgba(255, 200, 50, 1)');
  gradient.addColorStop(0.5, 'rgba(255, 100, 0, 0.8)');
  gradient.addColorStop(1, 'rgba(255, 50, 0, 0)');

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);

  const texture = new THREE.CanvasTexture(canvas);
  return texture;
};

const MUZZLE_FLASH_TEXTURE = createMuzzleFlashTexture();
const MUZZLE_FLASH_MATERIAL = new THREE.SpriteMaterial({
  map: MUZZLE_FLASH_TEXTURE,
  transparent: true,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
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
  'Reload': 'Reload-Rifle',
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
  const tpsWeaponRef = useRef<THREE.Group>(null);  // 3인칭용 (전체 캐릭터 손, 다른 플레이어가 봄)
  const fpsWeaponRef = useRef<THREE.Group>(null);  // 1인칭용 (풀암 손, 나만 봄)
  const muzzleFlashRef = useRef<THREE.PointLight>(null);      // 1인칭용 조명
  const tpsMuzzleFlashRef = useRef<THREE.PointLight>(null);   // 3인칭용 조명
  const fpsMuzzleSpriteRef = useRef<THREE.Sprite>(null);      // 1인칭용 스프라이트
  const tpsMuzzleSpriteRef = useRef<THREE.Sprite>(null);      // 3인칭용 스프라이트
  const animMapRef = useRef<Record<string, string>>({});
  const armsAnimMapRef = useRef<Record<string, string>>({});

  // State refs (useState 대신 ref 사용 - 리렌더 방지)
  const stateRef = useRef({
    velocityY: 0,
    grounded: true,
    currentAnim: '',
    currentArmsAnim: '',
    prevViewMode: useGameStore.getState().viewMode,
    prevToggleAiming: false,  // 이전 토글 조준 상태
    prevSpace: false,
    prevC: false,
    prevV: false,
    prevZ: false,
    prevR: false,
    reloadTimer: 0,
    lastX: 0,
    lastY: 0,
    lastZ: 0,
    headRotY: 0,
    bodyAngle: useGameStore.getState().bodyAngle,
    muzzleTimer: 0,
    initialized: false,
    transitioning: false,
  });

  const mouseRef = useRef({
    firing: false,
    aiming: false,
    aimingToggle: false,      // 토글 조준 상태
    aimingHold: false,        // 홀드 조준 상태
    rightClickStartTime: 0,   // 우클릭 시작 시간
    rightClickHandled: false, // 이번 클릭 처리 완료 여부
    aimTransitionTimer: 0,
    recoilX: 0,               // 반동 X (좌우)
    recoilY: 0,               // 반동 Y (위아래)
    recoilZ: 0,               // 반동 Z (앞뒤)
    lastFireTime: 0,          // 마지막 발사 시간
  });
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

  // 본 탐색 및 플레이어 마킹 (한 번만)
  useEffect(() => {
    // 메인 캐릭터 본 탐색 및 isPlayer 마킹
    scene.traverse((obj) => {
      obj.userData.isPlayer = true;  // 레이캐스트 제외용
      if (obj instanceof THREE.Bone) {
        if (obj.name === 'mixamorigHead') headBone.current = obj;
        else if (obj.name === 'mixamorigRightHand') rightHandBone.current = obj;
      }
    });
    // 풀암 모델 본 탐색 및 isPlayer 마킹
    armsScene.traverse((obj) => {
      obj.userData.isPlayer = true;  // 레이캐스트 제외용
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
      stateRef.current.currentArmsAnim = initAnim;  // 초기 애니메이션 상태 저장
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

    // 풀암 모델 애니메이션 재생 (1인칭 또는 토글 조준 시점에서는 다른 애니메이션 사용)
    const store = useGameStore.getState();
    const useFpsAnim = store.viewMode === 'firstPerson' || store.isToggleAiming;
    const armsAnimName = useFpsAnim ? (FPS_ARMS_ANIM_MAP[name] || name) : name;

    // 풀암 애니메이션이 같으면 다시 재생하지 않음
    if (s.currentArmsAnim === armsAnimName) {
      // 메인 캐릭터만 애니메이션 변경, 풀암은 유지
    } else {
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

    // 발사 가능 조건 (탄약 있고 재장전 중 아닐 때)
    const canFire = mouse.firing && store.currentAmmo > 0 && !store.isReloading;

    // 1인칭/3인칭 모드에 따라 모델 전환
    const isFirstPerson = store.viewMode === 'firstPerson';
    // 토글 조준 시에는 3인칭이어도 1인칭처럼 보임
    const showFpsView = isFirstPerson || mouse.aimingToggle;
    scene.visible = !showFpsView;  // 토글 조준 또는 1인칭이면 전체 캐릭터 숨김
    armsScene.visible = showFpsView;  // 토글 조준 또는 1인칭이면 풀암 모델 표시

    // 1인칭 조준 처리 (짧게 = 토글, 길게 = 홀드)
    const holdThreshold = 0.2;  // 홀드 판정 시간 (초)
    const isMoving = keys.forward || keys.backward || keys.left || keys.right;
    const isRunning = keys.shift && isMoving && posture === 'standing';

    // Run 상태면 토글 조준 해제
    if (isRunning && mouse.aimingToggle) {
      mouse.aimingToggle = false;
      mouse.aimTransitionTimer = 0;
      store.setIsToggleAiming(false);
    }

    // 점프 중(공중)이면 토글/홀드 조준 해제
    if (!s.grounded && (mouse.aimingToggle || mouse.aimingHold)) {
      mouse.aimingToggle = false;
      mouse.aimingHold = false;
      mouse.aimTransitionTimer = 0;
      store.setIsToggleAiming(false);
    }

    // 조준 처리 (1인칭/3인칭 공통 - 짧게 = 토글, 길게 = 홀드)
    if (mouse.aiming) {
      // 우클릭 시작
      if (mouse.rightClickStartTime === 0) {
        mouse.rightClickStartTime = performance.now() / 1000;
        mouse.rightClickHandled = false;
      }

      // 홀드 판정 (길게 누르고 있음) - Run/점프 상태에서는 홀드 안 됨
      const holdTime = (performance.now() / 1000) - mouse.rightClickStartTime;
      if (holdTime >= holdThreshold && !mouse.rightClickHandled && !isRunning && s.grounded) {
        mouse.aimingHold = true;
        mouse.rightClickHandled = true;  // 이번 클릭은 홀드로 처리됨
      }
    } else {
      // 우클릭 뗌
      if (mouse.rightClickStartTime > 0) {
        const holdTime = (performance.now() / 1000) - mouse.rightClickStartTime;

        // 짧게 눌렀다 뗌 → 토글 (Run/점프 상태에서는 토글 안 됨)
        if (!mouse.rightClickHandled && holdTime < holdThreshold && !isRunning && s.grounded) {
          mouse.aimingToggle = !mouse.aimingToggle;
          mouse.aimTransitionTimer = 0;
          // 토글 상태를 store에 공유 (Camera에서 사용)
          store.setIsToggleAiming(mouse.aimingToggle);
        }

        // 홀드 해제
        mouse.aimingHold = false;
        mouse.rightClickStartTime = 0;
        mouse.rightClickHandled = false;
      }
    }

    // 조준 상태 업데이트 (탄퍼짐 계산용)
    const newAimState = mouse.aimingToggle ? 'toggle' : mouse.aimingHold ? 'hold' : 'none';
    if (store.aimState !== newAimState) {
      store.setAimState(newAimState);
    }

    // 이동 상태 업데이트 (탄퍼짐 계산용)
    const newMoveState = !s.grounded ? 'jump' : isRunning ? 'run' : isMoving ? 'walk' : 'idle';
    if (store.moveState !== newMoveState) {
      store.setMoveState(newMoveState);
    }

    // 발사 상태 업데이트
    if (store.isFiring !== mouse.firing) {
      store.setIsFiring(mouse.firing);
    }

    // 시점 변경 또는 토글 조준 상태 변경 시 풀암 애니메이션 업데이트
    const viewOrAimChanged = s.prevViewMode !== store.viewMode || s.prevToggleAiming !== mouse.aimingToggle;
    if (viewOrAimChanged && s.currentAnim) {
      s.prevViewMode = store.viewMode;
      s.prevToggleAiming = mouse.aimingToggle;
      const armsMap = armsAnimMapRef.current;
      const armsAnimName = showFpsView ? (FPS_ARMS_ANIM_MAP[s.currentAnim] || s.currentAnim) : s.currentAnim;
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

    // 1인칭 모드 또는 토글 조준 시: 풀암 모델을 카메라에 고정
    if (showFpsView && armsGroup.current) {
      const camera = state.camera;
      const transitionDuration = 0.2;  // 전환 시간 (총과 동일)

      // 자세별 기본 오프셋 선택
      let baseOffsetX = ARMS_OFFSET_STANDING_X;
      let baseOffsetY = ARMS_OFFSET_STANDING_Y;
      let baseOffsetZ = ARMS_OFFSET_STANDING_Z;

      if (posture === 'sitting') {
        baseOffsetX = ARMS_OFFSET_SITTING_X;
        baseOffsetY = ARMS_OFFSET_SITTING_Y;
        baseOffsetZ = ARMS_OFFSET_SITTING_Z;
      } else if (posture === 'crawling') {
        baseOffsetX = ARMS_OFFSET_CRAWLING_X;
        baseOffsetY = ARMS_OFFSET_CRAWLING_Y;
        baseOffsetZ = ARMS_OFFSET_CRAWLING_Z;
      }

      // 목표 오프셋 계산 (토글 조준 시 추가 오프셋)
      const targetOffsetX = mouse.aimingToggle ? baseOffsetX + AIM_ARMS_OFFSET_X : baseOffsetX;
      const targetOffsetY = mouse.aimingToggle ? baseOffsetY + AIM_ARMS_OFFSET_Y : baseOffsetY;
      const targetOffsetZ = mouse.aimingToggle ? baseOffsetZ + AIM_ARMS_OFFSET_Z : baseOffsetZ;

      // 목표 위치 계산 (재사용 객체 사용)
      _armsOffset.set(targetOffsetX, targetOffsetY, targetOffsetZ);
      _armsOffset.applyQuaternion(camera.quaternion);
      _armsTargetPos.copy(camera.position).add(_armsOffset);

      // 목표 회전 계산 (재사용 객체 사용)
      _armsTargetQuat.copy(camera.quaternion).multiply(_armsRotation);

      // 토글 전환 중일 때만 부드럽게, 그 외에는 즉시 따라감
      const isTransitioning = mouse.aimTransitionTimer < transitionDuration && mouse.aimTransitionTimer > 0;

      if (isTransitioning) {
        // 전환 중: 부드럽게 이동
        const t = mouse.aimTransitionTimer / transitionDuration;
        armsGroup.current.position.lerp(_armsTargetPos, t * 0.3 + 0.1);
        armsGroup.current.quaternion.slerp(_armsTargetQuat, t * 0.3 + 0.1);
      } else {
        // 평상시/전환 완료: 카메라에 고정 (즉시 따라감)
        armsGroup.current.position.copy(_armsTargetPos);
        armsGroup.current.quaternion.copy(_armsTargetQuat);
      }
    }

    s.bodyAngle = store.bodyAngle;

    // 자세 전환 (C: 앉기, Z: 엎드리기)
    if (keys.c && !s.prevC && s.grounded && !s.transitioning) {
      store.setPosture(posture === 'sitting' ? 'standing' : 'sitting');
    }
    if (keys.z && !s.prevZ && s.grounded && !s.transitioning) {
      store.setPosture(posture === 'crawling' ? 'standing' : 'crawling');
    }

    // 시점 전환 (V: 1인칭/3인칭 토글)
    if (keys.v && !s.prevV) {
      store.setViewMode(store.viewMode === 'firstPerson' ? 'thirdPerson' : 'firstPerson');
    }

    // 재장전 처리
    const reloadTime = RELOAD_TIME[store.weaponType];
    if (store.isReloading) {
      // 재장전 중: 타이머 진행
      s.reloadTimer += dt;
      store.setReloadProgress(Math.min(1, s.reloadTimer / reloadTime));

      if (s.reloadTimer >= reloadTime) {
        // 재장전 완료
        store.reload();
        s.reloadTimer = 0;
        // 이전 애니메이션으로 복귀
        const dir = getDirection(keys.forward, keys.backward, keys.left, keys.right);
        const running = keys.shift && posture === 'standing';
        playAnim(getDirectionalAnim(dir, running, posture, canFire, mouse.aiming));
      }
    } else {
      // 재장전 시작 조건: R키 또는 탄창 비었을 때
      const canReload = s.grounded && !isRunning && !s.transitioning &&
                        store.currentAmmo < 30 && store.reserveAmmo > 0;  // 30은 임시, 무기별로 다름

      if (keys.r && !s.prevR && canReload) {
        store.setIsReloading(true);
        s.reloadTimer = 0;
        // 토글 조준 해제
        if (mouse.aimingToggle) {
          mouse.aimingToggle = false;
          store.setIsToggleAiming(false);
        }
        playAnim('Reload');
      }
    }

    // 점프
    if (keys.space && !s.prevSpace && s.grounded && posture === 'standing' && !s.transitioning) {
      s.velocityY = JUMP_POWER;
      s.grounded = false;
      playAnim('Jump');
    }

    s.prevSpace = keys.space;
    s.prevC = keys.c;
    s.prevV = keys.v;
    s.prevZ = keys.z;
    s.prevR = keys.r;

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
        playAnim(getDirectionalAnim(dir, running, posture, canFire, mouse.aiming));
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
          playAnim(getDirectionalAnim(dir, running, posture, canFire, mouse.aiming));
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

    // 무기 위치 및 visibility 설정 (멀티플레이어 대응)
    const cfg = WEAPON_CONFIGS[store.weaponType];

    // 3인칭용 총 (전체 캐릭터 손에 항상 붙음, 다른 플레이어가 봄)
    if (tpsWeaponRef.current && rightHandBone.current) {
      rightHandBone.current.getWorldPosition(tpsWeaponRef.current.position);
      rightHandBone.current.getWorldQuaternion(tpsWeaponRef.current.quaternion);
      _weaponOffset.set(cfg.position[0], cfg.position[1], cfg.position[2]);
      _weaponOffset.applyQuaternion(tpsWeaponRef.current.quaternion);
      tpsWeaponRef.current.position.add(_weaponOffset);
      tpsWeaponRef.current.visible = !showFpsView;  // 토글 조준 또는 1인칭이면 숨김
    }

    // 1인칭용 총 (풀암 손에 붙음, 나만 봄)
    if (fpsWeaponRef.current && armsRightHandBone.current) {
      // 토글 조준 중일 때: 부드럽게 이동 후 카메라에 고정
      if (showFpsView && mouse.aimingToggle) {
        const camera = state.camera;

        // 반동 처리 (발사 가능할 때만)
        const now = performance.now();
        const fireInterval = 1000 / (cfg.flashSpeed / 2);  // 발사 간격
        if (canFire && now - mouse.lastFireTime > fireInterval) {
          // 반동 추가 (위로 튀고 랜덤 좌우 흔들림)
          mouse.recoilY = Math.random() * 0.02;
          mouse.recoilX = (Math.random() - 0.5) * 0.02;
          mouse.recoilZ = 0.05 + Math.random() * 0.02;
          mouse.lastFireTime = now;
        }

        // 반동 감쇠 (부드럽게 원위치로)
        mouse.recoilX *= 0.85;
        mouse.recoilY *= 0.85;
        mouse.recoilZ *= 0.85;

        // 카메라 로컬 좌표계 기준으로 총 위치 계산 (반동 적용)
        _aimWeaponTarget.set(
          AIM_WEAPON_OFFSET_X + mouse.recoilX,
          AIM_WEAPON_OFFSET_Y + mouse.recoilY,
          AIM_WEAPON_OFFSET_Z + mouse.recoilZ
        );
        _aimWeaponTarget.applyQuaternion(camera.quaternion);
        _aimWeaponTarget.add(camera.position);

        // 총 각도 계산 (카메라 회전 + 오프셋 회전 + 반동 회전)
        const recoilRotX = AIM_WEAPON_ROT_X - mouse.recoilY * 2;  // 위로 튀면 총구가 위로
        _recoilEuler.set(recoilRotX, AIM_WEAPON_ROT_Y, AIM_WEAPON_ROT_Z);
        _aimRotationOffset.setFromEuler(_recoilEuler);
        _aimWeaponQuat.copy(camera.quaternion).multiply(_aimRotationOffset);

        // 전환 타이머 업데이트
        mouse.aimTransitionTimer += dt;
        const transitionDuration = 0.2;  // 전환 시간 (초)

        if (mouse.aimTransitionTimer >= transitionDuration) {
          // 전환 완료: 카메라에 고정 (즉시 따라감)
          fpsWeaponRef.current.position.copy(_aimWeaponTarget);
          fpsWeaponRef.current.quaternion.copy(_aimWeaponQuat);
        } else {
          // 전환 중: 부드럽게 이동
          const t = mouse.aimTransitionTimer / transitionDuration;
          fpsWeaponRef.current.position.lerp(_aimWeaponTarget, t * 0.3);
          fpsWeaponRef.current.quaternion.slerp(_aimWeaponQuat, t * 0.3);
        }
      } else {
        // 일반 상태: 풀암 손에 붙음
        armsRightHandBone.current.getWorldPosition(fpsWeaponRef.current.position);
        armsRightHandBone.current.getWorldQuaternion(fpsWeaponRef.current.quaternion);
        _weaponOffset.set(cfg.position[0], cfg.position[1], cfg.position[2]);
        _weaponOffset.applyQuaternion(fpsWeaponRef.current.quaternion);
        fpsWeaponRef.current.position.add(_weaponOffset);
      }
      fpsWeaponRef.current.visible = showFpsView;  // 토글 조준 또는 1인칭이면 표시
    }

    // 총구 플래시 (1인칭/3인칭 모두) - 탄약 있고 재장전 중 아닐 때만
    if (canFire) {
      s.muzzleTimer += dt;
      const cfg = WEAPON_CONFIGS[store.weaponType];
      const flashOn = Math.sin(s.muzzleTimer * cfg.flashSpeed) > 0;
      const flashIntensity = flashOn ? 5 : 0;
      const spriteScale = flashOn ? 30 + Math.random() * 10 : 0;  // 랜덤 크기로 자연스럽게

      // 현재 시점에 맞는 플래시만 활성화
      if (muzzleFlashRef.current) {
        muzzleFlashRef.current.intensity = showFpsView ? flashIntensity : 0;
      }
      if (tpsMuzzleFlashRef.current) {
        tpsMuzzleFlashRef.current.intensity = showFpsView ? 0 : flashIntensity;
      }

      // 스프라이트 (시각적 플래시)
      if (fpsMuzzleSpriteRef.current) {
        const scale = showFpsView ? spriteScale : 0;
        fpsMuzzleSpriteRef.current.scale.set(scale, scale, 1);
        fpsMuzzleSpriteRef.current.material.rotation = Math.random() * Math.PI * 2;  // 랜덤 회전
      }
      if (tpsMuzzleSpriteRef.current) {
        const scale = showFpsView ? 0 : spriteScale;
        tpsMuzzleSpriteRef.current.scale.set(scale, scale, 1);
        tpsMuzzleSpriteRef.current.material.rotation = Math.random() * Math.PI * 2;
      }
    } else {
      if (muzzleFlashRef.current) muzzleFlashRef.current.intensity = 0;
      if (tpsMuzzleFlashRef.current) tpsMuzzleFlashRef.current.intensity = 0;
      if (fpsMuzzleSpriteRef.current) fpsMuzzleSpriteRef.current.scale.set(0, 0, 1);
      if (tpsMuzzleSpriteRef.current) tpsMuzzleSpriteRef.current.scale.set(0, 0, 1);
      s.muzzleTimer = 0;
    }

    // 총구 월드 위치 업데이트 (BulletEffects에서 사용)
    const muzzleSprite = showFpsView ? fpsMuzzleSpriteRef.current : tpsMuzzleSpriteRef.current;
    if (muzzleSprite) {
      muzzleSprite.getWorldPosition(_muzzleWorldPos);
      store.setMuzzleWorldPos([_muzzleWorldPos.x, _muzzleWorldPos.y, _muzzleWorldPos.z]);
    }
  });

  // 무기 모델 (무기 변경시에만 재생성)
  const weaponFbxMap = useMemo(() => ({
    rifle: rifleFbx,
    shotgun: shotgunFbx,
    sniper: sniperFbx,
  }), [rifleFbx, shotgunFbx, sniperFbx]);

  // 3인칭용 무기 모델 (다른 플레이어가 봄)
  const tpsWeaponModel = useMemo(() => {
    const fbx = weaponFbxMap[weaponType];
    const cfg = WEAPON_CONFIGS[weaponType];
    const model = fbx.clone();
    model.traverse((child) => {
      child.userData.isPlayer = true;  // 레이캐스트 제외용
      if (child instanceof THREE.Mesh) child.material = GUN_MATERIAL;
    });
    model.rotation.copy(cfg.rotation);
    return model;
  }, [weaponFbxMap, weaponType]);

  // 1인칭용 무기 모델 (나만 봄)
  const fpsWeaponModel = useMemo(() => {
    const fbx = weaponFbxMap[weaponType];
    const cfg = WEAPON_CONFIGS[weaponType];
    const model = fbx.clone();
    model.traverse((child) => {
      child.userData.isPlayer = true;  // 레이캐스트 제외용
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
      {/* 3인칭용 무기 (전체 캐릭터 손, 다른 플레이어가 봄) */}
      <group ref={tpsWeaponRef} scale={0.01}>
        <primitive object={tpsWeaponModel} />
        <pointLight
          ref={tpsMuzzleFlashRef}
          position={flashPos}
          color={0xffaa00}
          intensity={0}
          distance={3}
        />
        <sprite ref={tpsMuzzleSpriteRef} position={flashPos} scale={[0, 0, 1]}>
          <primitive object={MUZZLE_FLASH_MATERIAL.clone()} attach="material" />
        </sprite>
      </group>
      {/* 1인칭용 무기 (풀암 손, 나만 봄) */}
      <group ref={fpsWeaponRef} scale={0.01}>
        <primitive object={fpsWeaponModel} />
        <pointLight
          ref={muzzleFlashRef}
          position={flashPos}
          color={0xffaa00}
          intensity={0}
          distance={3}
        />
        <sprite ref={fpsMuzzleSpriteRef} position={flashPos} scale={[0, 0, 1]}>
          <primitive object={MUZZLE_FLASH_MATERIAL.clone()} attach="material" />
        </sprite>
      </group>
    </>
  );
}

useGLTF.preload('/Untitled1.glb');
useGLTF.preload('/Onlyarms.glb');
useFBX.preload('/Rifle.fbx');
useFBX.preload('/Shotgun.fbx');
useFBX.preload('/Sniper.fbx');
