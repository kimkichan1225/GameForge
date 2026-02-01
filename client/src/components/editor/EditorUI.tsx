import { useMemo, useCallback, memo } from 'react'
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

// 핫바 - 오브젝트(1-5) + 마커(6-9) 선택
const Hotbar = memo(function Hotbar() {
  const currentPlaceable = useEditorStore(state => state.currentPlaceable)
  const setCurrentPlaceable = useEditorStore(state => state.setCurrentPlaceable)
  const currentMarker = useEditorStore(state => state.currentMarker)
  const setCurrentMarker = useEditorStore(state => state.setCurrentMarker)
  const mapMode = useEditorStore(state => state.mapMode)
  const shooterSubMode = useEditorStore(state => state.shooterSubMode)

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

// 상단 툴바 (최적화된 셀렉터)
const Toolbar = memo(function Toolbar({ onExit }: { onExit: () => void }) {
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
  const selectedId = useEditorStore(state => state.selectedId)
  const objects = useEditorStore(state => state.objects)
  const markers = useEditorStore(state => state.markers)
  const updateObject = useEditorStore(state => state.updateObject)
  const updateMarker = useEditorStore(state => state.updateMarker)
  const removeObject = useEditorStore(state => state.removeObject)
  const removeMarker = useEditorStore(state => state.removeMarker)
  const setSelectedId = useEditorStore(state => state.setSelectedId)

  // useMemo로 선택된 오브젝트/마커 메모이제이션
  const selectedObject = useMemo(() => {
    if (!selectedId || selectedId.startsWith('marker_')) return null
    return objects.find(o => o.id === selectedId) || null
  }, [selectedId, objects])

  const selectedMarker = useMemo(() => {
    if (!selectedId || !selectedId.startsWith('marker_')) return null
    return markers.find(m => m.id === selectedId.replace('marker_', '')) || null
  }, [selectedId, markers])

  const handleClose = useCallback(() => setSelectedId(null), [setSelectedId])

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
            onClick={() => {
              if (selectedObject) removeObject(selectedObject.id)
              else if (selectedMarker) removeMarker(selectedMarker.id)
            }}
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

// 도움말 오버레이 (좌측 하단) - 변경 없음, memo로 최적화
const HelpOverlay = memo(function HelpOverlay() {
  return (
    <div className="absolute bottom-6 left-4 z-10 bg-slate-800/70 backdrop-blur-sm rounded-xl p-3 border border-white/10 text-white/40 text-xs">
      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
        <span>클릭</span><span>마우스 잠금</span>
        <span>WASD</span><span>이동</span>
        <span>Space / Shift</span><span>위 / 아래</span>
        <span>마우스</span><span>시점 회전</span>
        <span>좌클릭</span><span>설치</span>
        <span>우클릭</span><span>편집</span>
        <span>1-5</span><span>오브젝트 선택</span>
        <span>6-9</span><span>마커 선택</span>
        <span>ESC</span><span>마우스 잠금 해제</span>
      </div>
    </div>
  )
})

export function EditorUI({ onExit }: { onExit: () => void }) {
  return (
    <>
      <Toolbar onExit={onExit} />
      <Hotbar />
      <PropertiesPanel />
      <HelpOverlay />
    </>
  )
}
