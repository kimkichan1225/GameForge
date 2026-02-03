import { create } from 'zustand';

type Posture = 'standing' | 'sitting' | 'crawling';
type GameMode = 'running' | 'gunGame';
type CameraMode = 'follow' | 'free';
type WeaponType = 'rifle' | 'shotgun' | 'sniper';

interface GameStore {
  posture: Posture;
  animation: string;
  cameraAngle: number;
  playerPos: [number, number, number];
  gameMode: GameMode;
  bodyAngle: number;
  lookDirection: number;
  cameraMode: CameraMode;
  cameraPitch: number;
  cameraDistance: number;
  weaponType: WeaponType;
  setPosture: (p: Posture) => void;
  setAnimation: (a: string) => void;
  setCameraAngle: (a: number) => void;
  setPlayerPos: (p: [number, number, number]) => void;
  setGameMode: (m: GameMode) => void;
  setBodyAngle: (a: number) => void;
  setLookDirection: (a: number) => void;
  setCameraMode: (m: CameraMode) => void;
  setCameraPitch: (p: number) => void;
  setCameraDistance: (d: number) => void;
  setWeaponType: (w: WeaponType) => void;
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
  cameraPitch: 0.3,
  cameraDistance: 8,
  weaponType: 'rifle',
  setPosture: (posture) => set({ posture }),
  setAnimation: (animation) => set({ animation }),
  setCameraAngle: (cameraAngle) => set({ cameraAngle }),
  setPlayerPos: (playerPos) => set({ playerPos }),
  setGameMode: (gameMode) => set({ gameMode }),
  setBodyAngle: (bodyAngle) => set({ bodyAngle }),
  setLookDirection: (lookDirection) => set({ lookDirection }),
  setCameraMode: (cameraMode) => set({ cameraMode }),
  setCameraPitch: (cameraPitch) => set({ cameraPitch }),
  setCameraDistance: (cameraDistance) => set({ cameraDistance }),
  setWeaponType: (weaponType) => set({ weaponType }),
}));
