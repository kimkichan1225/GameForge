import { useState, useEffect, useCallback, memo } from 'react'
import { mapService, type MapRecord } from '../../lib/mapService'
import { MapCard } from './MapCard'

type FilterType = 'all' | 'my'
type SortType = 'created_at' | 'play_count'

interface MapBrowserProps {
  onSelect: (map: MapRecord) => void
  onClose: () => void
  selectedMapId?: string
  mode?: 'race' | 'shooter'
  shooterSubMode?: 'ffa' | 'team' | 'domination'
}

export const MapBrowser = memo(function MapBrowser({
  onSelect,
  onClose,
  selectedMapId,
  mode,
  shooterSubMode,
}: MapBrowserProps) {
  const [maps, setMaps] = useState<MapRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<FilterType>('all')
  const [sortBy, setSortBy] = useState<SortType>('created_at')
  const [deleting, setDeleting] = useState<string | null>(null)

  const fetchMaps = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      let result: MapRecord[]

      if (filter === 'my') {
        result = await mapService.getMyMaps(mode, mode === 'shooter' ? shooterSubMode : undefined)
      } else {
        result = await mapService.getPublicMaps({
          sortBy,
          sortOrder: 'desc',
          mode,
          shooterSubMode: mode === 'shooter' ? shooterSubMode : undefined,
        })
      }

      setMaps(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : '맵 목록을 불러올 수 없습니다')
    } finally {
      setLoading(false)
    }
  }, [filter, sortBy, mode, shooterSubMode])

  useEffect(() => {
    fetchMaps()
  }, [fetchMaps])

  const handleDelete = useCallback(async (map: MapRecord) => {
    if (!confirm(`"${map.name}" 맵을 삭제하시겠습니까?`)) {
      return
    }

    setDeleting(map.id)

    try {
      await mapService.deleteMap(map.id)
      setMaps(prev => prev.filter(m => m.id !== map.id))
    } catch (err) {
      alert(err instanceof Error ? err.message : '삭제 실패')
    } finally {
      setDeleting(null)
    }
  }, [])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose}></div>

      <div className="relative w-full max-w-4xl max-h-[80vh] bg-slate-900 rounded-2xl border border-white/10 shadow-2xl flex flex-col">
        {/* 헤더 */}
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <h2 className="text-xl font-bold text-white">맵 선택</h2>
          <button
            onClick={onClose}
            className="text-white/50 hover:text-white p-2 hover:bg-white/10 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 필터 및 정렬 */}
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <div className="flex gap-2">
            <button
              onClick={() => setFilter('all')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                filter === 'all'
                  ? 'bg-sky-500 text-white'
                  : 'bg-white/5 text-white/70 hover:bg-white/10'
              }`}
            >
              전체 맵
            </button>
            <button
              onClick={() => setFilter('my')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                filter === 'my'
                  ? 'bg-sky-500 text-white'
                  : 'bg-white/5 text-white/70 hover:bg-white/10'
              }`}
            >
              내 맵
            </button>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-white/50 text-sm">정렬:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortType)}
              className="bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-sky-400"
            >
              <option value="created_at">최신순</option>
              <option value="play_count">인기순</option>
            </select>
            <button
              onClick={fetchMaps}
              disabled={loading}
              className="p-2 text-white/50 hover:text-white hover:bg-white/10 rounded-lg transition-colors disabled:opacity-50"
            >
              <svg className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </div>
        </div>

        {/* 맵 목록 */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="text-white/50 flex items-center gap-3">
                <svg className="animate-spin h-6 w-6" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                불러오는 중...
              </div>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-64">
              <div className="text-red-400 mb-4">{error}</div>
              <button
                onClick={fetchMaps}
                className="px-4 py-2 bg-white/10 text-white rounded-lg hover:bg-white/20 transition-colors"
              >
                다시 시도
              </button>
            </div>
          ) : maps.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-white/50">
              <svg className="w-16 h-16 mb-4 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
              <p>{filter === 'my' ? '아직 업로드한 맵이 없습니다' : '아직 공개된 맵이 없습니다'}</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {maps.map((map) => (
                <MapCard
                  key={map.id}
                  map={map}
                  onSelect={onSelect}
                  onDelete={filter === 'my' ? handleDelete : undefined}
                  isOwner={filter === 'my'}
                  selected={map.id === selectedMapId}
                />
              ))}
            </div>
          )}
        </div>

        {/* 삭제 중 오버레이 */}
        {deleting && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center rounded-2xl">
            <div className="text-white flex items-center gap-3">
              <svg className="animate-spin h-6 w-6" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              삭제 중...
            </div>
          </div>
        )}
      </div>
    </div>
  )
})
