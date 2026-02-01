import { create } from 'zustand'

export type Posture = 'standing' | 'sitting' | 'crawling'

interface GameStore {
  // 플레이어 상태
  posture: Posture
  animation: string
  playerPos: [number, number, number]

  // 카메라 상태
  cameraAngle: number
  cameraPitch: number
  cameraDistance: number

  // 액션
  setPosture: (p: Posture) => void
  setAnimation: (a: string) => void
  setPlayerPos: (p: [number, number, number]) => void
  setCameraAngle: (a: number) => void
  setCameraPitch: (p: number) => void
  setCameraDistance: (d: number) => void

  // 리셋
  reset: () => void
}

const initialState = {
  posture: 'standing' as Posture,
  animation: 'Idle',
  playerPos: [0, 0, 0] as [number, number, number],
  cameraAngle: 0,
  cameraPitch: 0.3,
  cameraDistance: 8,
}

export const useGameStore = create<GameStore>((set) => ({
  ...initialState,

  setPosture: (posture) => set({ posture }),
  setAnimation: (animation) => set({ animation }),
  setPlayerPos: (playerPos) => set({ playerPos }),
  setCameraAngle: (cameraAngle) => set({ cameraAngle }),
  setCameraPitch: (cameraPitch) => set({ cameraPitch }),
  setCameraDistance: (cameraDistance) => set({ cameraDistance }),

  reset: () => set(initialState),
}))
