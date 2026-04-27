import { create } from 'zustand'

interface DiaryInitialData {
  id?: string
  ymd?: string
  stk_cd?: string
  stk_nm?: string
  note?: string
}

interface OrderInitialData {
  stk_cd: string
  stk_nm: string
  price?: number
  qty?: number
  broker?: 'kis' | 'kiwoom' | 'ls'
  order_type?: 'buy' | 'sell'
}

interface ModalState {
  // 종목 찾기 모달
  isStockFindModalOpen: boolean
  openStockFindModal: () => void
  closeStockFindModal: () => void

  // 매매일지 작성 모달
  isDiaryEditModalOpen: boolean
  diaryInitialData: DiaryInitialData | null
  openDiaryEditModal: (data?: DiaryInitialData) => void
  closeDiaryEditModal: () => void

  // 주문 모달
  isOrderModalOpen: boolean
  orderInitialData: OrderInitialData | null
  openOrderModal: (data: OrderInitialData) => void
  closeOrderModal: () => void
}

export const useModalStore = create<ModalState>((set) => ({
  // 종목 찾기 모달
  isStockFindModalOpen: false,
  openStockFindModal: () => set({ isStockFindModalOpen: true }),
  closeStockFindModal: () => set({ isStockFindModalOpen: false }),

  // 매매일지 작성 모달
  isDiaryEditModalOpen: false,
  diaryInitialData: null,
  openDiaryEditModal: (data) => set({ 
    isDiaryEditModalOpen: true, 
    diaryInitialData: data || null 
  }),
  closeDiaryEditModal: () => set({ 
    isDiaryEditModalOpen: false, 
    diaryInitialData: null 
  }),

  // 주문 모달
  isOrderModalOpen: false,
  orderInitialData: null,
  openOrderModal: (data) => set({
    isOrderModalOpen: true,
    orderInitialData: data
  }),
  closeOrderModal: () => set({
    isOrderModalOpen: false,
    orderInitialData: null
  })
}))
