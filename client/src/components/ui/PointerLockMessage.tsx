import { useMultiplayerGameStore } from '../../stores/multiplayerGameStore'

interface PointerLockMessageProps {
  visible?: boolean
}

export function PointerLockMessage({ visible = true }: PointerLockMessageProps) {
  const pointerLockMessage = useMultiplayerGameStore(state => state.pointerLockMessage)

  if (!pointerLockMessage || !visible) return null

  return (
    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-slate-800/90 backdrop-blur-sm rounded-lg px-6 py-3">
      <div className="text-yellow-400 text-center">{pointerLockMessage}</div>
    </div>
  )
}
