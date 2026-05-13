import { create } from 'zustand'

export type StatusType = 'info' | 'error' | 'success' | 'warning'

const DEFAULT_MESSAGE = '서버에 안정적으로 연결되었습니다. 실시간 시세 데이터 스트리밍 중입니다.'

interface StatusState {
  message: string
  type: StatusType
  timerId: number | null
  setMessage: (msg: string, type?: StatusType, autoClear?: boolean) => void
  clearMessage: () => void
}

export const useStatusStore = create<StatusState>((set, get) => ({
  message: DEFAULT_MESSAGE,
  type: 'info',
  timerId: null,
  setMessage: (message, type = 'info', autoClear = true) => {
    // 기존 타이머가 있으면 제거
    const currentTimerId = get().timerId
    if (currentTimerId) {
      clearTimeout(currentTimerId)
    }

    let newTimerId = null
    if (autoClear) {
      newTimerId = window.setTimeout(() => {
        set({ message: DEFAULT_MESSAGE, type: 'info', timerId: null })
      }, 5000)
    }

    set({ message, type, timerId: newTimerId })
  },
  clearMessage: () => set({ message: DEFAULT_MESSAGE, type: 'info', timerId: null })
}))

/**
 * React 컴포넌트 외부(API Interceptor, WebSocket 등)에서도 
 * 상태바 메시지를 변경할 수 있게 해주는 전역 함수입니다.
 */
export const setStatusMessage = (msg: string, type: StatusType = 'info', autoClear: boolean = true) => {
  useStatusStore.getState().setMessage(msg, type, autoClear)
}
