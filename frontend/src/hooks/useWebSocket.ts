import { useEffect, useRef } from 'react'
import { setStatusMessage } from '@/store/statusStore'
import { useWsStore, type WsMessage } from '@/store/wsStore'

const WS_URL = 'ws://localhost:8003/kiwi8/ws/realtime'
const MAX_RETRY_DELAY = 30000

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null)
  const retryDelayRef = useRef(1000)
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const setConnected = useWsStore((s) => s.setConnected)
  const handleMessage = useWsStore((s) => s.handleMessage)
  const pushRaw = useWsStore((s) => s.pushRaw)

  useEffect(() => {
    let unmounted = false

    function connect() {
      if (unmounted) return

      const ws = new WebSocket(WS_URL)
      wsRef.current = ws

      ws.onopen = () => {
        retryDelayRef.current = 1000
        setConnected(true)
        setStatusMessage('실시간 데이터 스트리밍 연결됨', 'success', false)
      }

      ws.onmessage = (event) => {
        pushRaw(event.data)
        try {
          const msg: WsMessage = JSON.parse(event.data)
          handleMessage(msg)
        } catch {
          // 파싱 실패 무시
        }
      }

      ws.onclose = () => {
        setConnected(false)
        if (unmounted) return
        setStatusMessage(`실시간 연결 끊김. ${retryDelayRef.current / 1000}초 후 재연결...`, 'warning', false)
        retryTimerRef.current = setTimeout(() => {
          retryDelayRef.current = Math.min(retryDelayRef.current * 2, MAX_RETRY_DELAY)
          connect()
        }, retryDelayRef.current)
      }

      ws.onerror = () => {
        ws.close()
      }
    }

    connect()

    return () => {
      unmounted = true
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current)
      if (wsRef.current) wsRef.current.close()
    }
  }, [])
}
