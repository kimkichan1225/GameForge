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

// 히스토리 엔트리 타입 (Undo/Redo용)
export interface HistoryEntry {
  type: 'add' | 'remove' | 'update'
  target: 'object' | 'marker'
  data: MapObject | MapMarker
  previousData?: MapObject | MapMarker  // update 시 이전 상태
}

// 클립보드 아이템 타입
export type ClipboardItem = { kind: 'object'; data: MapObject } | { kind: 'marker'; data: MapMarker }

interface EditorState {
  // 맵 정보
  mapName: string
  mapMode: MapMode
  shooterSubMode: ShooterSubMode  // 슈터 서브모드

  // 오브젝트
  objects: MapObject[]
  markers: MapMarker[]

  // 선택 (다중 선택 지원)
  selectedIds: string[]

  // Undo/Redo 히스토리
  undoStack: HistoryEntry[]
  redoStack: HistoryEntry[]

  // 클립보드
  clipboard: ClipboardItem[]
  isPasteMode: boolean  // 붙여넣기 모드 (Ctrl+C 후 좌클릭으로 붙여넣기)

  // 기즈모
  gizmoMode: GizmoMode
  gridSnap: boolean
  gridSize: number

  // 카메라
  cameraPosition: [number, number, number]
  cameraTarget: [number, number, number]

  // 테스트 플레이
  isTestPlaying: boolean

  // 맵 완주 검증 (Race 모드)
  mapCompleted: boolean
  completionTime: number | null  // 완주 시간 (ms)

  // 썸네일 캡처
  isThumbnailCaptureMode: boolean
  capturedThumbnail: Blob | null

  // 설치 오류 메시지
  placementError: string | null

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

  // 선택 관련
  setSelectedId: (id: string | null) => void
  setSelectedIds: (ids: string[]) => void
  toggleSelection: (id: string) => void
  clearSelection: () => void
  setSelectMode: () => void
  moveSelectedObjects: (offset: [number, number, number]) => void
  setSelectedObjectsColor: (color: string) => void

  // Undo/Redo
  undo: () => void
  redo: () => void
  clearHistory: () => void

  // 복사/붙여넣기
  copy: () => void  // 복사 + 붙여넣기 모드 진입
  exitPasteMode: () => void  // 붙여넣기 모드 종료
  pasteAtPosition: (position: [number, number, number]) => void  // 특정 위치에 붙여넣기
  setGizmoMode: (mode: GizmoMode) => void
  setGridSnap: (enabled: boolean) => void
  setGridSize: (size: number) => void

  setCameraPosition: (pos: [number, number, number]) => void
  setCameraTarget: (target: [number, number, number]) => void

  setTestPlaying: (playing: boolean) => void

  // 맵 완주 검증
  setMapCompleted: (completed: boolean, time?: number) => void
  resetMapCompletion: () => void

  // 썸네일 캡처
  setThumbnailCaptureMode: (enabled: boolean) => void
  setCapturedThumbnail: (blob: Blob | null) => void

  // 설치 오류
  setPlacementError: (error: string | null) => void

  // 설치 가능한 오브젝트/마커 (null이면 선택 모드)
  currentPlaceable: PlaceableType | null
  setCurrentPlaceable: (type: PlaceableType | null) => void
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

  // 다중 선택 삭제
  deleteSelected: () => void
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
  selectedIds: [] as string[],
  gizmoMode: 'translate' as GizmoMode,
  gridSnap: true,
  gridSize: 1,
  cameraPosition: [10, 10, 10] as [number, number, number],
  cameraTarget: [0, 0, 0] as [number, number, number],
  isTestPlaying: false,
  // 설치할 오브젝트 타입 (1-5 키), null이면 선택 모드
  currentPlaceable: 'box' as PlaceableType | null,
  // 설치할 마커 타입 (6-9 키), null이면 오브젝트 모드
  currentMarker: null as MarkerType | null,
  // 맵 완주 검증 (Race 모드)
  mapCompleted: false,
  completionTime: null as number | null,
  // 썸네일 캡처
  isThumbnailCaptureMode: false,
  capturedThumbnail: null as Blob | null,
  // 설치 오류
  placementError: null as string | null,
  // Undo/Redo 히스토리
  undoStack: [] as HistoryEntry[],
  redoStack: [] as HistoryEntry[],
  // 클립보드
  clipboard: [] as ClipboardItem[],
  isPasteMode: false,
}

export const useEditorStore = create<EditorState>((set, get) => ({
  ...initialState,

  setMapName: (name) => set({ mapName: name }),
  // 모드 변경 시 마커 초기화 및 완주 상태 리셋
  setMapMode: (mode) => set({ mapMode: mode, markers: [], selectedIds: [], currentMarker: null, mapCompleted: false, completionTime: null, undoStack: [], redoStack: [] }),
  setShooterSubMode: (subMode) => set({ shooterSubMode: subMode, markers: [], selectedIds: [], currentMarker: null, mapCompleted: false, completionTime: null, undoStack: [], redoStack: [] }),

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
      selectedIds: [id],
      undoStack: [...state.undoStack, { type: 'add', target: 'object', data: newObject }],
      redoStack: [],
    }))
  },

  updateObject: (id, updates) => {
    const state = get()
    const obj = state.objects.find(o => o.id === id)
    if (!obj) return

    const previousData = { ...obj }
    const newData = { ...obj, ...updates }

    set(state => ({
      objects: state.objects.map(o => o.id === id ? newData : o),
      undoStack: [...state.undoStack, { type: 'update', target: 'object', data: newData, previousData }],
      redoStack: [],
    }))
  },

  removeObject: (id) => {
    const state = get()
    const obj = state.objects.find(o => o.id === id)
    if (!obj) return

    set(state => ({
      objects: state.objects.filter(o => o.id !== id),
      selectedIds: state.selectedIds.filter(sId => sId !== id),
      undoStack: [...state.undoStack, { type: 'remove', target: 'object', data: obj }],
      redoStack: [],
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
      selectedIds: [`marker_${id}`],
      mapCompleted: false,
      completionTime: null,
      undoStack: [...state.undoStack, { type: 'add', target: 'marker', data: newMarker }],
      redoStack: [],
    }))
  },

  updateMarker: (id, updates) => {
    const state = get()
    const marker = state.markers.find(m => m.id === id)
    if (!marker) return

    const previousData = { ...marker }
    const newData = { ...marker, ...updates }

    set(state => ({
      markers: state.markers.map(m => m.id === id ? newData : m),
      mapCompleted: false,
      completionTime: null,
      undoStack: [...state.undoStack, { type: 'update', target: 'marker', data: newData, previousData }],
      redoStack: [],
    }))
  },

  removeMarker: (id) => {
    const state = get()
    const marker = state.markers.find(m => m.id === id)
    if (!marker) return

    set(state => ({
      markers: state.markers.filter(m => m.id !== id),
      selectedIds: state.selectedIds.filter(sId => sId !== `marker_${id}`),
      mapCompleted: false,
      completionTime: null,
      undoStack: [...state.undoStack, { type: 'remove', target: 'marker', data: marker }],
      redoStack: [],
    }))
  },

  setSelectedId: (id) => set({ selectedIds: id ? [id] : [] }),
  setSelectedIds: (ids) => set({ selectedIds: ids }),
  toggleSelection: (id) => set(state => {
    if (state.selectedIds.includes(id)) {
      return { selectedIds: state.selectedIds.filter(sId => sId !== id) }
    } else {
      return { selectedIds: [...state.selectedIds, id] }
    }
  }),
  clearSelection: () => set({ selectedIds: [] }),
  setSelectMode: () => set({ currentPlaceable: null, currentMarker: null }),

  // 다중 선택 이동 (선택된 오브젝트들을 오프셋만큼 이동)
  moveSelectedObjects: (offset: [number, number, number]) => {
    const state = get()
    if (state.selectedIds.length === 0) return

    // 0.5 단위로 스냅
    const snap = (val: number) => Math.round(val * 2) / 2

    // 이동할 양이 없으면 무시
    if (offset[0] === 0 && offset[1] === 0 && offset[2] === 0) return

    // 선택된 오브젝트/마커 분류
    const selectedMarkerIds = state.selectedIds
      .filter(id => id.startsWith('marker_'))
      .map(id => id.replace('marker_', ''))

    // 히스토리 배치 저장
    const historyEntries: HistoryEntry[] = []

    // 오브젝트 이동
    const newObjects = state.objects.map(obj => {
      if (!state.selectedIds.includes(obj.id)) return obj
      const previousData = { ...obj }
      const newObj = {
        ...obj,
        position: [
          snap(obj.position[0] + offset[0]),
          snap(obj.position[1] + offset[1]),
          snap(obj.position[2] + offset[2]),
        ] as [number, number, number],
      }
      historyEntries.push({ type: 'update', target: 'object', data: newObj, previousData })
      return newObj
    })

    // 마커 이동
    const newMarkers = state.markers.map(marker => {
      if (!selectedMarkerIds.includes(marker.id)) return marker
      const previousData = { ...marker }
      const newMarker = {
        ...marker,
        position: [
          snap(marker.position[0] + offset[0]),
          snap(marker.position[1] + offset[1]),
          snap(marker.position[2] + offset[2]),
        ] as [number, number, number],
      }
      historyEntries.push({ type: 'update', target: 'marker', data: newMarker, previousData })
      return newMarker
    })

    set({
      objects: newObjects,
      markers: newMarkers,
      undoStack: [...state.undoStack, ...historyEntries],
      redoStack: [],
      mapCompleted: false,
      completionTime: null,
    })
  },

  // 다중 선택 색상 변경
  setSelectedObjectsColor: (color: string) => {
    const state = get()
    if (state.selectedIds.length === 0) return

    // 선택된 오브젝트만 필터 (마커는 색상 없음)
    const selectedObjectIds = state.selectedIds.filter(id => !id.startsWith('marker_'))
    if (selectedObjectIds.length === 0) return

    // 히스토리 저장
    const historyEntries: HistoryEntry[] = []

    const newObjects = state.objects.map(obj => {
      if (!selectedObjectIds.includes(obj.id)) return obj
      const previousData = { ...obj }
      const newObj = { ...obj, color }
      historyEntries.push({ type: 'update', target: 'object', data: newObj, previousData })
      return newObj
    })

    set({
      objects: newObjects,
      undoStack: [...state.undoStack, ...historyEntries],
      redoStack: [],
      mapCompleted: false,
      completionTime: null,
    })
  },

  // Undo/Redo
  undo: () => {
    const state = get()
    if (state.undoStack.length === 0) return

    const entry = state.undoStack[state.undoStack.length - 1]
    const newUndoStack = state.undoStack.slice(0, -1)

    if (entry.type === 'add') {
      // add를 취소 -> 삭제
      if (entry.target === 'object') {
        set({
          objects: state.objects.filter(o => o.id !== (entry.data as MapObject).id),
          selectedIds: state.selectedIds.filter(id => id !== (entry.data as MapObject).id),
          undoStack: newUndoStack,
          redoStack: [...state.redoStack, entry],
        })
      } else {
        set({
          markers: state.markers.filter(m => m.id !== (entry.data as MapMarker).id),
          selectedIds: state.selectedIds.filter(id => id !== `marker_${(entry.data as MapMarker).id}`),
          undoStack: newUndoStack,
          redoStack: [...state.redoStack, entry],
          mapCompleted: false,
          completionTime: null,
        })
      }
    } else if (entry.type === 'remove') {
      // remove를 취소 -> 다시 추가
      if (entry.target === 'object') {
        set({
          objects: [...state.objects, entry.data as MapObject],
          undoStack: newUndoStack,
          redoStack: [...state.redoStack, entry],
        })
      } else {
        set({
          markers: [...state.markers, entry.data as MapMarker],
          undoStack: newUndoStack,
          redoStack: [...state.redoStack, entry],
          mapCompleted: false,
          completionTime: null,
        })
      }
    } else if (entry.type === 'update' && entry.previousData) {
      // update를 취소 -> 이전 상태로
      if (entry.target === 'object') {
        set({
          objects: state.objects.map(o =>
            o.id === (entry.previousData as MapObject).id ? (entry.previousData as MapObject) : o
          ),
          undoStack: newUndoStack,
          redoStack: [...state.redoStack, entry],
        })
      } else {
        set({
          markers: state.markers.map(m =>
            m.id === (entry.previousData as MapMarker).id ? (entry.previousData as MapMarker) : m
          ),
          undoStack: newUndoStack,
          redoStack: [...state.redoStack, entry],
          mapCompleted: false,
          completionTime: null,
        })
      }
    }
  },

  redo: () => {
    const state = get()
    if (state.redoStack.length === 0) return

    const entry = state.redoStack[state.redoStack.length - 1]
    const newRedoStack = state.redoStack.slice(0, -1)

    if (entry.type === 'add') {
      // add를 다시 실행 -> 추가
      if (entry.target === 'object') {
        set({
          objects: [...state.objects, entry.data as MapObject],
          undoStack: [...state.undoStack, entry],
          redoStack: newRedoStack,
        })
      } else {
        set({
          markers: [...state.markers, entry.data as MapMarker],
          undoStack: [...state.undoStack, entry],
          redoStack: newRedoStack,
          mapCompleted: false,
          completionTime: null,
        })
      }
    } else if (entry.type === 'remove') {
      // remove를 다시 실행 -> 삭제
      if (entry.target === 'object') {
        set({
          objects: state.objects.filter(o => o.id !== (entry.data as MapObject).id),
          selectedIds: state.selectedIds.filter(id => id !== (entry.data as MapObject).id),
          undoStack: [...state.undoStack, entry],
          redoStack: newRedoStack,
        })
      } else {
        set({
          markers: state.markers.filter(m => m.id !== (entry.data as MapMarker).id),
          selectedIds: state.selectedIds.filter(id => id !== `marker_${(entry.data as MapMarker).id}`),
          undoStack: [...state.undoStack, entry],
          redoStack: newRedoStack,
          mapCompleted: false,
          completionTime: null,
        })
      }
    } else if (entry.type === 'update') {
      // update를 다시 실행 -> 새 상태로
      if (entry.target === 'object') {
        set({
          objects: state.objects.map(o =>
            o.id === (entry.data as MapObject).id ? (entry.data as MapObject) : o
          ),
          undoStack: [...state.undoStack, entry],
          redoStack: newRedoStack,
        })
      } else {
        set({
          markers: state.markers.map(m =>
            m.id === (entry.data as MapMarker).id ? (entry.data as MapMarker) : m
          ),
          undoStack: [...state.undoStack, entry],
          redoStack: newRedoStack,
          mapCompleted: false,
          completionTime: null,
        })
      }
    }
  },

  clearHistory: () => set({ undoStack: [], redoStack: [] }),

  // 복사 + 붙여넣기 모드 진입
  copy: () => {
    const state = get()
    if (state.selectedIds.length === 0) return

    const clipboardItems: ClipboardItem[] = []

    for (const id of state.selectedIds) {
      if (id.startsWith('marker_')) {
        const markerId = id.replace('marker_', '')
        const marker = state.markers.find(m => m.id === markerId)
        if (marker) {
          clipboardItems.push({ kind: 'marker', data: { ...marker } })
        }
      } else {
        const obj = state.objects.find(o => o.id === id)
        if (obj) {
          clipboardItems.push({ kind: 'object', data: { ...obj } })
        }
      }
    }

    // 붙여넣기 모드 진입 (선택 해제, 배치 도구 해제)
    set({
      clipboard: clipboardItems,
      isPasteMode: true,
      selectedIds: [],
      currentPlaceable: null,
      currentMarker: null,
    })
  },

  // 붙여넣기 모드 종료
  exitPasteMode: () => {
    set({ isPasteMode: false })
  },

  // 특정 위치에 붙여넣기 (좌클릭 시 호출)
  pasteAtPosition: (position: [number, number, number]) => {
    const state = get()
    if (state.clipboard.length === 0 || !state.isPasteMode) return

    // 클립보드 아이템들의 중심점 계산
    let centerX = 0, centerY = 0, centerZ = 0
    let count = 0
    for (const item of state.clipboard) {
      const pos = item.data.position
      centerX += pos[0]
      centerY += pos[1]
      centerZ += pos[2]
      count++
    }
    centerX /= count
    centerY /= count
    centerZ /= count

    const newObjects: MapObject[] = []
    const newMarkers: MapMarker[] = []
    const historyEntries: HistoryEntry[] = []

    for (const item of state.clipboard) {
      const newId = generateId()
      const offsetX = item.data.position[0] - centerX
      const offsetY = item.data.position[1] - centerY
      const offsetZ = item.data.position[2] - centerZ

      if (item.kind === 'object') {
        const newObj: MapObject = {
          ...item.data,
          id: newId,
          name: `${item.data.type}_${newId.slice(0, 4)}`,
          position: [position[0] + offsetX, position[1] + offsetY, position[2] + offsetZ],
        }
        newObjects.push(newObj)
        historyEntries.push({ type: 'add', target: 'object', data: newObj })
      } else {
        const newMarker: MapMarker = {
          ...item.data,
          id: newId,
          position: [position[0] + offsetX, position[1] + offsetY, position[2] + offsetZ],
        }
        newMarkers.push(newMarker)
        historyEntries.push({ type: 'add', target: 'marker', data: newMarker })
      }
    }

    set(state => ({
      objects: [...state.objects, ...newObjects],
      markers: [...state.markers, ...newMarkers],
      undoStack: [...state.undoStack, ...historyEntries],
      redoStack: [],
      mapCompleted: newMarkers.length > 0 ? false : state.mapCompleted,
      completionTime: newMarkers.length > 0 ? null : state.completionTime,
      // 붙여넣기 모드 유지 (여러 번 붙여넣기 가능)
    }))
  },
  setGizmoMode: (mode) => set({ gizmoMode: mode }),
  setGridSnap: (enabled) => set({ gridSnap: enabled }),
  setGridSize: (size) => set({ gridSize: size }),

  setCameraPosition: (pos) => set({ cameraPosition: pos }),
  setCameraTarget: (target) => set({ cameraTarget: target }),

  setTestPlaying: (playing) => set({ isTestPlaying: playing }),

  setMapCompleted: (completed, time) => set({
    mapCompleted: completed,
    completionTime: time ?? null,
  }),

  resetMapCompletion: () => set({
    mapCompleted: false,
    completionTime: null,
  }),

  setThumbnailCaptureMode: (enabled) => set({ isThumbnailCaptureMode: enabled }),
  setCapturedThumbnail: (blob) => set({ capturedThumbnail: blob }),

  setPlacementError: (error) => set({ placementError: error }),

  setCurrentPlaceable: (type) => set({ currentPlaceable: type, currentMarker: null }),

  setCurrentMarker: (type) => set({ currentMarker: type }),

  placeMarkerAt: (position, yaw = 0) => {
    const state = get()
    if (!state.currentMarker) return

    // 킬존을 spawn/finish 근처에 설치 금지 (최소 거리: 5 유닛)
    const KILLZONE_MIN_DISTANCE = 5
    if (state.currentMarker === 'killzone') {
      const protectedMarkers = state.markers.filter(m =>
        m.type === 'spawn' || m.type === 'finish' || m.type === 'spawn_a' || m.type === 'spawn_b'
      )

      for (const marker of protectedMarkers) {
        const dx = position[0] - marker.position[0]
        const dy = position[1] - marker.position[1]
        const dz = position[2] - marker.position[2]
        const distance = Math.sqrt(dx * dx + dy * dy + dz * dz)

        if (distance < KILLZONE_MIN_DISTANCE) {
          const markerName = marker.type === 'spawn' ? '스폰' :
                            marker.type === 'finish' ? '피니시' :
                            marker.type === 'spawn_a' ? '팀A 스폰' : '팀B 스폰'
          set({ placementError: `킬존은 ${markerName} 근처에 설치할 수 없습니다` })
          // 3초 후 에러 메시지 자동 제거
          setTimeout(() => set({ placementError: null }), 3000)
          return
        }
      }
    }

    // 기존 에러 메시지 제거
    set({ placementError: null })

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
      selectedIds: [`marker_${id}`],
      undoStack: [...s.undoStack, { type: 'add', target: 'marker', data: newMarker }],
      redoStack: [],
    }))
  },

  placeObjectAt: (position, isAdjacent = false, yaw = 0) => {
    const state = get()
    // 선택 모드이면 배치 안함
    if (state.currentPlaceable === null) return

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
      selectedIds: [id],
      undoStack: [...s.undoStack, { type: 'add', target: 'object', data: newObject }],
      redoStack: [],
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
      selectedIds: [],
      mapCompleted: false,
      completionTime: null,
      undoStack: [],
      redoStack: [],
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
    if (state.selectedIds.length === 0) return

    const newIds: string[] = []
    const newObjects: MapObject[] = []
    const newMarkers: MapMarker[] = []
    const historyEntries: HistoryEntry[] = []

    for (const selectedId of state.selectedIds) {
      if (selectedId.startsWith('marker_')) {
        const markerId = selectedId.replace('marker_', '')
        const marker = state.markers.find(m => m.id === markerId)
        if (marker) {
          const newId = generateId()
          const newMarker: MapMarker = {
            ...marker,
            id: newId,
            position: [marker.position[0] + 1, marker.position[1], marker.position[2] + 1],
          }
          newMarkers.push(newMarker)
          newIds.push(`marker_${newId}`)
          historyEntries.push({ type: 'add', target: 'marker', data: newMarker })
        }
      } else {
        const obj = state.objects.find(o => o.id === selectedId)
        if (obj) {
          const newId = generateId()
          const newObj: MapObject = {
            ...obj,
            id: newId,
            name: `${obj.type}_${newId.slice(0, 4)}`,
            position: [obj.position[0] + 1, obj.position[1], obj.position[2] + 1],
          }
          newObjects.push(newObj)
          newIds.push(newId)
          historyEntries.push({ type: 'add', target: 'object', data: newObj })
        }
      }
    }

    set(s => ({
      objects: [...s.objects, ...newObjects],
      markers: [...s.markers, ...newMarkers],
      selectedIds: newIds,
      undoStack: [...s.undoStack, ...historyEntries],
      redoStack: [],
      mapCompleted: newMarkers.length > 0 ? false : s.mapCompleted,
      completionTime: newMarkers.length > 0 ? null : s.completionTime,
    }))
  },

  deleteSelected: () => {
    const state = get()
    if (state.selectedIds.length === 0) return

    const historyEntries: HistoryEntry[] = []
    const objectsToRemove: string[] = []
    const markersToRemove: string[] = []

    for (const selectedId of state.selectedIds) {
      if (selectedId.startsWith('marker_')) {
        const markerId = selectedId.replace('marker_', '')
        const marker = state.markers.find(m => m.id === markerId)
        if (marker) {
          markersToRemove.push(markerId)
          historyEntries.push({ type: 'remove', target: 'marker', data: marker })
        }
      } else {
        const obj = state.objects.find(o => o.id === selectedId)
        if (obj) {
          objectsToRemove.push(selectedId)
          historyEntries.push({ type: 'remove', target: 'object', data: obj })
        }
      }
    }

    set(s => ({
      objects: s.objects.filter(o => !objectsToRemove.includes(o.id)),
      markers: s.markers.filter(m => !markersToRemove.includes(m.id)),
      selectedIds: [],
      undoStack: [...s.undoStack, ...historyEntries],
      redoStack: [],
      mapCompleted: markersToRemove.length > 0 ? false : s.mapCompleted,
      completionTime: markersToRemove.length > 0 ? null : s.completionTime,
    }))
  },
}))
