import { create } from 'zustand'

export type Posture = 'standing' | 'sitting' | 'crawling'
export type RaceStatus = 'waiting' | 'playing' | 'finished'

interface GameStore {
  // 플레이어 상태
  posture: Posture
  animation: string
  playerPos: [number, number, number]

  // 디버그 상태
  isGrounded: boolean
  canJump: boolean

  // 카메라 상태
  cameraAngle: number
  cameraPitch: number
  cameraDistance: number

  // 레이스 게임 상태
  raceStatus: RaceStatus
  raceStartTime: number | null  // 게임 시작 시간 (ms)
  raceFinishTime: number | null // 완주 시간 (ms, startTime 기준)
  checkpointsPassed: number     // 통과한 체크포인트 수
  lastCheckpointPos: [number, number, number] | null  // 마지막 체크포인트 위치
  passedCheckpointIds: Set<string>  // 통과한 체크포인트 ID들

  // 액션
  setPosture: (p: Posture) => void
  setAnimation: (a: string) => void
  setPlayerPos: (p: [number, number, number]) => void
  setGroundedState: (grounded: boolean, canJump: boolean) => void
  setCameraAngle: (a: number) => void
  setCameraPitch: (p: number) => void
  setCameraDistance: (d: number) => void

  // 레이스 액션
  startRace: () => void
  finishRace: () => void
  passCheckpoint: (id: string, position: [number, number, number]) => void
  setRespawnPos: (pos: [number, number, number]) => void

  // 리셋
  reset: () => void

  // 게임 재시작 요청 (플레이어 위치 리셋)
  restartRequested: boolean
  requestRestart: () => void
  clearRestartRequest: () => void
}

const initialState = {
  posture: 'standing' as Posture,
  animation: 'Idle',
  playerPos: [0, 0, 0] as [number, number, number],
  isGrounded: true,
  canJump: true,
  cameraAngle: 0,
  cameraPitch: 0.3,
  cameraDistance: 8,
  raceStatus: 'waiting' as RaceStatus,
  raceStartTime: null as number | null,
  raceFinishTime: null as number | null,
  checkpointsPassed: 0,
  lastCheckpointPos: null as [number, number, number] | null,
  passedCheckpointIds: new Set<string>(),
  restartRequested: false,
}

export const useGameStore = create<GameStore>((set, get) => ({
  ...initialState,

  setPosture: (posture) => set({ posture }),
  setAnimation: (animation) => set({ animation }),
  setPlayerPos: (playerPos) => set({ playerPos }),
  setGroundedState: (isGrounded, canJump) => set({ isGrounded, canJump }),
  setCameraAngle: (cameraAngle) => set({ cameraAngle }),
  setCameraPitch: (cameraPitch) => set({ cameraPitch }),
  setCameraDistance: (cameraDistance) => set({ cameraDistance }),

  startRace: () => set({
    raceStatus: 'playing',
    raceStartTime: Date.now(),
    raceFinishTime: null,
    checkpointsPassed: 0,
    passedCheckpointIds: new Set<string>(),
  }),

  finishRace: () => {
    const { raceStartTime } = get()
    if (raceStartTime) {
      set({
        raceStatus: 'finished',
        raceFinishTime: Date.now() - raceStartTime,
      })
    }
  },

  passCheckpoint: (id: string, position: [number, number, number]) => {
    const { passedCheckpointIds } = get()
    if (passedCheckpointIds.has(id)) return // 이미 통과한 체크포인트

    const newPassed = new Set(passedCheckpointIds)
    newPassed.add(id)
    set({
      checkpointsPassed: newPassed.size,
      lastCheckpointPos: position,
      passedCheckpointIds: newPassed,
    })
  },

  setRespawnPos: (pos: [number, number, number]) => set({
    lastCheckpointPos: pos,
  }),

  reset: () => set(initialState),

  requestRestart: () => set({ restartRequested: true }),
  clearRestartRequest: () => set({ restartRequested: false }),
}))
