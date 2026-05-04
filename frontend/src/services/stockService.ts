import api from '@/lib/api'

export interface OrderRequest {
  broker: 'kiwoom' | 'kis' | 'ls'
  api_id: string
  payload: Record<string, unknown>
}

export interface OrderResponse {
  success: boolean
  error_message?: string
  data?: unknown
}

export interface MarketStatus {
  is_open: boolean
  is_krx_time: boolean
  is_nxt_time: boolean
  trade_market: 'KRX' | 'NXT' | null
}

export const sendOrder = async (order: OrderRequest): Promise<OrderResponse> => {
  const url = `/api/v1/stkcompany/${order.broker}/${order.api_id}`
  const response = await api.post(url, {
    api_id: order.api_id,
    payload: order.payload
  })
  return response.data
}

export const getMarketStatus = async (): Promise<MarketStatus> => {
  const response = await api.get('/api/v1/market/status')
  return response.data
}

export interface MarketJisu {
  kospi: number
  kosdaq: number
  kospi200: number
  updated_at: string
}

export const getMarketJisu = async (): Promise<MarketJisu> => {
  const response = await api.get('/api/v1/market/jisu')
  return response.data
}

export interface StockSearchItem {
  stk_cd: string
  stk_nm: string
  market_name: string
  up_name: string
}

export const findStock = async (keyword: string): Promise<StockSearchItem[]> => {
  const response = await api.post('/api/v1/stock/find', {
    api_id: 'stock_find',
    payload: { keyword, limit: 10 }
  })
  return response.data.data.results
}
