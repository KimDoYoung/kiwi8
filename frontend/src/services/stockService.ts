import api from '@/shared/lib/api'

export interface OrderRequest {
  broker: 'kiwoom' | 'kis' | 'ls'
  api_id: string
  payload: any
}

export const sendOrder = async (order: OrderRequest) => {
  const url = `/api/v1/stkcompany/${order.broker}/${order.api_id}`
  const response = await api.post(url, {
    api_id: order.api_id,
    payload: order.payload
  })
  return response.data
}

export const getMarketStatus = async () => {
  const response = await api.get('/api/v1/stock/market/status')
  return response.data
}
