import { memo, useEffect, useRef } from 'react'
import { useGameStore, WEAPON_CONFIG } from '../../stores/gameStore'

// ============ 크로스헤어 컴포넌트 ============
const Crosshair = memo(function Crosshair() {
  const canvasRef = useRef<HTMLCanvasElement>(null!)
  const rafRef = useRef(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const size = 200
    canvas.width = size
    canvas.height = size
    const center = size / 2

    function draw() {
      if (!ctx) return
      const store = useGameStore.getState()
      const { spreadAccum, currentFov, aimState, weaponType } = store
      const wc = WEAPON_CONFIG[weaponType]

      ctx.clearRect(0, 0, size, size)

      // 스나이퍼 스코프 모드에서는 크로스헤어 숨김
      if (weaponType === 'sniper' && aimState !== 'none') {
        rafRef.current = requestAnimationFrame(draw)
        return
      }

      // FOV 기반 스프레드 → 픽셀 변환
      const fovRad = (currentFov * Math.PI) / 180
      const spreadPixels = (spreadAccum / Math.tan(fovRad / 2)) * (size / 2) * 8

      const gap = Math.max(4, spreadPixels)
      const lineLen = 8
      const thickness = 2

      // 크로스헤어 색상
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)'
      ctx.lineWidth = thickness
      ctx.shadowColor = 'rgba(0, 0, 0, 0.5)'
      ctx.shadowBlur = 2

      // 상
      ctx.beginPath()
      ctx.moveTo(center, center - gap)
      ctx.lineTo(center, center - gap - lineLen)
      ctx.stroke()

      // 하
      ctx.beginPath()
      ctx.moveTo(center, center + gap)
      ctx.lineTo(center, center + gap + lineLen)
      ctx.stroke()

      // 좌
      ctx.beginPath()
      ctx.moveTo(center - gap, center)
      ctx.lineTo(center - gap - lineLen, center)
      ctx.stroke()

      // 우
      ctx.beginPath()
      ctx.moveTo(center + gap, center)
      ctx.lineTo(center + gap + lineLen, center)
      ctx.stroke()

      // 중앙 점
      ctx.shadowBlur = 0
      ctx.fillStyle = 'rgba(255, 255, 255, 0.6)'
      ctx.beginPath()
      ctx.arc(center, center, 1.5, 0, Math.PI * 2)
      ctx.fill()

      rafRef.current = requestAnimationFrame(draw)
    }

    rafRef.current = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(rafRef.current)
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none z-10"
      style={{ width: 200, height: 200 }}
    />
  )
})

// ============ 스나이퍼 스코프 오버레이 ============
const SniperScope = memo(function SniperScope() {
  const aimState = useGameStore(state => state.aimState)
  const weaponType = useGameStore(state => state.weaponType)

  if (weaponType !== 'sniper' || aimState === 'none') return null

  return (
    <div className="absolute inset-0 pointer-events-none z-10">
      {/* 비네팅 */}
      <div
        className="absolute inset-0"
        style={{
          background: 'radial-gradient(circle at center, transparent 30%, rgba(0,0,0,0.8) 60%, rgba(0,0,0,1) 80%)',
        }}
      />

      {/* 십자선 */}
      <div className="absolute top-0 left-1/2 w-px h-full bg-black/40" />
      <div className="absolute top-1/2 left-0 w-full h-px bg-black/40" />

      {/* 눈금 */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
        {[-60, -40, -20, 20, 40, 60].map(offset => (
          <div
            key={`h${offset}`}
            className="absolute bg-black/30"
            style={{
              left: offset + 100 - 5,
              top: 99,
              width: 10,
              height: 2,
            }}
          />
        ))}
        {[-60, -40, -20, 20, 40, 60].map(offset => (
          <div
            key={`v${offset}`}
            className="absolute bg-black/30"
            style={{
              left: 99,
              top: offset + 100 - 5,
              width: 2,
              height: 10,
            }}
          />
        ))}
      </div>

      {/* 빨간 중앙점 */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          width: 4,
          height: 4,
          backgroundColor: '#ff0000',
          boxShadow: '0 0 4px rgba(255, 0, 0, 0.8)',
        }}
      />
    </div>
  )
})

// ============ 탄약 표시 ============
const AmmoDisplay = memo(function AmmoDisplay() {
  const currentAmmo = useGameStore(state => state.currentAmmo)
  const reserveAmmo = useGameStore(state => state.reserveAmmo)
  const isReloading = useGameStore(state => state.isReloading)
  const reloadProgress = useGameStore(state => state.reloadProgress)
  const weaponType = useGameStore(state => state.weaponType)

  const config = WEAPON_CONFIG[weaponType]

  return (
    <div className="absolute bottom-6 right-6 z-10">
      {/* 재장전 프로그레스바 */}
      {isReloading && (
        <div className="mb-2 w-40 h-2 bg-white/20 rounded overflow-hidden">
          <div
            className="h-full bg-yellow-400 transition-all duration-75"
            style={{ width: `${reloadProgress * 100}%` }}
          />
        </div>
      )}

      {/* 탄약 카운터 */}
      <div className="bg-slate-900/80 backdrop-blur-sm rounded-lg px-4 py-2 border border-white/10">
        <div className="text-xs text-white/50 mb-1">{config.name}</div>
        <div className="flex items-baseline gap-1">
          <span className={`text-3xl font-mono font-bold ${currentAmmo <= 5 ? 'text-red-400' : 'text-white'}`}>
            {currentAmmo}
          </span>
          <span className="text-white/40 text-lg">/</span>
          <span className="text-white/60 text-lg font-mono">{reserveAmmo}</span>
        </div>
        {isReloading && (
          <div className="text-yellow-400 text-xs mt-1 animate-pulse">재장전 중...</div>
        )}
      </div>
    </div>
  )
})

// ============ 킬/데스 표시 ============
const KillDeathDisplay = memo(function KillDeathDisplay() {
  const kills = useGameStore(state => state.kills)
  const deaths = useGameStore(state => state.deaths)

  return (
    <div className="absolute top-4 right-4 z-10 bg-slate-800/80 backdrop-blur-sm rounded-lg px-4 py-2 text-white text-sm">
      <div className="flex gap-4">
        <span>K: <span className="text-green-400 font-bold">{kills}</span></span>
        <span>D: <span className="text-red-400 font-bold">{deaths}</span></span>
      </div>
    </div>
  )
})

// ============ 체력바 ============
const HealthBar = memo(function HealthBar() {
  const health = useGameStore(state => state.health)

  let barColor = 'bg-green-500'
  if (health <= 30) barColor = 'bg-red-500'
  else if (health <= 60) barColor = 'bg-yellow-500'

  return (
    <div className="absolute bottom-6 left-6 z-10">
      <div className="bg-slate-900/80 backdrop-blur-sm rounded-lg px-4 py-2 border border-white/10">
        <div className="text-xs text-white/50 mb-1">HP</div>
        <div className="w-32 h-3 bg-white/10 rounded overflow-hidden">
          <div
            className={`h-full ${barColor} transition-all duration-200`}
            style={{ width: `${health}%` }}
          />
        </div>
        <div className="text-white text-sm font-mono mt-1">{health}</div>
      </div>
    </div>
  )
})

// ============ 조작 안내 ============
const ControlsHelp = memo(function ControlsHelp() {
  return (
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 bg-slate-800/60 backdrop-blur-sm rounded-xl p-3 border border-white/10 text-white/50 text-xs">
      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
        <span>WASD</span><span>이동</span>
        <span>Shift</span><span>달리기</span>
        <span>Space</span><span>점프</span>
        <span>좌클릭</span><span>발사</span>
        <span>우클릭</span><span>조준 (짧게=토글)</span>
        <span>R</span><span>재장전</span>
        <span>V</span><span>1인칭/3인칭 전환</span>
        <span>C</span><span>앉기</span>
        <span>Z</span><span>엎드리기</span>
      </div>
    </div>
  )
})

// ============ ShooterHUD 메인 ============
const ShooterHUD = memo(function ShooterHUD({
  onExit,
}: {
  onExit: () => void
}) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        document.exitPointerLock()
        onExit()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onExit])

  return (
    <>
      <Crosshair />
      <SniperScope />
      <AmmoDisplay />
      <HealthBar />
      <KillDeathDisplay />
      <ControlsHelp />

      <div className="absolute top-4 left-4 z-10 bg-slate-800/80 backdrop-blur-sm rounded-lg px-4 py-2 text-white text-sm">
        ESC - 에디터로 돌아가기
      </div>
    </>
  )
})

export default ShooterHUD
