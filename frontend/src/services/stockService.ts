import api from '@/shared/lib/api'

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
  const response = await api.get('/api/v1/stock/market/status')
  return response.data
}
