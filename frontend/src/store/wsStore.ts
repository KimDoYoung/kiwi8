import { create } from 'zustand'

export interface StockCcnl {
  stock_code: string
  price: string
  change: string
  change_rate: string
  volume: string
  acml_volume: string
  time: string
  broker: string
}

export interface OrderCcnl {
  order_no: string
  stock_code: string
  stock_name: string
  sell_buy: string
  ccnl_qty: string
  ccnl_price: string
  ccnl_time: string
  broker: string
}

export interface NewsItem {
  news_id: string
  news_code: string
  title: string
  time: string
  stock_codes: string
  broker: string
  receivedAt: number
}

export interface JifEvent {
  jangubun: string
  jstatus: string
}

export interface KdaemonEvent {
  action: 'BUY' | 'SELL' | 'FIND' | 'ERROR' | 'START' | 'STOP'
  dt: string
  stk_cd?: string
  stk_nm?: string
  price?: number
  qty?: number
  amount?: number
  profit?: number
  profit_rate?: number
  sell_reason?: string
  memo?: string
  deposit?: number
}

export interface WsMessage {
  broker: 'kiwoom' | 'kis' | 'ls' | 'kdaemon'
  type: 'stock_ccnl' | 'order_ccnl' | 'news' | 'market_time' | 'kdaemon_event'
  data: Record<string, unknown>
}

interface WsState {
  connected: boolean
  latestCcnl: Record<string, StockCcnl>
  orderEvents: OrderCcnl[]
  newsItems: NewsItem[]
  marketStatus: Record<string, JifEvent>
  kdaemonEvents: KdaemonEvent[]
  rawLog: { ts: string; text: string }[]
  totalCount: number
  setConnected: (v: boolean) => void
  handleMessage: (msg: WsMessage) => void
  pushRaw: (text: string) => void
  clearKdaemonEvents: () => void
}

export const useWsStore = create<WsState>((set) => ({
  connected: false,
  latestCcnl: {},
  orderEvents: [],
  newsItems: [],
  marketStatus: {},
  kdaemonEvents: [],
  rawLog: [],
  totalCount: 0,

  setConnected: (v) => set({ connected: v }),
  clearKdaemonEvents: () => set({ kdaemonEvents: [] }),

  pushRaw: (text) => set((s) => ({
    totalCount: s.totalCount + 1,
    rawLog: [
      { ts: new Date().toLocaleTimeString('ko-KR', { hour12: false }), text },
      ...s.rawLog,
    ].slice(0, 20),
  })),

  handleMessage: (msg) => {
    const { broker, type, data } = msg

    if (type === 'stock_ccnl') {
      const ccnl = data as unknown as StockCcnl
      const key = `${broker}:${ccnl.stock_code}`
      set((s) => ({
        latestCcnl: { ...s.latestCcnl, [key]: { ...ccnl, broker } },
      }))
    } else if (type === 'order_ccnl') {
      const event = { ...(data as unknown as OrderCcnl), broker }
      set((s) => ({ orderEvents: [event, ...s.orderEvents].slice(0, 100) }))
    } else if (type === 'news') {
      const item: NewsItem = {
        ...(data as unknown as Omit<NewsItem, 'broker' | 'receivedAt'>),
        broker,
        receivedAt: Date.now(),
      }
      set((s) => ({ newsItems: [item, ...s.newsItems].slice(0, 50) }))
    } else if (type === 'market_time') {
      const jif = data as unknown as JifEvent
      if (jif.jangubun) {
        set((s) => ({ marketStatus: { ...s.marketStatus, [jif.jangubun]: jif } }))
      }
    } else if (type === 'kdaemon_event') {
      const ev = data as unknown as KdaemonEvent
      set((s) => ({ kdaemonEvents: [ev, ...s.kdaemonEvents].slice(0, 100) }))
    }
  },
}))
