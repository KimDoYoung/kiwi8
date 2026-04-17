import { create } from 'zustand'
import { Actions, DockLocation, Model } from 'flexlayout-react'
import type { MenuItem } from '@/services/menuService'

const STORAGE_KEY = 'kiwi8-layout'         // FlexLayout 자동저장 (매 변경마다)
const SAVED_LAYOUT_KEY = 'kiwi8-saved-layout' // 사용자가 명시적으로 저장한 전체 레이아웃

const HOME_TAB = { type: 'tab', id: 'HOME', name: '홈', component: 'HOME' }

const DEFAULT_LAYOUT = {
  global: {
    tabSetMinWidth: 100,
    tabSetMinHeight: 50,
    tabSetEnableMaximize: true,
    tabSetTabStripHeight: 32,
    tabSetHeaderHeight: 0,
    splitterSize: 4,
  },
  borders: [],
  layout: {
    type: 'row',
    weight: 100,
    id: 'root',
    children: [
      {
        type: 'tabset',
        id: 'main-tabset',
        weight: 100,
        children: [HOME_TAB],
      },
    ],
  },
}

function createModel(): Model {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) return Model.fromJson(JSON.parse(saved))
  } catch {
    // 손상된 경우 기본값 사용
  }
  return Model.fromJson(DEFAULT_LAYOUT)
}

// Model은 mutable 객체 — 모듈 레벨 싱글톤
let _model: Model = createModel()

// 메뉴 트리에서 screen_no로 MenuItem 탐색 (재귀)
function findMenuByScreenNo(screenNo: string, menus: MenuItem[]): MenuItem | null {
  for (const m of menus) {
    if (m.screen_no === screenNo) return m
    const found = findMenuByScreenNo(screenNo, m.children)
    if (found) return found
  }
  return null
}

// 활성 tabset id 반환
function getActiveTabsetId(): string {
  let tabsetId = 'main-tabset'
  _model.visitNodes((node) => {
    if (node.getType() === 'tabset') tabsetId = node.getId()
  })
  return tabsetId
}

interface LayoutState {
  modelVersion: number
  getModel: () => Model
  openTab: (menu: MenuItem) => void
  openByScreenNo: (screenNo: string, menus: MenuItem[]) => boolean
  closeAllTabs: () => void
  saveScreens: () => void
  restoreScreens: (menus: MenuItem[]) => void
  onModelChange: (model: Model) => void
}

export const useLayoutStore = create<LayoutState>((set, get) => ({
  modelVersion: 0,

  getModel: () => _model,

  openTab: (menu: MenuItem) => {
    if (!menu.screen_no) return
    const existing = _model.getNodeById(menu.screen_no)
    if (existing) {
      _model.doAction(Actions.selectTab(existing.getId()))
    } else {
      _model.doAction(
        Actions.addNode(
          { type: 'tab', id: menu.screen_no, name: menu.title, component: menu.screen_no },
          getActiveTabsetId(),
          DockLocation.CENTER,
          -1
        )
      )
    }
    set((s) => ({ modelVersion: s.modelVersion + 1 }))
  },

  // 화면번호로 탭 열기. 성공 여부 반환 (TopBar 입력창 에러 표시용)
  openByScreenNo: (screenNo: string, menus: MenuItem[]) => {
    // HOME 특수 처리
    if (screenNo === 'HOME') {
      const existing = _model.getNodeById('HOME')
      if (existing) {
        _model.doAction(Actions.selectTab(existing.getId()))
      } else {
        _model.doAction(
          Actions.addNode(
            HOME_TAB,
            getActiveTabsetId(),
            DockLocation.CENTER,
            -1
          )
        )
      }
      set((s) => ({ modelVersion: s.modelVersion + 1 }))
      return true
    }
    const menu = findMenuByScreenNo(screenNo, menus)
    if (!menu) return false
    get().openTab(menu)
    return true
  },

  // 모든 탭 닫고 HOME 탭만 열기
  closeAllTabs: () => {
    _model = Model.fromJson(DEFAULT_LAYOUT)
    localStorage.removeItem(STORAGE_KEY)
    set((s) => ({ modelVersion: s.modelVersion + 1 }))
  },

  // 현재 FlexLayout 전체 모델(탭 목록 + 패널 배치)을 명시적으로 저장
  saveScreens: () => {
    try {
      localStorage.setItem(SAVED_LAYOUT_KEY, JSON.stringify(_model.toJson()))
    } catch {
      // 무시
    }
  },

  // 저장된 전체 레이아웃 복원 (화면열기 버튼 / 로그인 시)
  restoreScreens: (_menus: MenuItem[]) => {
    try {
      const raw = localStorage.getItem(SAVED_LAYOUT_KEY)
      if (!raw) return
      _model = Model.fromJson(JSON.parse(raw))
      // auto-save 키도 동기화
      localStorage.setItem(STORAGE_KEY, raw)
      set((s) => ({ modelVersion: s.modelVersion + 1 }))
    } catch {
      // 저장된 레이아웃이 손상된 경우 무시
    }
  },

  onModelChange: (model: Model) => {
    _model = model
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(model.toJson()))
    } catch {
      // localStorage 용량 초과 시 무시
    }
  },
}))
