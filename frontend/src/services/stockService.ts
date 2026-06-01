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
  kospi_diff: number
  kospi_rate: number
  kosdaq: number
  kosdaq_diff: number
  kosdaq_rate: number
  kospi200: number
  kospi200_diff: number
  kospi200_rate: number
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

export interface JudalTheme {
  theme_name: string
  stock_name: string
  stock_code: string
  market_type: string
  current_price: number
  price_change: number
  yesterday_ratio: number
  three_day_sum: number
  expected_return: number
  pbr: number
  per: number
  eps: number
  market_cap: number
  volume_index_today: number
  volume_index_7d: number
  buffett_choice: number
  high_52w: number
  low_52w: number
  change_rate_low_52w: number
  change_rate_high_52w: number
  high_3y: number
  low_3y: number
  change_rate_low_3y: number
  change_rate_high_3y: number
  related_themes: string
  updated_at: string
}

export interface ThemeParams {
  theme_name?: string
  theme_name_like?: string
  stock_name?: string
  stock_code?: string
  current_price_min?: number
  current_price_max?: number
  market_cap_min?: number
  market_cap_max?: number
  yesterday_ratio_min?: number
  yesterday_ratio_max?: number
  three_day_sum_min?: number
  three_day_sum_max?: number
  per_min?: number
  per_max?: number
  pbr_min?: number
  pbr_max?: number
  deduplicate?: boolean
  limit?: number
}

export const fetchThemes = async (params: ThemeParams): Promise<JudalTheme[]> => {
  const response = await api.get('/api/v1/stock/theme', { params })
  return response.data.data
}

export const fetchThemeNames = async (): Promise<{ name: string }[]> => {
  const response = await api.get('/api/v1/stock/theme/names')
  return response.data.data
}

export const fetchThemeScrapInfo = async (): Promise<{ last_scrap_judal: string | null }> => {
  const response = await api.get('/api/v1/stock/theme/scrap-info')
  return response.data
}

export interface StkInfoItem {
  stk_cd: string
  stk_nm: string | null
  market_code: string | null
  market_name: string | null
  up_name: string | null
  up_size_name: string | null
  audit_info: string | null
  reg_day: string | null
  last_price: string | null
  state: string | null
  nxt_enable: string | null
  order_warning: string | null
  main_products: string | null
  representative_name: string | null
  homepage: string | null
  location: string | null
}

export const fetchStkInfoList = async (): Promise<StkInfoItem[]> => {
  const response = await api.get('/api/v1/stock/stk-info-list')
  return response.data.data.list
}

