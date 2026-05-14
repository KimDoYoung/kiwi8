import api from '@/lib/api'

export interface MyStock {
  stk_cd: string
  stk_nm: string
  sector?: string
  is_hold: number
  is_watch: number
  base_price?: number
  sell_rate?: number
  sell_price?: number
  buy_rate?: number
  buy_price?: number
  spec?: string
  spec_data?: Record<string, unknown>
  note?: string
  created_at: string
  updated_at: string
}

export interface MyStockCreate {
  stk_cd: string
  stk_nm: string
  sector?: string
  is_hold?: number
  is_watch?: number
  base_price?: number
  sell_rate?: number
  sell_price?: number
  buy_rate?: number
  buy_price?: number
  note?: string
}

export interface MyStockUpdate {
  stk_nm?: string
  sector?: string
  is_hold?: number
  is_watch?: number
  base_price?: number
  sell_rate?: number
  sell_price?: number
  buy_rate?: number
  buy_price?: number
  note?: string
}

export const getMyStocks = async (filter?: Record<string, unknown>): Promise<MyStock[]> => {
  const response = await api.get('/api/v1/mystock/', { params: filter })
  return response.data.data.list
}

export const getMyStock = async (stk_cd: string): Promise<MyStock> => {
  const response = await api.get(`/api/v1/mystock/${stk_cd}`)
  return response.data.data
}

export const createMyStock = async (data: MyStockCreate): Promise<MyStock> => {
  const response = await api.post('/api/v1/mystock/', data)
  return response.data.data
}

export const updateMyStock = async (stk_cd: string, data: MyStockUpdate): Promise<MyStock> => {
  const response = await api.put(`/api/v1/mystock/${stk_cd}`, data)
  return response.data.data
}

export const deleteMyStock = async (stk_cd: string): Promise<boolean> => {
  const response = await api.delete(`/api/v1/mystock/${stk_cd}`)
  return response.data.success
}

export const fillSpec = async (stk_cd: string): Promise<boolean> => {
  const response = await api.post(`/api/v1/mystock/${stk_cd}/fill-spec`)
  return response.data.success
}

export const syncHoldings = async (): Promise<number> => {
  const response = await api.post('/api/v1/mystock/sync-holdings')
  return response.data.data.count
}

export const fillAllSpec = async (): Promise<number> => {
  const response = await api.post('/api/v1/mystock/fill-all-spec')
  return response.data.data.count
}

export const getCurrentPrices = async (): Promise<Record<string, number>> => {
  const response = await api.get('/api/v1/mystock/current-prices')
  return response.data.data.prices
}
