import { create } from 'zustand';

type Posture = 'standing' | 'sitting' | 'crawling';
type GameMode = 'running' | 'gunGame';
type CameraMode = 'follow' | 'free';
type ViewMode = 'firstPerson' | 'thirdPerson';
type WeaponType = 'rifle' | 'shotgun' | 'sniper';
type AimState = 'none' | 'hold' | 'toggle';
type MoveState = 'idle' | 'walk' | 'run' | 'jump';

// 무기별 탄약 설정
const AMMO_CONFIG = {
  rifle: { magazine: 30, reserve: 90, reloadTime: 2.0 },
  shotgun: { magazine: 8, reserve: 24, reloadTime: 2.5 },
  sniper: { magazine: 5, reserve: 15, reloadTime: 3.0 },
};

interface GameStore {
  posture: Posture;
  animation: string;
  cameraAngle: number;
  playerPos: [number, number, number];
  gameMode: GameMode;
  bodyAngle: number;
  lookDirection: number;
  cameraMode: CameraMode;
  viewMode: ViewMode;
  cameraPitch: number;
  cameraDistance: number;
  weaponType: WeaponType;
  isToggleAiming: boolean;  // 토글 조준 상태 (1인칭/3인칭 공통)
  muzzleWorldPos: [number, number, number];  // 총구 월드 위치
  currentFov: number;  // 현재 카메라 FOV (스코프 줌 등)
  // 탄퍼짐/반동 시스템
  aimState: AimState;  // 조준 상태
  moveState: MoveState;  // 이동 상태
  spreadAccum: number;  // 연사 누적 퍼짐 (도)
  recoilPitch: number;  // 반동으로 인한 pitch 오프셋
  isFiring: boolean;  // 발사 중 여부
  // 탄약 시스템
  currentAmmo: number;  // 현재 탄창
  reserveAmmo: number;  // 예비 탄약
  isReloading: boolean;  // 재장전 중
  reloadProgress: number;  // 재장전 진행도 (0~1)
  setCurrentAmmo: (v: number) => void;
  setReserveAmmo: (v: number) => void;
  setIsReloading: (b: boolean) => void;
  setReloadProgress: (v: number) => void;
  consumeAmmo: () => boolean;  // 탄약 소모 (성공 여부 반환)
  reload: () => void;  // 재장전 완료 처리
  resetAmmo: (weaponType: WeaponType) => void;  // 무기 변경 시 탄약 초기화
  setAimState: (s: AimState) => void;
  setMoveState: (s: MoveState) => void;
  setSpreadAccum: (v: number) => void;
  setRecoilPitch: (v: number) => void;
  setIsFiring: (b: boolean) => void;
  setPosture: (p: Posture) => void;
  setAnimation: (a: string) => void;
  setCameraAngle: (a: number) => void;
  setPlayerPos: (p: [number, number, number]) => void;
  setGameMode: (m: GameMode) => void;
  setBodyAngle: (a: number) => void;
  setLookDirection: (a: number) => void;
  setCameraMode: (m: CameraMode) => void;
  setViewMode: (m: ViewMode) => void;
  setCameraPitch: (p: number) => void;
  setCameraDistance: (d: number) => void;
  setWeaponType: (w: WeaponType) => void;
  setIsToggleAiming: (b: boolean) => void;
  setMuzzleWorldPos: (p: [number, number, number]) => void;
  setCurrentFov: (fov: number) => void;
}

export const useGameStore = create<GameStore>((set) => ({
  posture: 'standing',
  animation: 'Idle',
  cameraAngle: 4.715,
  playerPos: [0, 0, 0],
  gameMode: 'running',
  bodyAngle: 4.715,
  lookDirection: 4.715,
  cameraMode: 'follow',
  viewMode: 'thirdPerson',
  cameraPitch: 0.3,
  cameraDistance: 8,
  weaponType: 'rifle',
  isToggleAiming: false,
  muzzleWorldPos: [0, 0, 0],
  currentFov: 60,
  // 탄퍼짐/반동 시스템
  aimState: 'none',
  moveState: 'idle',
  spreadAccum: 0,
  recoilPitch: 0,
  isFiring: false,
  // 탄약 시스템
  currentAmmo: AMMO_CONFIG.rifle.magazine,
  reserveAmmo: AMMO_CONFIG.rifle.reserve,
  isReloading: false,
  reloadProgress: 0,
  setCurrentAmmo: (currentAmmo) => set({ currentAmmo }),
  setReserveAmmo: (reserveAmmo) => set({ reserveAmmo }),
  setIsReloading: (isReloading) => set({ isReloading }),
  setReloadProgress: (reloadProgress) => set({ reloadProgress }),
  consumeAmmo: () => {
    const state = useGameStore.getState();
    if (state.currentAmmo > 0 && !state.isReloading) {
      set({ currentAmmo: state.currentAmmo - 1 });
      return true;
    }
    return false;
  },
  reload: () => {
    const state = useGameStore.getState();
    const config = AMMO_CONFIG[state.weaponType];
    const needed = config.magazine - state.currentAmmo;
    const available = Math.min(needed, state.reserveAmmo);
    set({
      currentAmmo: state.currentAmmo + available,
      reserveAmmo: state.reserveAmmo - available,
      isReloading: false,
      reloadProgress: 0,
    });
  },
  resetAmmo: (weaponType) => {
    const config = AMMO_CONFIG[weaponType];
    set({
      currentAmmo: config.magazine,
      reserveAmmo: config.reserve,
      isReloading: false,
      reloadProgress: 0,
    });
  },
  setAimState: (aimState) => set({ aimState }),
  setMoveState: (moveState) => set({ moveState }),
  setSpreadAccum: (spreadAccum) => set({ spreadAccum }),
  setRecoilPitch: (recoilPitch) => set({ recoilPitch }),
  setIsFiring: (isFiring) => set({ isFiring }),
  setPosture: (posture) => set({ posture }),
  setAnimation: (animation) => set({ animation }),
  setCameraAngle: (cameraAngle) => set({ cameraAngle }),
  setPlayerPos: (playerPos) => set({ playerPos }),
  setGameMode: (gameMode) => set({ gameMode }),
  setBodyAngle: (bodyAngle) => set({ bodyAngle }),
  setLookDirection: (lookDirection) => set({ lookDirection }),
  setCameraMode: (cameraMode) => set({ cameraMode }),
  setViewMode: (viewMode) => set({ viewMode }),
  setCameraPitch: (cameraPitch) => set({ cameraPitch }),
  setCameraDistance: (cameraDistance) => set({ cameraDistance }),
  setWeaponType: (weaponType) => set({ weaponType }),
  setIsToggleAiming: (isToggleAiming) => set({ isToggleAiming }),
  setMuzzleWorldPos: (muzzleWorldPos) => set({ muzzleWorldPos }),
  setCurrentFov: (currentFov) => set({ currentFov }),
}));
