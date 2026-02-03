import { useState, useMemo, useCallback, memo, useRef, useEffect } from 'react'
import { useEditorStore } from '../../stores/editorStore'
import type { MarkerType, PlaceableType } from '../../stores/editorStore'

// 오브젝트 아이템 상수 (컴포넌트 외부로 이동)
const OBJECT_ITEMS: { type: PlaceableType; label: string; icon: string }[] = [
  { type: 'box', label: 'Box', icon: '1' },
  { type: 'cylinder', label: 'Cylinder', icon: '2' },
  { type: 'sphere', label: 'Sphere', icon: '3' },
  { type: 'plane', label: 'Plane', icon: '4' },
  { type: 'ramp', label: 'Ramp', icon: '5' },
]

// 마커 아이템 상수
const RACE_MARKERS = [
  { type: 'spawn' as MarkerType, label: 'Spawn', icon: '6', color: '#00ff00' },
  { type: 'checkpoint' as MarkerType, label: 'Check', icon: '7', color: '#ffff00' },
  { type: 'finish' as MarkerType, label: 'Finish', icon: '8', color: '#ff0000' },
  { type: 'killzone' as MarkerType, label: 'Kill', icon: '9', color: '#ff00ff' },
]

const TEAM_MARKERS = [
  { type: 'spawn_a' as MarkerType, label: 'Team A', icon: '6', color: '#ff4444' },
  { type: 'spawn_b' as MarkerType, label: 'Team B', icon: '7', color: '#4444ff' },
]

const DOMINATION_MARKERS = [
  { type: 'spawn_a' as MarkerType, label: 'Team A', icon: '6', color: '#ff4444' },
  { type: 'spawn_b' as MarkerType, label: 'Team B', icon: '7', color: '#4444ff' },
  { type: 'capture_point' as MarkerType, label: 'Capture', icon: '8', color: '#ffaa00' },
]

const FFA_MARKERS = [
  { type: 'spawn' as MarkerType, label: 'Spawn', icon: '6', color: '#00ff00' },
]

// 0.5 단위로 스냅하는 유틸 함수
const snap = (val: number) => Math.round(val * 2) / 2

// 핫바 - 선택(Q) + 오브젝트(1-5) + 마커(6-9) 선택
const Hotbar = memo(function Hotbar() {
  const currentPlaceable = useEditorStore(state => state.currentPlaceable)
  const setCurrentPlaceable = useEditorStore(state => state.setCurrentPlaceable)
  const currentMarker = useEditorStore(state => state.currentMarker)
  const setCurrentMarker = useEditorStore(state => state.setCurrentMarker)
  const setSelectMode = useEditorStore(state => state.setSelectMode)
  const mapMode = useEditorStore(state => state.mapMode)
  const shooterSubMode = useEditorStore(state => state.shooterSubMode)

  const isSelectMode = currentPlaceable === null && currentMarker === null

  // useMemo로 마커 아이템 메모이제이션
  const markerItems = useMemo(() => {
    if (mapMode === 'race') return RACE_MARKERS
    switch (shooterSubMode) {
      case 'team': return TEAM_MARKERS
      case 'domination': return DOMINATION_MARKERS
      case 'ffa': return FFA_MARKERS
      default: return []
    }
  }, [mapMode, shooterSubMode])

  return (
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1 bg-slate-800/90 backdrop-blur-sm rounded-xl p-2 border border-white/10">
      {/* 선택 모드 버튼 (Q) */}
      <button
        onClick={() => setSelectMode()}
        className={`relative w-14 h-14 rounded-lg flex flex-col items-center justify-center transition-all ${
          isSelectMode
            ? 'bg-amber-500 text-white ring-2 ring-white'
            : 'bg-white/5 text-white/70 hover:bg-white/10 hover:text-white'
        }`}
      >
        <span className="absolute top-1 left-2 text-xs font-bold opacity-60">Q</span>
        <div className="w-6 h-6 flex items-center justify-center">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
          </svg>
        </div>
        <span className="text-[10px] mt-1">Select</span>
      </button>

      {/* 구분선 */}
      <div className="w-px h-10 bg-white/20 mx-1" />

      {/* 오브젝트 버튼 (1-5) */}
      {OBJECT_ITEMS.map((item) => (
        <button
          key={item.type}
          onClick={() => setCurrentPlaceable(item.type)}
          className={`relative w-14 h-14 rounded-lg flex flex-col items-center justify-center transition-all ${
            currentMarker === null && currentPlaceable === item.type
              ? 'bg-sky-500 text-white ring-2 ring-white'
              : 'bg-white/5 text-white/70 hover:bg-white/10 hover:text-white'
          }`}
        >
          <span className="absolute top-1 left-2 text-xs font-bold opacity-60">{item.icon}</span>
          <div className="w-6 h-6 flex items-center justify-center">
            {item.type === 'box' && <div className="w-5 h-5 bg-current rounded-sm" />}
            {item.type === 'cylinder' && <div className="w-4 h-5 bg-current rounded-full" />}
            {item.type === 'sphere' && <div className="w-5 h-5 bg-current rounded-full" />}
            {item.type === 'plane' && <div className="w-6 h-1 bg-current rounded" />}
            {item.type === 'ramp' && (
              <div className="w-5 h-5 bg-current" style={{ clipPath: 'polygon(0 100%, 100% 100%, 100% 0)' }} />
            )}
          </div>
          <span className="text-[10px] mt-1">{item.label}</span>
        </button>
      ))}

      {/* 구분선 */}
      <div className="w-px h-10 bg-white/20 mx-1" />

      {/* 마커 버튼 (6-9) */}
      {markerItems.map((item) => (
        <button
          key={item.type}
          onClick={() => setCurrentMarker(item.type)}
          className={`relative w-14 h-14 rounded-lg flex flex-col items-center justify-center transition-all ${
            currentMarker === item.type
              ? 'bg-emerald-500 text-white ring-2 ring-white'
              : 'bg-white/5 text-white/70 hover:bg-white/10 hover:text-white'
          }`}
        >
          <span className="absolute top-1 left-2 text-xs font-bold opacity-60">{item.icon}</span>
          <div className="w-4 h-4 rounded" style={{ backgroundColor: item.color }} />
          <span className="text-[10px] mt-1">{item.label}</span>
        </button>
      ))}
    </div>
  )
})

// 타이머 포맷 유틸
function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  const milliseconds = Math.floor((ms % 1000) / 10)
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(2, '0')}`
}

// 상단 툴바 (최적화된 셀렉터)
const Toolbar = memo(function Toolbar({ onExit, onUpload }: { onExit: () => void; onUpload: () => void }) {
  const newMap = useEditorStore(state => state.newMap)
  const exportMap = useEditorStore(state => state.exportMap)
  const loadMap = useEditorStore(state => state.loadMap)
  const validateMap = useEditorStore(state => state.validateMap)
  const setTestPlaying = useEditorStore(state => state.setTestPlaying)
  const markers = useEditorStore(state => state.markers)
  const mapName = useEditorStore(state => state.mapName)
  const setMapName = useEditorStore(state => state.setMapName)
  const mapMode = useEditorStore(state => state.mapMode)
  const setMapMode = useEditorStore(state => state.setMapMode)
  const shooterSubMode = useEditorStore(state => state.shooterSubMode)
  const setShooterSubMode = useEditorStore(state => state.setShooterSubMode)
  const mapCompleted = useEditorStore(state => state.mapCompleted)
  const completionTime = useEditorStore(state => state.completionTime)

  // 테스트 플레이 가능 여부 (스폰 마커 필요)
  const canPlay = useMemo(() => {
    return markers.some(m => m.type === 'spawn' || m.type === 'spawn_a')
  }, [markers])

  const handlePlay = useCallback(() => {
    if (!canPlay) {
      alert('테스트 플레이를 시작하려면 Spawn 마커가 필요합니다.')
      return
    }
    setTestPlaying(true)
  }, [canPlay, setTestPlaying])

  // 맵 내보내기 (JSON 파일 다운로드) - 검증 포함
  const handleExport = useCallback(() => {
    const validation = validateMap()
    if (!validation.valid) {
      alert(`맵을 저장하려면 다음 마커가 필요합니다:\n\n${validation.missingMarkers.map(m => `• ${m}`).join('\n')}`)
      return
    }

    const data = exportMap()
    const json = JSON.stringify(data, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${data.name}.json`
    a.click()
    URL.revokeObjectURL(url)
  }, [exportMap, validateMap])

  // 맵 불러오기 (JSON 파일 업로드)
  const handleImport = useCallback(() => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return
      const text = await file.text()
      try {
        const data = JSON.parse(text)
        loadMap(data)
      } catch {
        alert('Invalid map file')
      }
    }
    input.click()
  }, [loadMap])

  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 bg-slate-800/90 backdrop-blur-sm rounded-xl p-2 border border-white/10">
      {/* 맵 이름 */}
      <input
        type="text"
        value={mapName}
        onChange={(e) => setMapName(e.target.value)}
        className="w-32 px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-sky-400"
        placeholder="Map name"
      />

      {/* 모드 토글 */}
      <div className="flex rounded-lg overflow-hidden border border-white/10">
        <button
          onClick={() => setMapMode('race')}
          className={`px-3 py-1.5 text-sm font-medium transition-colors ${
            mapMode === 'race' ? 'bg-green-500 text-white' : 'bg-white/5 text-white/70 hover:bg-white/10'
          }`}
        >
          Race
        </button>
        <button
          onClick={() => setMapMode('shooter')}
          className={`px-3 py-1.5 text-sm font-medium transition-colors ${
            mapMode === 'shooter' ? 'bg-red-500 text-white' : 'bg-white/5 text-white/70 hover:bg-white/10'
          }`}
        >
          Shooter
        </button>
      </div>

      {/* 슈터 서브모드 선택 (슈터 모드일 때만 표시) */}
      {mapMode === 'shooter' && (
        <>
          <div className="w-px h-6 bg-white/20" />
          <div className="flex rounded-lg overflow-hidden border border-white/10">
            <button
              onClick={() => setShooterSubMode('team')}
              className={`px-2 py-1.5 text-xs font-medium transition-colors ${
                shooterSubMode === 'team' ? 'bg-orange-500 text-white' : 'bg-white/5 text-white/70 hover:bg-white/10'
              }`}
            >
              팀전
            </button>
            <button
              onClick={() => setShooterSubMode('domination')}
              className={`px-2 py-1.5 text-xs font-medium transition-colors ${
                shooterSubMode === 'domination' ? 'bg-purple-500 text-white' : 'bg-white/5 text-white/70 hover:bg-white/10'
              }`}
            >
              점령전
            </button>
            <button
              onClick={() => setShooterSubMode('ffa')}
              className={`px-2 py-1.5 text-xs font-medium transition-colors ${
                shooterSubMode === 'ffa' ? 'bg-yellow-500 text-white' : 'bg-white/5 text-white/70 hover:bg-white/10'
              }`}
            >
              개인전
            </button>
          </div>
        </>
      )}

      <div className="w-px h-6 bg-white/20" />

      {/* 테스트 플레이 */}
      <button
        onClick={handlePlay}
        className={`px-3 py-1.5 font-medium rounded-lg transition-colors text-sm ${
          canPlay
            ? 'bg-green-500 hover:bg-green-400 text-white'
            : 'bg-white/5 text-white/30 cursor-not-allowed'
        }`}
      >
        ▶ Play
      </button>

      <div className="w-px h-6 bg-white/20" />

      {/* 파일 작업 */}
      <button onClick={newMap} className="px-3 py-1.5 text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-colors text-sm">
        New
      </button>
      <button onClick={handleImport} className="px-3 py-1.5 text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-colors text-sm">
        Load
      </button>
      <button onClick={handleExport} className="px-3 py-1.5 text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-colors text-sm">
        Save
      </button>

      <div className="w-px h-6 bg-white/20" />

      {/* Race 모드: Verified 배지 및 Upload 버튼 */}
      {mapMode === 'race' && (
        <>
          {mapCompleted && completionTime && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-green-500/20 rounded-lg border border-green-500/30">
              <span className="text-green-400 text-sm font-medium">Verified</span>
              <span className="text-green-300 text-xs font-mono">{formatTime(completionTime)}</span>
            </div>
          )}
          <button
            onClick={onUpload}
            disabled={!mapCompleted}
            className={`px-3 py-1.5 font-medium rounded-lg transition-colors text-sm ${
              mapCompleted
                ? 'bg-violet-500 hover:bg-violet-400 text-white'
                : 'bg-white/5 text-white/30 cursor-not-allowed'
            }`}
            title={mapCompleted ? '맵 업로드' : '테스트 플레이에서 완주해야 업로드 가능'}
          >
            Upload
          </button>
          <div className="w-px h-6 bg-white/20" />
        </>
      )}

      <button
        onClick={onExit}
        className="px-3 py-1.5 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors text-sm font-medium"
      >
        Exit
      </button>
    </div>
  )
})

// 축 라벨 상수 (컴포넌트 외부로 이동)
const AXES = ['X', 'Y', 'Z'] as const

// 속성 패널 (우클릭으로 오브젝트 선택 시 표시)
const PropertiesPanel = memo(function PropertiesPanel() {
  const selectedIds = useEditorStore(state => state.selectedIds)
  const objects = useEditorStore(state => state.objects)
  const markers = useEditorStore(state => state.markers)
  const updateObject = useEditorStore(state => state.updateObject)
  const updateMarker = useEditorStore(state => state.updateMarker)
  const deleteSelected = useEditorStore(state => state.deleteSelected)
  const clearSelection = useEditorStore(state => state.clearSelection)
  const moveSelectedObjects = useEditorStore(state => state.moveSelectedObjects)
  const setSelectedObjectsColor = useEditorStore(state => state.setSelectedObjectsColor)

  // 다중 선택 시 오프셋 입력 상태
  const [moveOffset, setMoveOffset] = useState<[number, number, number]>([0, 0, 0])
  // 이미 적용된 오프셋 (실시간 이동용)
  const [appliedOffset, setAppliedOffset] = useState<[number, number, number]>([0, 0, 0])
  // 다중 선택 색상 변경용
  const [multiColor, setMultiColor] = useState('#3b82f6')

  // 다중 선택 모드 체크
  const isMultiSelect = selectedIds.length > 1

  // 선택이 해제되면 오프셋 초기화
  useEffect(() => {
    if (!isMultiSelect) {
      setMoveOffset([0, 0, 0])
      setAppliedOffset([0, 0, 0])
    }
  }, [isMultiSelect])

  // 첫 번째 선택된 아이템만 속성 편집에 표시 (단일 선택 시)
  const selectedId = selectedIds.length === 1 ? selectedIds[0] : null

  // useMemo로 선택된 오브젝트/마커 메모이제이션
  const selectedObject = useMemo(() => {
    if (!selectedId || selectedId.startsWith('marker_')) return null
    return objects.find(o => o.id === selectedId) || null
  }, [selectedId, objects])

  const selectedMarker = useMemo(() => {
    if (!selectedId || !selectedId.startsWith('marker_')) return null
    return markers.find(m => m.id === selectedId.replace('marker_', '')) || null
  }, [selectedId, markers])

  const handleClose = useCallback(() => {
    clearSelection()
    setMoveOffset([0, 0, 0])
    setAppliedOffset([0, 0, 0])
  }, [clearSelection])

  // 다중 선택 이동 핸들러 - 입력 시 바로 이동
  const handleMoveOffsetChange = useCallback((axis: number, value: number) => {
    const snappedValue = snap(value)
    const newOffset = [...moveOffset] as [number, number, number]
    newOffset[axis] = snappedValue

    // 이전에 적용된 것과의 차이만 이동
    const deltaOffset: [number, number, number] = [
      newOffset[0] - appliedOffset[0],
      newOffset[1] - appliedOffset[1],
      newOffset[2] - appliedOffset[2],
    ]

    // 차이가 있으면 이동 적용
    if (deltaOffset[0] !== 0 || deltaOffset[1] !== 0 || deltaOffset[2] !== 0) {
      moveSelectedObjects(deltaOffset)
      setAppliedOffset(newOffset)
    }

    setMoveOffset(newOffset)
  }, [moveOffset, appliedOffset, moveSelectedObjects])

  // 오프셋 초기화 (0,0,0으로 리셋)
  const handleResetOffset = useCallback(() => {
    setMoveOffset([0, 0, 0])
    setAppliedOffset([0, 0, 0])
  }, [])

  // 오브젝트 속성 변경 핸들러 (useCallback으로 최적화)
  const handleColorChange = useCallback((color: string) => {
    if (selectedObject) updateObject(selectedObject.id, { color })
  }, [selectedObject?.id, updateObject])

  const handlePositionChange = useCallback((axis: number, value: number) => {
    if (selectedObject) {
      const pos = [...selectedObject.position] as [number, number, number]
      pos[axis] = snap(value)
      updateObject(selectedObject.id, { position: pos })
    }
  }, [selectedObject?.id, selectedObject?.position, updateObject])

  const handleRotationChange = useCallback((axis: number, value: number) => {
    if (selectedObject) {
      const rot = [...selectedObject.rotation] as [number, number, number]
      const deg = Math.round(value / 15) * 15
      rot[axis] = (deg * Math.PI) / 180
      updateObject(selectedObject.id, { rotation: rot })
    }
  }, [selectedObject?.id, selectedObject?.rotation, updateObject])

  const handleScaleChange = useCallback((axis: number, value: number) => {
    if (selectedObject) {
      const scale = [...selectedObject.scale] as [number, number, number]
      scale[axis] = Math.max(0.5, snap(value))
      updateObject(selectedObject.id, { scale })
    }
  }, [selectedObject?.id, selectedObject?.scale, updateObject])

  // 마커 속성 변경 핸들러
  const handleMarkerPositionChange = useCallback((axis: number, value: number) => {
    if (selectedMarker) {
      const pos = [...selectedMarker.position] as [number, number, number]
      pos[axis] = snap(value)
      updateMarker(selectedMarker.id, { position: pos })
    }
  }, [selectedMarker?.id, selectedMarker?.position, updateMarker])

  const handleMarkerRotationChange = useCallback((axis: number, value: number) => {
    if (selectedMarker) {
      const rot = [...selectedMarker.rotation] as [number, number, number]
      const deg = Math.round(value / 15) * 15
      rot[axis] = (deg * Math.PI) / 180
      updateMarker(selectedMarker.id, { rotation: rot })
    }
  }, [selectedMarker?.id, selectedMarker?.rotation, updateMarker])

  // 다중 선택 UI
  if (isMultiSelect) {
    return (
      <div className="absolute top-4 left-4 z-20 w-64 bg-slate-800/95 backdrop-blur-sm rounded-xl p-4 border border-white/10 shadow-xl">
        {/* 헤더 */}
        <div className="flex items-center justify-between mb-4">
          <span className="text-yellow-400 font-medium">{selectedIds.length}개 선택됨</span>
          <div className="flex gap-2">
            <button
              onClick={() => deleteSelected()}
              className="text-red-400 hover:text-red-300 text-xs px-2 py-1 bg-red-500/10 rounded"
            >
              Delete
            </button>
            <button
              onClick={handleClose}
              className="text-white/50 hover:text-white text-lg leading-none"
            >
              ×
            </button>
          </div>
        </div>

        {/* 이동 오프셋 입력 - 실시간 적용 */}
        <div className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-white/50 text-xs">이동 (실시간)</label>
              <button
                onClick={handleResetOffset}
                disabled={moveOffset[0] === 0 && moveOffset[1] === 0 && moveOffset[2] === 0}
                className="text-white/50 hover:text-white text-[10px] disabled:opacity-30"
              >
                초기화
              </button>
            </div>
            <div className="grid grid-cols-3 gap-1">
              {AXES.map((axis, i) => (
                <div key={axis}>
                  <span className="text-white/30 text-[10px]">{axis}</span>
                  <input
                    type="number"
                    step="0.5"
                    value={moveOffset[i]}
                    onChange={(e) => handleMoveOffsetChange(i, parseFloat(e.target.value) || 0)}
                    className="w-full px-2 py-1.5 bg-white/5 border border-white/10 rounded text-white text-xs focus:outline-none focus:border-sky-400"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* 색상 일괄 변경 */}
          <div>
            <label className="block text-white/50 text-xs mb-1.5">색상 일괄 변경</label>
            <div className="flex gap-2">
              <input
                type="color"
                value={multiColor}
                onChange={(e) => setMultiColor(e.target.value)}
                className="w-10 h-8 rounded cursor-pointer border-0"
              />
              <input
                type="text"
                value={multiColor}
                onChange={(e) => setMultiColor(e.target.value)}
                className="flex-1 px-2 py-1 bg-white/5 border border-white/10 rounded text-white text-xs focus:outline-none focus:border-sky-400 uppercase"
              />
              <button
                onClick={() => setSelectedObjectsColor(multiColor)}
                className="px-3 py-1 bg-sky-500 hover:bg-sky-400 text-white text-xs rounded"
              >
                적용
              </button>
            </div>
          </div>
        </div>

        <div className="mt-4 pt-3 border-t border-white/10 text-white/30 text-[10px]">
          아무 곳이나 클릭하여 닫고 편집 계속하기
        </div>
      </div>
    )
  }

  if (!selectedObject && !selectedMarker) return null

  return (
    <div className="absolute top-4 left-4 z-20 w-64 bg-slate-800/95 backdrop-blur-sm rounded-xl p-4 border border-white/10 shadow-xl">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-4">
        <span className="text-white font-medium">
          {selectedObject?.name || selectedMarker?.type.replace('_', ' ')}
        </span>
        <div className="flex gap-2">
          <button
            onClick={() => deleteSelected()}
            className="text-red-400 hover:text-red-300 text-xs px-2 py-1 bg-red-500/10 rounded"
          >
            Delete
          </button>
          <button
            onClick={handleClose}
            className="text-white/50 hover:text-white text-lg leading-none"
          >
            x
          </button>
        </div>
      </div>

      {selectedObject && (
        <div className="space-y-4">
          {/* 색상 */}
          <div>
            <label className="block text-white/50 text-xs mb-1.5">Color</label>
            <div className="flex gap-2">
              <input
                type="color"
                value={selectedObject.color}
                onChange={(e) => handleColorChange(e.target.value)}
                className="w-10 h-8 rounded cursor-pointer border-0"
              />
              <input
                type="text"
                value={selectedObject.color}
                onChange={(e) => handleColorChange(e.target.value)}
                className="flex-1 px-2 py-1 bg-white/5 border border-white/10 rounded text-white text-xs focus:outline-none focus:border-sky-400 uppercase"
              />
            </div>
          </div>

          {/* 위치 */}
          <div>
            <label className="block text-white/50 text-xs mb-1.5">Position</label>
            <div className="grid grid-cols-3 gap-1">
              {AXES.map((axis, i) => (
                <div key={axis}>
                  <span className="text-white/30 text-[10px]">{axis}</span>
                  <input
                    type="number"
                    step="0.5"
                    value={snap(selectedObject.position[i])}
                    onChange={(e) => handlePositionChange(i, parseFloat(e.target.value) || 0)}
                    className="w-full px-2 py-1.5 bg-white/5 border border-white/10 rounded text-white text-xs focus:outline-none focus:border-sky-400"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* 회전 */}
          <div>
            <label className="block text-white/50 text-xs mb-1.5">Rotation (deg)</label>
            <div className="grid grid-cols-3 gap-1">
              {AXES.map((axis, i) => (
                <div key={axis}>
                  <span className="text-white/30 text-[10px]">{axis}</span>
                  <input
                    type="number"
                    step="15"
                    value={Math.round((selectedObject.rotation[i] * 180) / Math.PI / 15) * 15}
                    onChange={(e) => handleRotationChange(i, parseFloat(e.target.value) || 0)}
                    className="w-full px-2 py-1.5 bg-white/5 border border-white/10 rounded text-white text-xs focus:outline-none focus:border-sky-400"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* 크기 */}
          <div>
            <label className="block text-white/50 text-xs mb-1.5">Scale</label>
            <div className="grid grid-cols-3 gap-1">
              {AXES.map((axis, i) => (
                <div key={axis}>
                  <span className="text-white/30 text-[10px]">{axis}</span>
                  <input
                    type="number"
                    step="0.5"
                    value={snap(selectedObject.scale[i])}
                    onChange={(e) => handleScaleChange(i, parseFloat(e.target.value) || 0.5)}
                    className="w-full px-2 py-1.5 bg-white/5 border border-white/10 rounded text-white text-xs focus:outline-none focus:border-sky-400"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {selectedMarker && (
        <div className="space-y-4">
          {/* 위치 */}
          <div>
            <label className="block text-white/50 text-xs mb-1.5">Position</label>
            <div className="grid grid-cols-3 gap-1">
              {AXES.map((axis, i) => (
                <div key={axis}>
                  <span className="text-white/30 text-[10px]">{axis}</span>
                  <input
                    type="number"
                    step="0.5"
                    value={snap(selectedMarker.position[i])}
                    onChange={(e) => handleMarkerPositionChange(i, parseFloat(e.target.value) || 0)}
                    className="w-full px-2 py-1.5 bg-white/5 border border-white/10 rounded text-white text-xs focus:outline-none focus:border-sky-400"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* 회전 */}
          <div>
            <label className="block text-white/50 text-xs mb-1.5">Rotation (deg)</label>
            <div className="grid grid-cols-3 gap-1">
              {AXES.map((axis, i) => (
                <div key={axis}>
                  <span className="text-white/30 text-[10px]">{axis}</span>
                  <input
                    type="number"
                    step="15"
                    value={Math.round((selectedMarker.rotation[i] * 180) / Math.PI / 15) * 15}
                    onChange={(e) => handleMarkerRotationChange(i, parseFloat(e.target.value) || 0)}
                    className="w-full px-2 py-1.5 bg-white/5 border border-white/10 rounded text-white text-xs focus:outline-none focus:border-sky-400"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="mt-4 pt-3 border-t border-white/10 text-white/30 text-[10px]">
        아무 곳이나 클릭하여 닫고 편집 계속하기
      </div>
    </div>
  )
})

// 도움말 오버레이 (좌측 하단) - memo로 최적화
const HelpOverlay = memo(function HelpOverlay() {
  return (
    <div className="absolute bottom-6 left-4 z-10 bg-slate-800/70 backdrop-blur-sm rounded-xl p-3 border border-white/10 text-white/40 text-xs">
      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
        <span>클릭</span><span>마우스 잠금</span>
        <span>WASD</span><span>이동</span>
        <span>Space / C</span><span>위 / 아래</span>
        <span>마우스</span><span>시점 회전</span>
        <span>Q</span><span>선택 모드</span>
        <span>좌클릭</span><span>설치 / 선택</span>
        <span>Shift+클릭</span><span>다중 선택</span>
        <span>우클릭</span><span>편집</span>
        <span>1-5</span><span>오브젝트 선택</span>
        <span>6-9</span><span>마커 선택</span>
        <span>Ctrl+Z / Y</span><span>Undo / Redo</span>
        <span>Ctrl+C / V</span><span>복사 / 붙여넣기</span>
        <span>Delete</span><span>선택 삭제</span>
        <span>ESC</span><span>마우스 잠금 해제</span>
      </div>
    </div>
  )
})

interface EditorUIProps {
  onExit: () => void
}

// 선택 개수 표시 (다중 선택 시)
const SelectionInfo = memo(function SelectionInfo() {
  const selectedIds = useEditorStore(state => state.selectedIds)
  const currentPlaceable = useEditorStore(state => state.currentPlaceable)
  const currentMarker = useEditorStore(state => state.currentMarker)

  // 선택 모드 (currentPlaceable과 currentMarker 모두 null)일 때만 표시
  const isSelectMode = currentPlaceable === null && currentMarker === null

  if (selectedIds.length <= 1 || !isSelectMode) return null

  return (
    <div className="absolute bottom-6 right-4 z-10 bg-slate-800/90 backdrop-blur-sm rounded-xl px-4 py-2 border border-white/10 text-white text-sm">
      <span className="text-yellow-400 font-medium">{selectedIds.length}개 선택됨</span>
      <span className="text-white/60 ml-2">- 바닥 클릭으로 이동</span>
    </div>
  )
})

// 설치 오류 메시지 컴포넌트
const PlacementErrorToast = memo(function PlacementErrorToast() {
  const placementError = useEditorStore(state => state.placementError)

  if (!placementError) return null

  return (
    <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 animate-fade-in">
      <div className="bg-red-500/90 backdrop-blur-sm text-white px-6 py-3 rounded-xl shadow-lg border border-red-400/50">
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span className="font-medium">{placementError}</span>
        </div>
      </div>
    </div>
  )
})

export function EditorUI({ onExit }: EditorUIProps) {
  const [showUploadModal, setShowUploadModal] = useState(false)
  const isThumbnailCaptureMode = useEditorStore(state => state.isThumbnailCaptureMode)
  const capturedThumbnail = useEditorStore(state => state.capturedThumbnail)

  // 캡처 완료 후 모달 다시 열기
  useEffect(() => {
    if (!isThumbnailCaptureMode && capturedThumbnail) {
      setShowUploadModal(true)
    }
  }, [isThumbnailCaptureMode, capturedThumbnail])

  // 캡처 모드일 때는 에디터 UI 숨기기
  if (isThumbnailCaptureMode) {
    return null
  }

  return (
    <>
      <Toolbar onExit={onExit} onUpload={() => setShowUploadModal(true)} />
      <Hotbar />
      <PropertiesPanel />
      <HelpOverlay />
      <SelectionInfo />
      <PlacementErrorToast />
      {showUploadModal && <UploadModal onClose={() => setShowUploadModal(false)} />}
    </>
  )
}

// 업로드 모달
const UploadModal = memo(function UploadModal({ onClose }: { onClose: () => void }) {
  const mapName = useEditorStore(state => state.mapName)
  const completionTime = useEditorStore(state => state.completionTime)
  const exportMap = useEditorStore(state => state.exportMap)
  const capturedThumbnail = useEditorStore(state => state.capturedThumbnail)
  const setThumbnailCaptureMode = useEditorStore(state => state.setThumbnailCaptureMode)
  const setCapturedThumbnail = useEditorStore(state => state.setCapturedThumbnail)

  const [name, setName] = useState(mapName)
  const [isPublic, setIsPublic] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [thumbnailPreview, setThumbnailPreview] = useState<string | null>(null)
  const [thumbnailBlob, setThumbnailBlob] = useState<Blob | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const thumbnailUrlRef = useRef<string | null>(null)

  // capturedThumbnail이 변경되면 미리보기 업데이트
  useEffect(() => {
    if (capturedThumbnail) {
      // 이전 URL 정리
      if (thumbnailUrlRef.current) {
        URL.revokeObjectURL(thumbnailUrlRef.current)
      }
      const url = URL.createObjectURL(capturedThumbnail)
      thumbnailUrlRef.current = url
      setThumbnailPreview(url)
      setThumbnailBlob(capturedThumbnail)
      setCapturedThumbnail(null) // 사용 후 초기화
    }
  }, [capturedThumbnail, setCapturedThumbnail])

  // 컴포넌트 언마운트 시 URL 정리
  useEffect(() => {
    return () => {
      if (thumbnailUrlRef.current) {
        URL.revokeObjectURL(thumbnailUrlRef.current)
      }
    }
  }, [])

  const handleCaptureClick = useCallback(() => {
    onClose() // 모달 닫기
    // 약간의 지연 후 캡처 모드 활성화 (모달이 완전히 닫힌 후)
    setTimeout(() => {
      setThumbnailCaptureMode(true)
    }, 100)
  }, [setThumbnailCaptureMode, onClose])

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      if (!file.type.startsWith('image/')) {
        setError('이미지 파일만 업로드 가능합니다')
        return
      }
      // 이전 URL 정리
      if (thumbnailUrlRef.current) {
        URL.revokeObjectURL(thumbnailUrlRef.current)
      }
      const url = URL.createObjectURL(file)
      thumbnailUrlRef.current = url
      setThumbnailPreview(url)
      setThumbnailBlob(file)
    }
  }, [])

  const handleClearThumbnail = useCallback(() => {
    if (thumbnailUrlRef.current) {
      URL.revokeObjectURL(thumbnailUrlRef.current)
      thumbnailUrlRef.current = null
    }
    setThumbnailPreview(null)
    setThumbnailBlob(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }, [])

  const handleUpload = useCallback(async () => {
    if (!name.trim()) {
      setError('맵 이름을 입력해주세요')
      return
    }

    setUploading(true)
    setError(null)

    try {
      const { mapService } = await import('../../lib/mapService')
      const mapData = exportMap()

      await mapService.uploadMap({
        name: name.trim(),
        data: mapData,
        thumbnailBlob: thumbnailBlob || undefined,
        isPublic,
      })

      setSuccess(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : '업로드 실패')
    } finally {
      setUploading(false)
    }
  }, [name, isPublic, exportMap, thumbnailBlob])

  if (success) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose}></div>
        <div className="relative w-full max-w-md bg-slate-900 rounded-2xl border border-white/10 shadow-2xl p-6 text-center">
          <div className="text-5xl mb-4">🎉</div>
          <h2 className="text-xl font-bold text-white mb-2">업로드 완료!</h2>
          <p className="text-white/60 mb-6">맵이 성공적으로 업로드되었습니다.</p>
          <button
            onClick={onClose}
            className="w-full py-3 bg-gradient-to-r from-sky-400 to-violet-500 text-white font-bold rounded-xl hover:shadow-lg transition-all"
          >
            확인
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose}></div>
      <div className="relative w-full max-w-md bg-slate-900 rounded-2xl border border-white/10 shadow-2xl p-6">
        <h2 className="text-xl font-bold text-white mb-4">맵 업로드</h2>

        <div className="space-y-4">
          <div>
            <label className="block text-white/70 text-sm font-medium mb-2">맵 이름</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/30 focus:outline-none focus:border-sky-400 transition-colors"
              placeholder="맵 이름을 입력하세요"
              maxLength={100}
              disabled={uploading}
            />
          </div>

          {completionTime && (
            <div className="flex items-center gap-2 p-3 bg-green-500/10 rounded-xl border border-green-500/20">
              <span className="text-green-400 text-sm">완주 기록:</span>
              <span className="text-green-300 font-mono">{formatTime(completionTime)}</span>
            </div>
          )}

          {/* 썸네일 설정 */}
          <div>
            <label className="block text-white/70 text-sm font-medium mb-2">썸네일</label>
            {thumbnailPreview ? (
              <div className="relative">
                <img
                  src={thumbnailPreview}
                  alt="썸네일 미리보기"
                  className="w-full aspect-video object-cover rounded-xl border border-white/10"
                />
                <button
                  onClick={handleClearThumbnail}
                  disabled={uploading}
                  className="absolute top-2 right-2 p-1.5 bg-red-500/80 hover:bg-red-500 text-white rounded-lg transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <button
                  onClick={handleCaptureClick}
                  disabled={uploading}
                  className="flex-1 py-3 bg-violet-500/20 hover:bg-violet-500/30 text-violet-300 rounded-xl transition-colors flex items-center justify-center gap-2"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  화면 캡처
                </button>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="flex-1 py-3 bg-white/5 hover:bg-white/10 text-white/70 rounded-xl transition-colors flex items-center justify-center gap-2"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  이미지 업로드
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </div>
            )}
            <p className="text-white/40 text-xs mt-1">
              {thumbnailPreview ? '다른 이미지를 사용하려면 X를 클릭하세요' : '썸네일 없이 업로드할 수도 있습니다'}
            </p>
          </div>

          <div>
            <label className="block text-white/70 text-sm font-medium mb-2">공개 설정</label>
            <div className="flex gap-2">
              <button
                onClick={() => setIsPublic(true)}
                disabled={uploading}
                className={`flex-1 py-2 rounded-lg transition-colors ${
                  isPublic
                    ? 'bg-sky-500 text-white'
                    : 'bg-white/5 text-white/70 hover:bg-white/10'
                }`}
              >
                공개
              </button>
              <button
                onClick={() => setIsPublic(false)}
                disabled={uploading}
                className={`flex-1 py-2 rounded-lg transition-colors ${
                  !isPublic
                    ? 'bg-sky-500 text-white'
                    : 'bg-white/5 text-white/70 hover:bg-white/10'
                }`}
              >
                비공개
              </button>
            </div>
            <p className="text-white/40 text-xs mt-1">
              {isPublic ? '다른 플레이어가 이 맵을 볼 수 있습니다' : '나만 볼 수 있습니다'}
            </p>
          </div>

          {error && (
            <div className="p-3 bg-red-500/20 border border-red-500/30 rounded-xl text-red-400 text-sm">
              {error}
            </div>
          )}
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            disabled={uploading}
            className="flex-1 py-3 bg-white/10 text-white font-medium rounded-xl hover:bg-white/20 transition-colors disabled:opacity-50"
          >
            취소
          </button>
          <button
            onClick={handleUpload}
            disabled={uploading || !name.trim()}
            className="flex-1 py-3 bg-gradient-to-r from-violet-500 to-purple-600 text-white font-bold rounded-xl hover:shadow-lg hover:shadow-violet-500/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {uploading ? (
              <>
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                업로드 중...
              </>
            ) : (
              '업로드'
            )}
          </button>
        </div>
      </div>
    </div>
  )
})
