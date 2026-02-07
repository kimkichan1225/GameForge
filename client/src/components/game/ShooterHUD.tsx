import { memo, useEffect, useState, useCallback } from 'react'
import { useGameStore, WEAPON_CONFIG } from '../../stores/gameStore'
import type { WeaponType } from '../../stores/gameStore'

// 탄퍼짐 설정 (BulletEffects.tsx와 동일)
const SPREAD_CONFIG = {
  baseSpread: { rifle: 1.5, shotgun: 5.0, sniper: 5.0 } as Record<string, number>,
  aimMultiplier: { none: 1.0, hold: 0.5, toggle: 0.3 } as Record<string, number>,
  postureMultiplier: { standing: 1.0, sitting: 0.8, crawling: 0.6 } as Record<string, number>,
  moveAddition: { idle: 0, walk: 0.5, run: 1.5, jump: 3.0 } as Record<string, number>,
}

// 크로스헤어 설정
const CROSSHAIR_LINE_LEN = 8
const CROSSHAIR_LINE_WIDTH = 2
const CROSSHAIR_MIN_GAP = 2

// 각도(도)를 화면 픽셀로 변환
function spreadToPixels(spreadDegrees: number, screenHeight: number, fov: number): number {
  const spreadRad = spreadDegrees * (Math.PI / 180)
  const fovRad = fov * (Math.PI / 180)
  const pixels = Math.tan(spreadRad) / Math.tan(fovRad / 2) * (screenHeight / 2)
  return Math.max(CROSSHAIR_MIN_GAP, pixels)
}

// ============ 크로스헤어 컴포넌트 ============
const Crosshair = memo(function Crosshair() {
  const weaponType = useGameStore(s => s.weaponType)
  const aimState = useGameStore(s => s.aimState)
  const posture = useGameStore(s => s.posture)
  const moveState = useGameStore(s => s.moveState)
  const spreadAccum = useGameStore(s => s.spreadAccum)
  const currentFov = useGameStore(s => s.currentFov)
  const isToggleAiming = useGameStore(s => s.isToggleAiming)

  const [screenHeight, setScreenHeight] = useState(window.innerHeight)
  useEffect(() => {
    const onResize = () => setScreenHeight(window.innerHeight)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // 스나이퍼 스코프 시 숨김
  if (weaponType === 'sniper' && isToggleAiming) return null

  // totalSpread 계산 (BulletEffects와 동일 공식)
  const baseSpread = SPREAD_CONFIG.baseSpread[weaponType] || 1.5
  const aimMult = (weaponType === 'sniper' && aimState === 'toggle')
    ? 0.1
    : (SPREAD_CONFIG.aimMultiplier[aimState] || 1.0)
  const postureMult = SPREAD_CONFIG.postureMultiplier[posture] || 1.0
  const moveAdd = SPREAD_CONFIG.moveAddition[moveState] || 0
  const totalSpread = (baseSpread * aimMult * postureMult) + moveAdd + spreadAccum

  const gap = spreadToPixels(totalSpread, screenHeight, currentFov)

  return (
    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none z-10">
      {/* 상 */}
      <div className="absolute left-1/2 -translate-x-1/2" style={{
        width: CROSSHAIR_LINE_WIDTH, height: CROSSHAIR_LINE_LEN,
        background: 'white', boxShadow: '0 0 2px black',
        top: -gap - CROSSHAIR_LINE_LEN, transition: 'top 0.1s',
      }} />
      {/* 하 */}
      <div className="absolute left-1/2 -translate-x-1/2" style={{
        width: CROSSHAIR_LINE_WIDTH, height: CROSSHAIR_LINE_LEN,
        background: 'white', boxShadow: '0 0 2px black',
        top: gap, transition: 'top 0.1s',
      }} />
      {/* 좌 */}
      <div className="absolute top-1/2 -translate-y-1/2" style={{
        width: CROSSHAIR_LINE_LEN, height: CROSSHAIR_LINE_WIDTH,
        background: 'white', boxShadow: '0 0 2px black',
        left: -gap - CROSSHAIR_LINE_LEN, transition: 'left 0.1s',
      }} />
      {/* 우 */}
      <div className="absolute top-1/2 -translate-y-1/2" style={{
        width: CROSSHAIR_LINE_LEN, height: CROSSHAIR_LINE_WIDTH,
        background: 'white', boxShadow: '0 0 2px black',
        left: gap, transition: 'left 0.1s',
      }} />
      {/* 중앙 점 */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full" style={{
        width: 2, height: 2, background: 'rgba(255,255,255,0.5)',
      }} />
    </div>
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

// ============ 무기 선택 ============
const WEAPONS: { type: WeaponType; label: string; key: string }[] = [
  { type: 'rifle', label: 'Rifle', key: '1' },
  { type: 'shotgun', label: 'Shotgun', key: '2' },
  { type: 'sniper', label: 'Sniper', key: '3' },
]

const WeaponSelector = memo(function WeaponSelector({
  onWeaponChange,
}: {
  onWeaponChange?: (weapon: WeaponType) => void
}) {
  const weaponType = useGameStore(s => s.weaponType)

  const handleChange = useCallback((weapon: WeaponType) => {
    if (weapon === weaponType) return
    onWeaponChange?.(weapon)
  }, [weaponType, onWeaponChange])

  useEffect(() => {
    if (!onWeaponChange) return
    const onKeyDown = (e: KeyboardEvent) => {
      const w = WEAPONS.find(w => w.key === e.key)
      if (w) handleChange(w.type)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [handleChange, onWeaponChange])

  if (!onWeaponChange) return null

  return (
    <div className="absolute top-14 left-4 z-10 flex gap-1">
      {WEAPONS.map(w => (
        <button
          key={w.type}
          onClick={() => handleChange(w.type)}
          className={`px-3 py-1.5 rounded text-xs font-medium pointer-events-auto transition-colors ${
            weaponType === w.type
              ? 'bg-sky-500 text-white'
              : 'bg-slate-700/80 text-white/60 hover:bg-slate-600/80 hover:text-white/80'
          }`}
        >
          <span className="text-white/40 mr-1">{w.key}</span>{w.label}
        </button>
      ))}
    </div>
  )
})

// ============ ShooterHUD 메인 ============
const ShooterHUD = memo(function ShooterHUD({
  onExit,
  onWeaponChange,
}: {
  onExit: () => void
  onWeaponChange?: (weapon: WeaponType) => void
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
      <WeaponSelector onWeaponChange={onWeaponChange} />
      <ControlsHelp />

      <div className="absolute top-4 left-4 z-10 bg-slate-800/80 backdrop-blur-sm rounded-lg px-4 py-2 text-white text-sm">
        ESC - 에디터로 돌아가기
      </div>
    </>
  )
})

export default ShooterHUD
