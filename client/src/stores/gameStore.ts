import { create } from 'zustand'

export type Posture = 'standing' | 'sitting' | 'crawling'
export type RaceStatus = 'waiting' | 'playing' | 'finished'

// ============ 슈터 타입 ============
export type WeaponType = 'rifle' | 'shotgun' | 'sniper'
export type ViewMode = 'tps' | 'fps'
export type AimState = 'none' | 'hold' | 'toggle'
export type MoveState = 'idle' | 'walk' | 'run'

// 무기별 설정
export const WEAPON_CONFIG = {
  rifle: {
    name: 'Rifle',
    model: '/Rifle.fbx',
    damage: 25,
    fireRate: 0.1,        // 초 간격
    maxAmmo: 30,
    reserveAmmo: 120,
    reloadTime: 2.0,
    spreadBase: 0.02,
    spreadMax: 0.08,
    spreadPerShot: 0.01,
    spreadRecovery: 0.05,
    recoilPitch: 0.015,
    recoilRecovery: 0.06,
    tracerSpeed: 200,
    tracerColor: '#ffdd44',
    muzzleFlashScale: 0.3,
    muzzleFlashIntensity: 3,
    aimFov: 45,
    weaponScale: [0.010, 0.010, 0.010] as [number, number, number],
    weaponPosition: [0, 0, 0] as [number, number, number],
    weaponRotation: [0, 0, 0] as [number, number, number],
  },
  shotgun: {
    name: 'Shotgun',
    model: '/Shotgun.fbx',
    damage: 15,
    fireRate: 0.8,
    maxAmmo: 8,
    reserveAmmo: 32,
    reloadTime: 2.5,
    spreadBase: 0.06,
    spreadMax: 0.15,
    spreadPerShot: 0.03,
    spreadRecovery: 0.04,
    recoilPitch: 0.04,
    recoilRecovery: 0.04,
    tracerSpeed: 150,
    tracerColor: '#ff8844',
    muzzleFlashScale: 0.5,
    muzzleFlashIntensity: 5,
    pelletsPerShot: 8,
    aimFov: 50,
    weaponScale: [0.010, 0.010, 0.010] as [number, number, number],
    weaponPosition: [0, 0, 0] as [number, number, number],
    weaponRotation: [0, 0, 0] as [number, number, number],
  },
  sniper: {
    name: 'Sniper',
    model: '/Sniper.fbx',
    damage: 100,
    fireRate: 1.5,
    maxAmmo: 5,
    reserveAmmo: 20,
    reloadTime: 3.0,
    spreadBase: 0.005,
    spreadMax: 0.03,
    spreadPerShot: 0.02,
    spreadRecovery: 0.02,
    recoilPitch: 0.06,
    recoilRecovery: 0.03,
    tracerSpeed: 300,
    tracerColor: '#44ddff',
    muzzleFlashScale: 0.4,
    muzzleFlashIntensity: 4,
    aimFov: 20,
    weaponScale: [0.010, 0.010, 0.010] as [number, number, number],
    weaponPosition: [0, 0, 0] as [number, number, number],
    weaponRotation: [0, 0, 0] as [number, number, number],
  },
} as const

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

  // ============ 슈터 상태 ============
  weaponType: WeaponType
  viewMode: ViewMode
  bodyAngle: number           // 캐릭터 몸 회전 (Y축)
  lookDirection: [number, number, number]  // 카메라가 바라보는 방향 벡터
  aimState: AimState
  moveState: MoveState
  spreadAccum: number         // 누적 탄퍼짐
  recoilPitch: number         // 반동 pitch
  currentAmmo: number
  reserveAmmo: number
  isReloading: boolean
  reloadProgress: number      // 0~1
  isFiring: boolean
  isToggleAiming: boolean     // 토글 조준 상태
  muzzleWorldPos: [number, number, number]  // 총구 월드 위치
  currentFov: number          // 현재 FOV
  health: number
  isDead: boolean
  kills: number
  deaths: number

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

  // 슈터 액션
  setWeaponType: (w: WeaponType) => void
  setViewMode: (v: ViewMode) => void
  setBodyAngle: (a: number) => void
  setLookDirection: (d: [number, number, number]) => void
  setAimState: (s: AimState) => void
  setMoveState: (s: MoveState) => void
  setSpreadAccum: (s: number) => void
  setRecoilPitch: (r: number) => void
  setIsFiring: (f: boolean) => void
  setIsToggleAiming: (a: boolean) => void
  setMuzzleWorldPos: (p: [number, number, number]) => void
  setCurrentFov: (f: number) => void
  setHealth: (h: number) => void
  setIsDead: (d: boolean) => void
  addKill: () => void
  addDeath: () => void
  consumeAmmo: () => boolean      // 탄약 소모, 성공 여부 반환
  startReload: () => void
  updateReloadProgress: (progress: number) => void
  finishReload: () => void
  resetAmmo: (weaponType?: WeaponType) => void

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

  // 슈터 초기 상태
  weaponType: 'rifle' as WeaponType,
  viewMode: 'tps' as ViewMode,
  bodyAngle: 0,
  lookDirection: [0, 0, -1] as [number, number, number],
  aimState: 'none' as AimState,
  moveState: 'idle' as MoveState,
  spreadAccum: 0,
  recoilPitch: 0,
  currentAmmo: WEAPON_CONFIG.rifle.maxAmmo,
  reserveAmmo: WEAPON_CONFIG.rifle.reserveAmmo,
  isReloading: false,
  reloadProgress: 0,
  isFiring: false,
  isToggleAiming: false,
  muzzleWorldPos: [0, 0, 0] as [number, number, number],
  currentFov: 60,
  health: 100,
  isDead: false,
  kills: 0,
  deaths: 0,
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

  // ============ 슈터 액션 ============
  setWeaponType: (weaponType) => set({ weaponType }),
  setViewMode: (viewMode) => set({ viewMode }),
  setBodyAngle: (bodyAngle) => set({ bodyAngle }),
  setLookDirection: (lookDirection) => set({ lookDirection }),
  setAimState: (aimState) => set({ aimState }),
  setMoveState: (moveState) => set({ moveState }),
  setSpreadAccum: (spreadAccum) => set({ spreadAccum }),
  setRecoilPitch: (recoilPitch) => set({ recoilPitch }),
  setIsFiring: (isFiring) => set({ isFiring }),
  setIsToggleAiming: (isToggleAiming) => set({ isToggleAiming }),
  setMuzzleWorldPos: (muzzleWorldPos) => set({ muzzleWorldPos }),
  setCurrentFov: (currentFov) => set({ currentFov }),
  setHealth: (health) => set({ health }),
  setIsDead: (isDead) => set({ isDead }),
  addKill: () => set(state => ({ kills: state.kills + 1 })),
  addDeath: () => set(state => ({ deaths: state.deaths + 1 })),

  consumeAmmo: () => {
    const { currentAmmo, isReloading } = get()
    if (isReloading || currentAmmo <= 0) return false
    set({ currentAmmo: currentAmmo - 1 })
    return true
  },

  startReload: () => {
    const { currentAmmo, reserveAmmo, isReloading, weaponType } = get()
    const config = WEAPON_CONFIG[weaponType]
    if (isReloading || reserveAmmo <= 0 || currentAmmo >= config.maxAmmo) return
    set({ isReloading: true, reloadProgress: 0 })
  },

  updateReloadProgress: (progress) => set({ reloadProgress: progress }),

  finishReload: () => {
    const { currentAmmo, reserveAmmo, weaponType } = get()
    const config = WEAPON_CONFIG[weaponType]
    const needed = config.maxAmmo - currentAmmo
    const toLoad = Math.min(needed, reserveAmmo)
    set({
      currentAmmo: currentAmmo + toLoad,
      reserveAmmo: reserveAmmo - toLoad,
      isReloading: false,
      reloadProgress: 0,
    })
  },

  resetAmmo: (wt?: WeaponType) => {
    const weaponType = wt || get().weaponType
    const config = WEAPON_CONFIG[weaponType]
    set({
      currentAmmo: config.maxAmmo,
      reserveAmmo: config.reserveAmmo,
      isReloading: false,
      reloadProgress: 0,
    })
  },

  reset: () => set(initialState),

  requestRestart: () => set({ restartRequested: true }),
  clearRestartRequest: () => set({ restartRequested: false }),
}))
