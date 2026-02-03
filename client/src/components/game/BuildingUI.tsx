import { useState, useEffect, useCallback, memo, useMemo } from 'react'
import { useMultiplayerGameStore, type PlayerBuildingStatus } from '../../stores/multiplayerGameStore'
import type { PlaceableType } from '../../stores/editorStore'

// 시간 포맷
function formatTime(seconds: number): string {
  if (seconds < 0) return '∞'
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

// 플레이어 상태 아이콘
function PlayerStatusIcon({ status }: { status: PlayerBuildingStatus }) {
  if (status.isVerified) {
    return <span className="text-green-400">✓</span>
  }
  if (status.isTesting) {
    return <span className="text-yellow-400">🎮</span>
  }
  return <span className="text-white/50">⏳</span>
}

// 플레이어 상태 패널
const PlayerStatusPanel = memo(function PlayerStatusPanel({
  players,
  onVoteKick,
  canVoteKick,
}: {
  players: PlayerBuildingStatus[]
  onVoteKick: (playerId: string) => void
  canVoteKick: boolean
}) {
  return (
    <div className="bg-slate-800/80 backdrop-blur-sm rounded-lg p-3 border border-white/10">
      <div className="text-white/70 text-sm font-medium mb-2">플레이어 상태</div>
      <div className="space-y-1">
        {players.map(player => (
          <div key={player.playerId} className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <PlayerStatusIcon status={player} />
              <span className={player.isVerified ? 'text-green-300' : 'text-white/80'}>
                {player.nickname}
              </span>
            </div>
            {canVoteKick && !player.isVerified && (
              <button
                onClick={() => onVoteKick(player.playerId)}
                className="text-xs text-red-400 hover:text-red-300"
              >
                강퇴
              </button>
            )}
          </div>
        ))}
      </div>
      <div className="mt-2 pt-2 border-t border-white/10 text-xs text-white/50">
        <div>✓ 검증됨</div>
        <div>🎮 테스트 중</div>
        <div>⏳ 대기</div>
      </div>
    </div>
  )
})

// 마커 타입 정의
type MarkerType = 'spawn' | 'finish' | 'checkpoint' | 'killzone'

// 핫바 (오브젝트/마커 선택)
const Hotbar = memo(function Hotbar({
  currentPlaceable,
  currentMarker,
  onSelectPlaceable,
  onSelectMarker,
  onSetSelectMode,
  hasSpawn,
  hasFinish,
  isVerified,
}: {
  currentPlaceable: PlaceableType | null
  currentMarker: MarkerType | null
  onSelectPlaceable: (type: PlaceableType | null) => void
  onSelectMarker: (type: MarkerType | null) => void
  onSetSelectMode: () => void
  hasSpawn: boolean
  hasFinish: boolean
  isVerified: boolean
}) {
  const placeables: { type: PlaceableType; label: string; key: string }[] = [
    { type: 'box', label: 'Box', key: '1' },
    { type: 'cylinder', label: 'Cyl', key: '2' },
    { type: 'sphere', label: 'Sphere', key: '3' },
    { type: 'plane', label: 'Plane', key: '4' },
    { type: 'ramp', label: 'Ramp', key: '5' },
  ]

  const markers: { type: MarkerType; label: string; key: string; placed?: boolean; color: string }[] = [
    { type: 'spawn', label: 'Start', key: '6', placed: hasSpawn, color: 'bg-green-500' },
    { type: 'finish', label: 'Finish', key: '7', placed: hasFinish, color: 'bg-red-500' },
    { type: 'checkpoint', label: 'Check', key: '8', color: 'bg-yellow-500' },
    { type: 'killzone', label: 'Kill', key: '9', color: 'bg-purple-500' },
  ]

  const isSelectMode = currentPlaceable === null && currentMarker === null

  // 키보드 단축키
  useEffect(() => {
    if (isVerified) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return

      const key = e.key
      if (key >= '1' && key <= '5') {
        onSelectMarker(null)
        onSelectPlaceable(placeables[parseInt(key) - 1].type)
      }
      if (key === '6') {
        onSelectPlaceable(null)
        onSelectMarker('spawn')
      }
      if (key === '7') {
        onSelectPlaceable(null)
        onSelectMarker('finish')
      }
      if (key === '8') {
        onSelectPlaceable(null)
        onSelectMarker('checkpoint')
      }
      if (key === '9') {
        onSelectPlaceable(null)
        onSelectMarker('killzone')
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isVerified, onSelectPlaceable, onSelectMarker])

  if (isVerified) {
    return (
      <div className="bg-slate-800/80 backdrop-blur-sm rounded-lg px-4 py-2 text-center text-white/70">
        검증 완료 - 읽기 전용
      </div>
    )
  }

  return (
    <div className="bg-slate-800/80 backdrop-blur-sm rounded-lg p-2 border border-white/10">
      <div className="flex items-center gap-1">
        {/* 선택 모드 */}
        <button
          onClick={onSetSelectMode}
          className={`px-3 py-1.5 rounded text-sm ${
            isSelectMode
              ? 'bg-sky-500 text-white'
              : 'bg-slate-700 text-white/70 hover:bg-slate-600'
          }`}
        >
          [Q]선택
        </button>

        <div className="w-px h-6 bg-white/20 mx-1" />

        {/* 오브젝트 */}
        {placeables.map(item => (
          <button
            key={item.type}
            onClick={() => { onSelectMarker(null); onSelectPlaceable(item.type) }}
            className={`px-3 py-1.5 rounded text-sm ${
              currentMarker === null && currentPlaceable === item.type
                ? 'bg-violet-500 text-white'
                : 'bg-slate-700 text-white/70 hover:bg-slate-600'
            }`}
          >
            [{item.key}]{item.label}
          </button>
        ))}

        <div className="w-px h-6 bg-white/20 mx-1" />

        {/* 마커 */}
        {markers.map(item => (
          <button
            key={item.type}
            onClick={() => { onSelectPlaceable(null); onSelectMarker(currentMarker === item.type ? null : item.type) }}
            className={`px-3 py-1.5 rounded text-sm ${
              currentMarker === item.type
                ? `${item.color} text-white`
                : item.placed
                  ? 'bg-slate-600 text-white/50'
                  : 'bg-slate-700 text-white/70 hover:bg-slate-600'
            }`}
          >
            [{item.key}]{item.label}
            {item.placed && <span className="ml-1">✓</span>}
          </button>
        ))}
      </div>
    </div>
  )
})

// 테스트 시작 확인 모달
const TestConfirmModal = memo(function TestConfirmModal({
  onConfirm,
  onCancel,
}: {
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-slate-800 rounded-xl p-6 max-w-md border border-white/20">
        <div className="text-xl font-bold text-yellow-400 mb-4">⚠️ 테스트 플레이 시작</div>
        <p className="text-white/80 mb-2">
          테스트에서 Start부터 Finish까지 완주하면 검증이 완료됩니다.
        </p>
        <p className="text-red-400 mb-6">
          ⚠️ 검증 완료 후에는 맵을 수정할 수 없습니다!
        </p>
        <div className="flex gap-4">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2 bg-slate-600 hover:bg-slate-500 text-white rounded-lg"
          >
            취소
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 px-4 py-2 bg-green-500 hover:bg-green-400 text-white rounded-lg font-medium"
          >
            시작하기
          </button>
        </div>
      </div>
    </div>
  )
})

// 시간 연장 알림 모달
const TimeExtendedModal = memo(function TimeExtendedModal({
  unverifiedPlayers,
  onClose,
}: {
  unverifiedPlayers: Array<{ playerId: string; nickname: string }>
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-slate-800 rounded-xl p-6 max-w-md border border-white/20" onClick={e => e.stopPropagation()}>
        <div className="text-xl font-bold text-yellow-400 mb-4">⏰ 시간 종료 - 30초 연장</div>
        <p className="text-white/80 mb-4">
          아직 검증을 완료하지 않은 플레이어:
        </p>
        <ul className="mb-6 space-y-1">
          {unverifiedPlayers.map(p => (
            <li key={p.playerId} className="text-red-400">
              • {p.nickname} - 검증 필요
            </li>
          ))}
        </ul>
        <button
          onClick={onClose}
          className="w-full px-4 py-2 bg-slate-600 hover:bg-slate-500 text-white rounded-lg"
        >
          확인
        </button>
      </div>
    </div>
  )
})

// 모두 검증 완료 모달
const AllVerifiedModal = memo(function AllVerifiedModal({
  countdown,
  shuffledOrder,
}: {
  countdown: number
  shuffledOrder: Array<{ playerId: string; nickname: string }>
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-slate-800 rounded-xl p-6 max-w-md border border-white/20 text-center">
        <div className="text-4xl mb-2">🎉</div>
        <div className="text-xl font-bold text-green-400 mb-4">모든 플레이어 검증 완료!</div>
        <p className="text-white/80 mb-4">
          {countdown}초 후 레이스가 시작됩니다...
        </p>
        {shuffledOrder.length > 0 && (
          <div className="text-white/60 text-sm">
            <div className="mb-2">릴레이 순서:</div>
            <div className="flex flex-wrap justify-center gap-2">
              {shuffledOrder.map((p, i) => (
                <span key={p.playerId}>
                  {i + 1}. {p.nickname}
                  {i < shuffledOrder.length - 1 && ' →'}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
})

// 마커 상태 표시
const MarkerStatus = memo(function MarkerStatus({
  hasSpawn,
  hasFinish,
}: {
  hasSpawn: boolean
  hasFinish: boolean
}) {
  return (
    <div className="bg-slate-800/80 backdrop-blur-sm rounded-lg px-4 py-2 flex items-center gap-4 text-sm">
      <div className={hasSpawn ? 'text-green-400' : 'text-white/50'}>
        {hasSpawn ? '✓' : '✗'} Start 배치됨
      </div>
      <div className="w-px h-4 bg-white/20" />
      <div className={hasFinish ? 'text-green-400' : 'text-white/50'}>
        {hasFinish ? '✓' : '✗'} Finish 배치됨
      </div>
    </div>
  )
})

// 0.5 단위로 스냅
const snap = (val: number) => Math.round(val * 2) / 2

// 축 라벨 상수
const AXES = ['X', 'Y', 'Z'] as const

// 속성 패널 (우클릭으로 오브젝트 선택 시 표시)
const PropertiesPanel = memo(function PropertiesPanel({
  selectedId,
  onClose,
  isVerified,
}: {
  selectedId: string | null
  onClose: () => void
  isVerified: boolean
}) {
  const objects = useMultiplayerGameStore(state => state.myObjects)
  const markers = useMultiplayerGameStore(state => state.myMarkers)
  const updateObject = useMultiplayerGameStore(state => state.updateObject)
  const updateMarker = useMultiplayerGameStore(state => state.updateMarker)
  const removeObject = useMultiplayerGameStore(state => state.removeObject)
  const removeMarker = useMultiplayerGameStore(state => state.removeMarker)

  // 선택된 오브젝트/마커 메모이제이션
  const selectedObject = useMemo(() => {
    if (!selectedId || selectedId.startsWith('marker_')) return null
    return objects.find(o => o.id === selectedId) || null
  }, [selectedId, objects])

  const selectedMarker = useMemo(() => {
    if (!selectedId || !selectedId.startsWith('marker_')) return null
    return markers.find(m => m.id === selectedId.replace('marker_', '')) || null
  }, [selectedId, markers])

  // 오브젝트 속성 변경 핸들러
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

  const handleDelete = useCallback(async () => {
    if (selectedObject) {
      await removeObject(selectedObject.id)
      onClose()
    } else if (selectedMarker) {
      await removeMarker(selectedMarker.id)
      onClose()
    }
  }, [selectedObject?.id, selectedMarker?.id, removeObject, removeMarker, onClose])

  if (!selectedObject && !selectedMarker) return null

  return (
    <div className="absolute top-20 right-4 z-20 w-64 bg-slate-800/95 backdrop-blur-sm rounded-xl p-4 border border-white/10 shadow-xl">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-4">
        <span className="text-white font-medium">
          {selectedObject?.name || selectedMarker?.type.replace('_', ' ')}
        </span>
        <div className="flex gap-2">
          {!isVerified && (
            <button
              onClick={handleDelete}
              className="text-red-400 hover:text-red-300 text-xs px-2 py-1 bg-red-500/10 rounded"
            >
              Delete
            </button>
          )}
          <button
            onClick={onClose}
            className="text-white/50 hover:text-white text-lg leading-none"
          >
            ×
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
                disabled={isVerified}
                className="w-10 h-8 rounded cursor-pointer border-0 disabled:opacity-50"
              />
              <input
                type="text"
                value={selectedObject.color}
                onChange={(e) => handleColorChange(e.target.value)}
                disabled={isVerified}
                className="flex-1 px-2 py-1 bg-white/5 border border-white/10 rounded text-white text-xs focus:outline-none focus:border-sky-400 uppercase disabled:opacity-50"
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
                    disabled={isVerified}
                    className="w-full px-2 py-1.5 bg-white/5 border border-white/10 rounded text-white text-xs focus:outline-none focus:border-sky-400 disabled:opacity-50"
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
                    disabled={isVerified}
                    className="w-full px-2 py-1.5 bg-white/5 border border-white/10 rounded text-white text-xs focus:outline-none focus:border-sky-400 disabled:opacity-50"
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
                    disabled={isVerified}
                    className="w-full px-2 py-1.5 bg-white/5 border border-white/10 rounded text-white text-xs focus:outline-none focus:border-sky-400 disabled:opacity-50"
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
                    disabled={isVerified}
                    className="w-full px-2 py-1.5 bg-white/5 border border-white/10 rounded text-white text-xs focus:outline-none focus:border-sky-400 disabled:opacity-50"
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
                    disabled={isVerified}
                    className="w-full px-2 py-1.5 bg-white/5 border border-white/10 rounded text-white text-xs focus:outline-none focus:border-sky-400 disabled:opacity-50"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="mt-4 pt-3 border-t border-white/10 text-white/30 text-[10px]">
        {isVerified ? '읽기 전용' : 'ESC로 닫기'}
      </div>
    </div>
  )
})

// 메인 UI 컴포넌트
interface BuildingUIProps {
  currentPlaceable: PlaceableType | null
  currentMarker: MarkerType | null
  onSelectPlaceable: (type: PlaceableType | null) => void
  onSelectMarker: (type: MarkerType | null) => void
  onStartTest: () => void
  onSetSelectMode: () => void
}

export function BuildingUI({
  currentPlaceable,
  currentMarker,
  onSelectPlaceable,
  onSelectMarker,
  onStartTest,
  onSetSelectMode,
}: BuildingUIProps) {
  const region = useMultiplayerGameStore(state => state.myRegion)
  const timeRemaining = useMultiplayerGameStore(state => state.buildingTimeRemaining)
  const myVerified = useMultiplayerGameStore(state => state.myVerified)
  const myTesting = useMultiplayerGameStore(state => state.myTesting)
  const myMarkers = useMultiplayerGameStore(state => state.myMarkers)
  const allPlayersStatus = useMultiplayerGameStore(state => state.allPlayersStatus)
  const voteKick = useMultiplayerGameStore(state => state.voteKick)
  const selectedIds = useMultiplayerGameStore(state => state.buildingSelectedIds)
  const setBuildingSelectedIds = useMultiplayerGameStore(state => state.setBuildingSelectedIds)

  // 첫 번째 선택된 아이템만 속성 패널에 표시
  const selectedId = selectedIds.length > 0 ? selectedIds[0] : null

  const [showTestConfirm, setShowTestConfirm] = useState(false)
  const [showTimeExtended, setShowTimeExtended] = useState(false)
  const [unverifiedPlayers, setUnverifiedPlayers] = useState<Array<{ playerId: string; nickname: string }>>([])
  const [allVerifiedCountdown, setAllVerifiedCountdown] = useState<number | null>(null)
  const [shuffledOrder, setShuffledOrder] = useState<Array<{ playerId: string; nickname: string }>>([])
  const [voteKickStatus, setVoteKickStatus] = useState<{
    targetPlayerId: string;
    nickname: string;
    currentVotes: number;
    votesNeeded: number;
  } | null>(null)

  const hasSpawn = myMarkers.some(m => m.type === 'spawn')
  const hasFinish = myMarkers.some(m => m.type === 'finish')
  const canTest = hasSpawn && hasFinish && !myVerified && !myTesting

  // 강퇴 투표 가능 여부 (시간 연장 상태이고 내가 검증 완료됨)
  const canVoteKick = myVerified && timeRemaining <= 30 && timeRemaining > 0

  // 소켓 이벤트 리스너
  useEffect(() => {
    const socket = (window as unknown as { socketManager?: { getSocket: () => unknown } }).socketManager?.getSocket?.()
    if (!socket) return

    const handleTimeExtended = (data: { newRemaining: number; unverifiedPlayers: Array<{ playerId: string; nickname: string }> }) => {
      setUnverifiedPlayers(data.unverifiedPlayers)
      setShowTimeExtended(true)
    }

    const handleAllVerified = () => {
      // 카운트다운 시작
      setAllVerifiedCountdown(3)
    }

    const handleEarlyStartCountdown = (data: { countdown: number }) => {
      setAllVerifiedCountdown(data.countdown)
    }

    const handleCompleted = (data: { shuffledOrder: Array<{ playerId: string; nickname: string }> }) => {
      setShuffledOrder(data.shuffledOrder)
    }

    const handleVoteKickUpdate = (data: {
      targetPlayerId: string;
      nickname: string;
      currentVotes: number;
      votesNeeded: number;
    }) => {
      setVoteKickStatus(data)
    }

    const handlePlayerKicked = (data: { playerId: string }) => {
      // 투표가 완료되면 상태 초기화
      setVoteKickStatus(prev => prev?.targetPlayerId === data.playerId ? null : prev)
    }

    // @ts-expect-error socket.io types
    socket.on('build:timeExtended', handleTimeExtended)
    // @ts-expect-error socket.io types
    socket.on('build:allVerified', handleAllVerified)
    // @ts-expect-error socket.io types
    socket.on('build:earlyStartCountdown', handleEarlyStartCountdown)
    // @ts-expect-error socket.io types
    socket.on('build:completed', handleCompleted)
    // @ts-expect-error socket.io types
    socket.on('build:voteKickUpdate', handleVoteKickUpdate)
    // @ts-expect-error socket.io types
    socket.on('build:playerKicked', handlePlayerKicked)

    return () => {
      // @ts-expect-error socket.io types
      socket.off('build:timeExtended', handleTimeExtended)
      // @ts-expect-error socket.io types
      socket.off('build:allVerified', handleAllVerified)
      // @ts-expect-error socket.io types
      socket.off('build:earlyStartCountdown', handleEarlyStartCountdown)
      // @ts-expect-error socket.io types
      socket.off('build:completed', handleCompleted)
      // @ts-expect-error socket.io types
      socket.off('build:voteKickUpdate', handleVoteKickUpdate)
      // @ts-expect-error socket.io types
      socket.off('build:playerKicked', handlePlayerKicked)
    }
  }, [])

  const handleTestClick = useCallback(() => {
    if (!canTest) return
    setShowTestConfirm(true)
  }, [canTest])

  const handleTestConfirm = useCallback(() => {
    setShowTestConfirm(false)
    onStartTest()
  }, [onStartTest])

  const handleVoteKick = useCallback(async (targetPlayerId: string) => {
    await voteKick(targetPlayerId)
  }, [voteKick])

  // 테스트 중이면 UI 숨김
  if (myTesting) {
    return null
  }

  return (
    <>
      {/* 상단 바 */}
      <div className="absolute top-4 left-0 right-0 z-10 flex justify-center gap-4">
        {/* 타이머 */}
        <div className="bg-slate-800/80 backdrop-blur-sm rounded-lg px-6 py-2 flex items-center gap-4">
          <div className="text-2xl font-mono text-white font-bold">
            ⏱️ {formatTime(timeRemaining)}
          </div>
          {myVerified && (
            <div className="text-green-400 font-medium">✅ 검증 완료!</div>
          )}
        </div>

        {/* 영역 정보 */}
        {region && (
          <div className="bg-slate-800/80 backdrop-blur-sm rounded-lg px-4 py-2 text-white/70">
            구간: {region.startX}m ~ {region.endX}m
          </div>
        )}
      </div>

      {/* 좌측 플레이어 상태 패널 */}
      <div className="absolute top-20 left-4 z-10">
        <PlayerStatusPanel
          players={allPlayersStatus}
          onVoteKick={handleVoteKick}
          canVoteKick={canVoteKick}
        />
      </div>

      {/* 우측 속성 패널 또는 테스트 버튼 */}
      {selectedId ? (
        <PropertiesPanel
          selectedId={selectedId}
          onClose={() => setBuildingSelectedIds([])}
          isVerified={myVerified}
        />
      ) : !myVerified && (
        <div className="absolute top-20 right-4 z-10">
          <button
            onClick={handleTestClick}
            disabled={!canTest}
            className={`px-6 py-3 rounded-lg font-medium text-lg ${
              canTest
                ? 'bg-green-500 hover:bg-green-400 text-white'
                : 'bg-slate-600 text-white/50 cursor-not-allowed'
            }`}
          >
            테스트 ▶️
          </button>
          {!canTest && !hasSpawn && (
            <div className="text-yellow-400 text-sm mt-2 text-right">Start 마커 필요</div>
          )}
          {!canTest && hasSpawn && !hasFinish && (
            <div className="text-yellow-400 text-sm mt-2 text-right">Finish 마커 필요</div>
          )}
        </div>
      )}

      {/* 검증 완료 대기 화면 */}
      {myVerified && (
        <div className="absolute inset-0 z-5 flex items-center justify-center pointer-events-none">
          <div className="bg-slate-800/60 backdrop-blur-sm rounded-xl p-8 text-center">
            <div className="text-green-400 text-xl font-bold mb-2">✅ 검증 완료!</div>
            <div className="text-white/70">다른 플레이어를 기다리는 중...</div>
          </div>
        </div>
      )}

      {/* 하단 핫바 */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center gap-2">
        <Hotbar
          currentPlaceable={currentPlaceable}
          currentMarker={currentMarker}
          onSelectPlaceable={onSelectPlaceable}
          onSelectMarker={onSelectMarker}
          onSetSelectMode={onSetSelectMode}
          hasSpawn={hasSpawn}
          hasFinish={hasFinish}
          isVerified={myVerified}
        />
        <MarkerStatus hasSpawn={hasSpawn} hasFinish={hasFinish} />
      </div>

      {/* 조작 설명 */}
      <div className="absolute bottom-6 left-4 z-10 bg-slate-800/70 backdrop-blur-sm rounded-xl p-3 border border-white/10 text-white/60 text-xs">
        <div className="grid grid-cols-2 gap-x-4 gap-y-1">
          <span>클릭</span><span>마우스 잠금</span>
          <span>WASD</span><span>카메라 이동</span>
          <span>Space/C</span><span>상승/하강</span>
          <span>Q</span><span>선택 모드</span>
          <span>좌클릭</span><span>배치/선택</span>
          <span>Shift+클릭</span><span>다중 선택</span>
          <span>Delete</span><span>삭제</span>
          <span>Ctrl+Z/Y</span><span>Undo/Redo</span>
          <span>Ctrl+C/V</span><span>복사/붙여넣기</span>
          <span>1-5</span><span>오브젝트 선택</span>
          <span>6-9</span><span>마커 선택</span>
        </div>
      </div>

      {/* 모달들 */}
      {showTestConfirm && (
        <TestConfirmModal
          onConfirm={handleTestConfirm}
          onCancel={() => setShowTestConfirm(false)}
        />
      )}

      {showTimeExtended && (
        <TimeExtendedModal
          unverifiedPlayers={unverifiedPlayers}
          onClose={() => setShowTimeExtended(false)}
        />
      )}

      {allVerifiedCountdown !== null && (
        <AllVerifiedModal
          countdown={allVerifiedCountdown}
          shuffledOrder={shuffledOrder}
        />
      )}

      {/* 강퇴 투표 현황 표시 */}
      {voteKickStatus && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 bg-slate-800/95 backdrop-blur-sm rounded-lg px-6 py-3 border border-red-500/30 shadow-xl">
          <div className="flex items-center gap-4">
            <div className="text-red-400 text-lg">🗳️</div>
            <div>
              <div className="text-white font-medium">
                {voteKickStatus.nickname} 강퇴 투표 진행 중
              </div>
              <div className="text-white/70 text-sm">
                현재 투표: <span className="text-yellow-400 font-bold">{voteKickStatus.currentVotes}</span> / {voteKickStatus.votesNeeded} (과반수 필요)
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
