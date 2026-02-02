import { memo } from 'react'
import type { MapRecord } from '../../lib/mapService'

interface MapCardProps {
  map: MapRecord
  onSelect: (map: MapRecord) => void
  onDelete?: (map: MapRecord) => void
  isOwner?: boolean
  selected?: boolean
}

export const MapCard = memo(function MapCard({
  map,
  onSelect,
  onDelete,
  isOwner = false,
  selected = false,
}: MapCardProps) {
  const createdDate = new Date(map.created_at).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })

  return (
    <div
      onClick={() => onSelect(map)}
      className={`relative group cursor-pointer rounded-xl overflow-hidden border transition-all hover:-translate-y-1 hover:shadow-xl ${
        selected
          ? 'border-sky-400 ring-2 ring-sky-400/50'
          : 'border-white/10 hover:border-white/20'
      }`}
    >
      {/* 썸네일 */}
      <div className="aspect-video bg-slate-800 relative overflow-hidden">
        {map.thumbnail_url ? (
          <img
            src={map.thumbnail_url}
            alt={map.name}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-white/20">
            <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
          </div>
        )}

        {/* 선택됨 표시 */}
        {selected && (
          <div className="absolute top-2 right-2 bg-sky-500 text-white text-xs px-2 py-1 rounded-full">
            선택됨
          </div>
        )}

        {/* 모드 배지 */}
        <div className="absolute top-2 left-2 bg-green-500/90 text-white text-xs px-2 py-1 rounded-full font-medium">
          Race
        </div>

        {/* 삭제 버튼 (소유자인 경우) */}
        {isOwner && onDelete && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onDelete(map)
            }}
            className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 bg-red-500/90 hover:bg-red-500 text-white p-1.5 rounded-lg transition-all"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        )}
      </div>

      {/* 정보 */}
      <div className="p-3 bg-slate-800/50">
        <h3 className="text-white font-medium text-sm truncate">{map.name}</h3>
        <div className="flex items-center justify-between mt-1">
          <span className="text-white/50 text-xs truncate">{map.creator_username}</span>
          <div className="flex items-center gap-2 text-white/40 text-xs">
            <span className="flex items-center gap-1">
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/>
              </svg>
              {map.play_count}
            </span>
          </div>
        </div>
        <div className="text-white/30 text-xs mt-1">{createdDate}</div>
      </div>
    </div>
  )
})
