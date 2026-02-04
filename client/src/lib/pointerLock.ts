import { useMultiplayerGameStore } from '../stores/multiplayerGameStore'

// 타이머 ID를 추적하여 중복 타이머 방지
let messageTimeoutId: ReturnType<typeof setTimeout> | null = null

/**
 * 포인터 락 요청 (실패 시 메시지 표시)
 * @param element 포인터 락을 요청할 HTML 엘리먼트
 */
export async function requestPointerLock(element: HTMLElement): Promise<boolean> {
  try {
    await element.requestPointerLock()
    // 성공 시 기존 타이머 정리 및 메시지 제거
    if (messageTimeoutId) {
      clearTimeout(messageTimeoutId)
      messageTimeoutId = null
    }
    useMultiplayerGameStore.getState().setPointerLockMessage(null)
    return true
  } catch {
    // 기존 타이머가 있으면 취소 (빠른 클릭 시 타이머 중복 방지)
    if (messageTimeoutId) {
      clearTimeout(messageTimeoutId)
    }
    useMultiplayerGameStore.getState().setPointerLockMessage('잠시 후 다시 클릭해주세요')
    messageTimeoutId = setTimeout(() => {
      useMultiplayerGameStore.getState().setPointerLockMessage(null)
      messageTimeoutId = null
    }, 2000)
    return false
  }
}

/**
 * 포인터 락 요청 (실패 무시, 메시지 없음)
 * @param element 포인터 락을 요청할 HTML 엘리먼트
 */
export function requestPointerLockSilent(element: HTMLElement): void {
  element.requestPointerLock().catch(() => {})
}
