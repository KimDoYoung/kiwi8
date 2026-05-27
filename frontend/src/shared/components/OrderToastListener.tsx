import { useEffect, useRef } from 'react'
import { useWsStore } from '@/store/wsStore'
import { useMessageStore } from '@/store/messageStore'

function isBuy(sellBuy: string) {
  return sellBuy === '01' || sellBuy === '1'  // KIS/LS 공통: '01'=매수 '02'=매도
}

export default function OrderToastListener() {
  const orderEvents = useWsStore((s) => s.orderEvents)
  const addMessage = useMessageStore((s) => s.addMessage)
  const setPosition = useMessageStore((s) => s.setPosition)
  const lastLen = useRef(0)

  useEffect(() => {
    setPosition('top-right')
  }, [setPosition])

  useEffect(() => {
    if (orderEvents.length > lastLen.current) {
      const o = orderEvents[0]
      const buy = isBuy(o.sell_buy)
      const side = buy ? '매수' : '매도'
      const name = o.stock_name || o.stock_code
      const price = Number(o.ccnl_price).toLocaleString('ko-KR')
      addMessage({
        text: `[${o.broker.toUpperCase()}] ${name} ${side} | 수량: ${o.ccnl_qty} | 체결가: ${price}`,
        type: buy ? 'success' : 'warning',
        duration: 0,
      })
    }
    lastLen.current = orderEvents.length
  }, [orderEvents, addMessage])

  return null
}
