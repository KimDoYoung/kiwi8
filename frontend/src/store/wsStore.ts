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
  news_code: string
  title: string
  time: string
  stock_codes: string
  broker: string
  receivedAt: number
}

export type MarketTimeInfo = Record<string, unknown>

export interface WsMessage {
  broker: 'kiwoom' | 'kis' | 'ls'
  type: 'stock_ccnl' | 'order_ccnl' | 'news' | 'market_time'
  data: Record<string, unknown>
}

interface WsState {
  connected: boolean
  latestCcnl: Record<string, StockCcnl>
  orderEvents: OrderCcnl[]
  newsItems: NewsItem[]
  marketTimeInfo: MarketTimeInfo | null
  setConnected: (v: boolean) => void
  handleMessage: (msg: WsMessage) => void
}

export const useWsStore = create<WsState>((set) => ({
  connected: false,
  latestCcnl: {},
  orderEvents: [],
  newsItems: [],
  marketTimeInfo: null,

  setConnected: (v) => set({ connected: v }),

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
      set({ marketTimeInfo: data as MarketTimeInfo })
    }
  },
}))
