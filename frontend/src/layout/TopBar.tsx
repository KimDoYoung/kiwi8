import { useRef, useState } from 'react'
import { LogOut, Search, PenLine, Home } from 'lucide-react'
import ChangePasswordModal from '@/shared/components/ChangePasswordModal'
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '@/store/authStore'
import { useLayoutStore } from '@/store/layoutStore'
import { useModalStore } from '@/store/modalStore'
import { fetchMenuTree } from '@/services/menuService'
import api from '@/lib/api'
import type { DiaryInitialData } from '@/store/modalStore'
import TopBarControlPanel from './topbar/TopBarControlPanel'
import ScreenInputPanel, { type ScreenInputPanelHandle } from './topbar/ScreenInputPanel'
import { useGlobalHotkeys } from '@/hooks/useGlobalHotkeys'

export default function TopBar() {
  const { username, logout } = useAuthStore()
  const { openByScreenNo } = useLayoutStore()
  const { openStockFindModal, openDiaryEditModal } = useModalStore()
  const screenRef = useRef<ScreenInputPanelHandle>(null)
  const [pwModalOpen, setPwModalOpen] = useState(false)

  useGlobalHotkeys({
    Escape: (e) => {
      const active = document.activeElement
      if (active?.closest('[role="dialog"]') || active?.closest('.ag-cell')) return
      e.preventDefault()
      screenRef.current?.focusInput()
    },
    F9: (e) => {
      e.preventDefault()
      screenRef.current?.openLayoutPanel()
    },
  })

  const { data: menus = [] } = useQuery({
    queryKey: ['menus'],
    queryFn: fetchMenuTree,
    staleTime: 1000 * 60 * 10,
  })

  const { data: health } = useQuery({
    queryKey: ['health'],
    queryFn: () => fetch('/kiwi8/health').then((r) => r.json()) as Promise<{ version: string }>,
    staleTime: Infinity,
  })

  const handleLogout = async () => {
    try { await api.get('/logout') } finally { logout() }
  }

  const handleOpenDiary = async () => {
    const todayYmd = new Date().toISOString().split('T')[0].replace(/-/g, '')
    try {
      const res = await api.post('/api/v1/diary/list', {
        api_id: 'diary_list',
        payload: { start_ymd: todayYmd, end_ymd: todayYmd, limit: 50 },
      })
      const list: { id: number; ymd: string; stk_cd: string | null; note: string }[] =
        res.data?.data?.list ?? []
      const todayGeneral = list.find((d) => !d.stk_cd)
      if (todayGeneral) {
        const data: DiaryInitialData = {
          id: String(todayGeneral.id),
          ymd: `${todayYmd.slice(0, 4)}-${todayYmd.slice(4, 6)}-${todayYmd.slice(6, 8)}`,
          note: todayGeneral.note,
        }
        openDiaryEditModal(data)
        return
      }
    } catch {
      // 조회 실패 시 새 작성으로 폴백
    }
    openDiaryEditModal()
  }

  return (
    <>
    <header className="h-12 bg-blue-100 border-b border-green-200 flex items-center px-3 shrink-0 z-10 gap-2">

      {/* 1) Logo Area */}
      <div className="flex items-center gap-1.5 shrink-0 mr-2">
        <img 
          src={`${import.meta.env.BASE_URL}images/kiwi8-logo.svg`} 
          alt="KIWI8 Logo" 
          className="w-6 h-6" 
        />
        <span className="text-xl font-bold text-green-600 tracking-tight">kiwi8</span>
        {health?.version && (
          <span className="text-[10px] text-gray-400 font-mono">v{health.version}</span>
        )}
      </div>

      {/* Home 버튼 */}
      <button
        onClick={() => openByScreenNo('HOME', menus)}
        title="홈으로"
        className="p-1.5 rounded-lg text-gray-400 hover:text-green-600 hover:bg-green-50 transition-colors shrink-0"
      >
        <Home size={15} />
      </button>

      {/* 구분선 */}
      <span className="h-5 w-px bg-gray-200 shrink-0" />

      {/* 2) Screen Control Area */}
      <ScreenInputPanel ref={screenRef} />

      {/* 구분선 */}
      <span className="h-5 w-px bg-gray-200 shrink-0" />

      {/* 3) Control Area */}
      <TopBarControlPanel />

      {/* 구분선 */}
      <span className="h-5 w-px bg-gray-200 shrink-0" />

      {/* 4) User Area */}
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={() => setPwModalOpen(true)}
          title="비밀번호 변경"
          className="text-sm text-gray-600 hover:text-primary hover:underline transition-colors cursor-pointer"
        >
          {username}
        </button>
        
        <button
          onClick={() => openStockFindModal()}
          title="종목 찾기"
          className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
        >
          <Search size={15} />
        </button>

        <button
          onClick={handleOpenDiary}
          title="일지 작성"
          className="p-1.5 rounded-lg text-gray-400 hover:text-green-600 hover:bg-green-50 transition-colors"
        >
          <PenLine size={15} />
        </button>

        <button
          onClick={handleLogout}
          title="로그아웃"
          className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
        >
          <LogOut size={15} />
        </button>
      </div>

    </header>

    {pwModalOpen && (
      <ChangePasswordModal username={username ?? ''} onClose={() => setPwModalOpen(false)} />
    )}
    </>
  )
}
