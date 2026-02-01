import { create } from 'zustand'

export type MapMode = 'race' | 'shooter'
export type GizmoMode = 'translate' | 'rotate' | 'scale'

// 슈터 서브모드: 팀전, 점령전, 개인전
export type ShooterSubMode = 'team' | 'domination' | 'ffa'

export interface MapObject {
  id: string
  type: 'box' | 'cylinder' | 'sphere' | 'plane' | 'ramp'
  position: [number, number, number]
  rotation: [number, number, number]
  scale: [number, number, number]
  color: string
  name: string
}

// 마커 타입 정의
// - Race: spawn, checkpoint, finish, killzone
// - Shooter Team: spawn_a, spawn_b
// - Shooter Domination: spawn_a, spawn_b, capture_point
// - Shooter FFA: spawn
// - 공통: killzone (모든 모드에서 사용 가능)
export type MarkerType =
  | 'spawn' | 'checkpoint' | 'finish' | 'killzone'  // Race + 공통
  | 'spawn_a' | 'spawn_b'              // Shooter Team/Domination
  | 'capture_point'                     // Shooter Domination

export interface MapMarker {
  id: string
  type: MarkerType
  position: [number, number, number]
  rotation: [number, number, number]
}

export interface MapData {
  id: string
  name: string
  mode: MapMode
  shooterSubMode?: ShooterSubMode  // 슈터 모드일 때 서브모드
  objects: MapObject[]
  markers: MapMarker[]
  createdAt: number
  updatedAt: number
}

interface EditorState {
  // 맵 정보
  mapName: string
  mapMode: MapMode
  shooterSubMode: ShooterSubMode  // 슈터 서브모드

  // 오브젝트
  objects: MapObject[]
  markers: MapMarker[]

  // 선택
  selectedId: string | null

  // 기즈모
  gizmoMode: GizmoMode
  gridSnap: boolean
  gridSize: number

  // 카메라
  cameraPosition: [number, number, number]
  cameraTarget: [number, number, number]

  // 테스트 플레이
  isTestPlaying: boolean

  // 액션
  setMapName: (name: string) => void
  setMapMode: (mode: MapMode) => void
  setShooterSubMode: (subMode: ShooterSubMode) => void

  addObject: (type: MapObject['type']) => void
  updateObject: (id: string, updates: Partial<MapObject>) => void
  removeObject: (id: string) => void

  addMarker: (type: MarkerType) => void
  updateMarker: (id: string, updates: Partial<MapMarker>) => void
  removeMarker: (id: string) => void

  setSelectedId: (id: string | null) => void
  setGizmoMode: (mode: GizmoMode) => void
  setGridSnap: (enabled: boolean) => void
  setGridSize: (size: number) => void

  setCameraPosition: (pos: [number, number, number]) => void
  setCameraTarget: (target: [number, number, number]) => void

  setTestPlaying: (playing: boolean) => void

  // 설치 가능한 오브젝트/마커
  currentPlaceable: PlaceableType
  setCurrentPlaceable: (type: PlaceableType) => void
  placeObjectAt: (position: [number, number, number], isAdjacent?: boolean, yaw?: number) => void

  // 마커 배치 (6-9 키)
  currentMarker: MarkerType | null
  setCurrentMarker: (type: MarkerType | null) => void
  placeMarkerAt: (position: [number, number, number], yaw?: number) => void

  // 맵 작업
  newMap: () => void
  loadMap: (data: MapData) => void
  exportMap: () => MapData

  // 맵 검증
  validateMap: () => { valid: boolean; missingMarkers: string[] }

  // 선택된 오브젝트 복제
  duplicateSelected: () => void
}

const generateId = () => Math.random().toString(36).substr(2, 9)

const defaultColors = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#ffeaa7', '#dfe6e9', '#a29bfe', '#fd79a8']
const getRandomColor = () => defaultColors[Math.floor(Math.random() * defaultColors.length)]

export type PlaceableType = 'box' | 'cylinder' | 'sphere' | 'plane' | 'ramp'

const initialState = {
  mapName: '새 맵',
  mapMode: 'race' as MapMode,
  shooterSubMode: 'team' as ShooterSubMode,  // 기본 슈터 서브모드
  objects: [] as MapObject[],
  markers: [] as MapMarker[],
  selectedId: null as string | null,
  gizmoMode: 'translate' as GizmoMode,
  gridSnap: true,
  gridSize: 1,
  cameraPosition: [10, 10, 10] as [number, number, number],
  cameraTarget: [0, 0, 0] as [number, number, number],
  isTestPlaying: false,
  // 설치할 오브젝트 타입 (1-5 키)
  currentPlaceable: 'box' as PlaceableType,
  // 설치할 마커 타입 (6-9 키), null이면 오브젝트 모드
  currentMarker: null as MarkerType | null,
}

export const useEditorStore = create<EditorState>((set, get) => ({
  ...initialState,

  setMapName: (name) => set({ mapName: name }),
  // 모드 변경 시 마커 초기화
  setMapMode: (mode) => set({ mapMode: mode, markers: [], selectedId: null, currentMarker: null }),
  setShooterSubMode: (subMode) => set({ shooterSubMode: subMode, markers: [], selectedId: null, currentMarker: null }),

  addObject: (type) => {
    const id = generateId()
    const newObject: MapObject = {
      id,
      type,
      position: [0, type === 'plane' ? 0 : 0.5, 0],
      rotation: [0, 0, 0],
      scale: type === 'plane' ? [10, 1, 10] : [1, 1, 1],
      color: getRandomColor(),
      name: `${type}_${id.slice(0, 4)}`,
    }
    set(state => ({
      objects: [...state.objects, newObject],
      selectedId: id,
    }))
  },

  updateObject: (id, updates) => {
    set(state => ({
      objects: state.objects.map(obj =>
        obj.id === id ? { ...obj, ...updates } : obj
      ),
    }))
  },

  removeObject: (id) => {
    set(state => ({
      objects: state.objects.filter(obj => obj.id !== id),
      selectedId: state.selectedId === id ? null : state.selectedId,
    }))
  },

  addMarker: (type) => {
    const id = generateId()
    const newMarker: MapMarker = {
      id,
      type,
      position: [0, 0, 0],
      rotation: [0, 0, 0],
    }
    set(state => ({
      markers: [...state.markers, newMarker],
      selectedId: `marker_${id}`,
    }))
  },

  updateMarker: (id, updates) => {
    set(state => ({
      markers: state.markers.map(marker =>
        marker.id === id ? { ...marker, ...updates } : marker
      ),
    }))
  },

  removeMarker: (id) => {
    set(state => ({
      markers: state.markers.filter(marker => marker.id !== id),
      selectedId: state.selectedId === `marker_${id}` ? null : state.selectedId,
    }))
  },

  setSelectedId: (id) => set({ selectedId: id }),
  setGizmoMode: (mode) => set({ gizmoMode: mode }),
  setGridSnap: (enabled) => set({ gridSnap: enabled }),
  setGridSize: (size) => set({ gridSize: size }),

  setCameraPosition: (pos) => set({ cameraPosition: pos }),
  setCameraTarget: (target) => set({ cameraTarget: target }),

  setTestPlaying: (playing) => set({ isTestPlaying: playing }),

  setCurrentPlaceable: (type) => set({ currentPlaceable: type, currentMarker: null }),

  setCurrentMarker: (type) => set({ currentMarker: type }),

  placeMarkerAt: (position, yaw = 0) => {
    const state = get()
    if (!state.currentMarker) return

    // 1개만 설치 가능한 마커 타입 결정 (모드에 따라 다름)
    const getSingletonMarkers = (): MarkerType[] => {
      if (state.mapMode === 'race') {
        // 레이스: spawn, finish는 1개만 (checkpoint는 여러개 가능)
        return ['spawn', 'finish']
      }
      // 슈터: 팀전/점령전은 각 마커 1개씩, 개인전은 spawn 무제한
      if (state.shooterSubMode === 'ffa') {
        return [] // 개인전은 spawn 여러개 가능
      }
      return ['spawn_a', 'spawn_b', 'capture_point']
    }

    const singletonMarkers = getSingletonMarkers()

    // 이미 같은 타입의 마커가 있으면 설치 안함
    if (singletonMarkers.includes(state.currentMarker)) {
      const exists = state.markers.some(m => m.type === state.currentMarker)
      if (exists) return
    }

    const id = generateId()
    // 0.5 단위로 스냅
    const snap = (val: number) => Math.round(val * 2) / 2
    // yaw를 90도 단위로 스냅
    const snappedYaw = Math.round(yaw / (Math.PI / 2)) * (Math.PI / 2)

    const newMarker: MapMarker = {
      id,
      type: state.currentMarker,
      position: [snap(position[0]), snap(position[1]), snap(position[2])],
      rotation: [0, snappedYaw, 0],
    }

    set(s => ({
      markers: [...s.markers, newMarker],
      selectedId: `marker_${id}`,
    }))
  },

  placeObjectAt: (position, isAdjacent = false, yaw = 0) => {
    const state = get()
    const id = generateId()
    const type = state.currentPlaceable

    // 0.5 단위로 스냅
    const snap = (val: number) => Math.round(val * 2) / 2

    // 오브젝트 높이 오프셋 (중심 피벗 기준 절반 높이)
    const getHeightOffset = (objType: PlaceableType) => {
      switch (objType) {
        case 'plane': return 0
        case 'sphere': return 0.5
        case 'box': return 0.5
        case 'cylinder': return 0.5
        case 'ramp': return 0.5
        default: return 0.5
      }
    }

    let snappedPos: [number, number, number]

    if (isAdjacent) {
      // 인접 배치 - 이미 계산된 위치
      snappedPos = [
        snap(position[0]),
        snap(position[1]),
        snap(position[2]),
      ]
    } else {
      // 바닥 배치 - 높이 오프셋 추가
      const heightOffset = getHeightOffset(type)
      snappedPos = [
        snap(position[0]),
        snap(position[1] + heightOffset),
        snap(position[2]),
      ]
    }

    // 기존 오브젝트와 겹침 체크
    const newScale = type === 'plane' ? [2, 1, 2] : [1, 1, 1]
    const isOverlapping = state.objects.some(obj => {
      const dx = Math.abs(snappedPos[0] - obj.position[0])
      const dy = Math.abs(snappedPos[1] - obj.position[1])
      const dz = Math.abs(snappedPos[2] - obj.position[2])

      // 합쳐진 반크기 계산
      const halfSizeX = (newScale[0] + obj.scale[0]) / 2 * 0.9 // 0.9는 약간의 여유
      const halfSizeY = (newScale[1] + obj.scale[1]) / 2 * 0.9
      const halfSizeZ = (newScale[2] + obj.scale[2]) / 2 * 0.9

      return dx < halfSizeX && dy < halfSizeY && dz < halfSizeZ
    })

    if (isOverlapping) {
      return // 겹치면 설치 안함
    }

    // 방향성 오브젝트에 회전 적용 (plane, ramp)
    // yaw를 90도 단위로 스냅
    const snappedYaw = Math.round(yaw / (Math.PI / 2)) * (Math.PI / 2)
    const rotation: [number, number, number] = (type === 'plane' || type === 'ramp')
      ? [0, snappedYaw, 0]
      : [0, 0, 0]

    const newObject: MapObject = {
      id,
      type,
      position: snappedPos,
      rotation,
      scale: newScale as [number, number, number],
      color: getRandomColor(),
      name: `${type}_${id.slice(0, 4)}`,
    }
    set(s => ({
      objects: [...s.objects, newObject],
      selectedId: id,
    }))
  },

  newMap: () => set({ ...initialState }),

  loadMap: (data) => {
    set({
      mapName: data.name,
      mapMode: data.mode,
      shooterSubMode: data.shooterSubMode || 'team',
      objects: data.objects,
      markers: data.markers,
      selectedId: null,
    })
  },

  exportMap: () => {
    const state = get()
    return {
      id: generateId(),
      name: state.mapName,
      mode: state.mapMode,
      shooterSubMode: state.shooterSubMode,
      objects: state.objects,
      markers: state.markers,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
  },

  validateMap: () => {
    const state = get()
    const missingMarkers: string[] = []

    if (state.mapMode === 'race') {
      // 레이스: Spawn, Finish 필수 (각 1개)
      if (!state.markers.some(m => m.type === 'spawn')) missingMarkers.push('Spawn (시작점)')
      if (!state.markers.some(m => m.type === 'finish')) missingMarkers.push('Finish (끝점)')
    } else {
      // 슈터
      switch (state.shooterSubMode) {
        case 'team':
          // 팀전: Team A, Team B 스폰 필수 (각 1개)
          if (!state.markers.some(m => m.type === 'spawn_a')) missingMarkers.push('Team A 스폰')
          if (!state.markers.some(m => m.type === 'spawn_b')) missingMarkers.push('Team B 스폰')
          break
        case 'domination':
          // 점령전: Team A, Team B, Capture Point 필수 (각 1개)
          if (!state.markers.some(m => m.type === 'spawn_a')) missingMarkers.push('Team A 스폰')
          if (!state.markers.some(m => m.type === 'spawn_b')) missingMarkers.push('Team B 스폰')
          if (!state.markers.some(m => m.type === 'capture_point')) missingMarkers.push('Capture Point (점령 포인트)')
          break
        case 'ffa': {
          // 개인전: Spawn 최소 3개 필수
          const spawnCount = state.markers.filter(m => m.type === 'spawn').length
          if (spawnCount < 3) {
            missingMarkers.push(`Spawn 포인트 (${spawnCount}/3개 - 최소 3개 필요)`)
          }
          break
        }
      }
    }

    return {
      valid: missingMarkers.length === 0,
      missingMarkers,
    }
  },

  duplicateSelected: () => {
    const state = get()
    if (!state.selectedId) return

    // 마커인지 확인
    if (state.selectedId.startsWith('marker_')) {
      const markerId = state.selectedId.replace('marker_', '')
      const marker = state.markers.find(m => m.id === markerId)
      if (marker) {
        const newId = generateId()
        const newMarker: MapMarker = {
          ...marker,
          id: newId,
          position: [marker.position[0] + 1, marker.position[1], marker.position[2] + 1],
        }
        set(s => ({
          markers: [...s.markers, newMarker],
          selectedId: `marker_${newId}`,
        }))
      }
      return
    }

    // 오브젝트인 경우
    const obj = state.objects.find(o => o.id === state.selectedId)
    if (obj) {
      const newId = generateId()
      const newObj: MapObject = {
        ...obj,
        id: newId,
        name: `${obj.type}_${newId.slice(0, 4)}`,
        position: [obj.position[0] + 1, obj.position[1], obj.position[2] + 1],
      }
      set(s => ({
        objects: [...s.objects, newObj],
        selectedId: newId,
      }))
    }
  },
}))
