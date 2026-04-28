import { create } from 'zustand'

interface StockDetailState {
  stk_cd: string | null
  stk_nm: string | null
  setStock: (stk_cd: string, stk_nm?: string) => void
}

export const useStockDetailStore = create<StockDetailState>((set) => ({
  stk_cd: null,
  stk_nm: null,
  setStock: (stk_cd, stk_nm) => set({ stk_cd, stk_nm: stk_nm || null }),
}))
