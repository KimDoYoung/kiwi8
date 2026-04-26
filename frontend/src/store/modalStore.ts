import { create } from 'zustand'

interface DiaryInitialData {
  id?: string
  ymd?: string
  stk_cd?: string
  stk_nm?: string
  note?: string
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
}))
