import { useState, useRef, type KeyboardEvent } from 'react'
import { LogOut, Save, PanelTopClose, FolderOpen } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '@/store/authStore'
import { useLayoutStore } from '@/store/layoutStore'
import { fetchMenuTree } from '@/services/menuService'
import api from '@/services/api'

export default function TopBar() {
  const { username, logout } = useAuthStore()
  const { openByScreenNo, closeAllTabs, saveScreens, restoreScreens } = useLayoutStore()

  const [screenInput, setScreenInput] = useState('')
  const [inputError, setInputError] = useState(false)   // 빨간 테두리
  const [savedMsg, setSavedMsg] = useState(false)        // "저장됨" 표시
  const inputRef = useRef<HTMLInputElement>(null)

  const { data: menus = [] } = useQuery({
    queryKey: ['menus'],
    queryFn: fetchMenuTree,
    staleTime: 1000 * 60 * 10,
  })

  const handleScreenEnter = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return
    const val = screenInput.trim()
    if (!val) return

    const ok = openByScreenNo(val, menus)
    if (ok) {
      setScreenInput('')
      setInputError(false)
    } else {
      // 없는 화면번호 — 짧은 에러 표시
      setInputError(true)
      setTimeout(() => setInputError(false), 1000)
    }
  }

  const handleSave = () => {
    saveScreens()
    setSavedMsg(true)
    setTimeout(() => setSavedMsg(false), 1500)
  }

  const handleLogout = async () => {
    try { await api.get('/logout') } finally { logout() }
  }

  return (
    <header className="h-12 bg-white border-b border-gray-200 flex items-center gap-3 px-4 shrink-0 z-10">
      {/* 로고 */}
      <span className="text-xl font-bold text-green-600 tracking-tight shrink-0">kiwi8</span>

      {/* 화면번호 입력창 */}
      <input
        ref={inputRef}
        type="text"
        value={screenInput}
        onChange={(e) => setScreenInput(e.target.value)}
        onKeyDown={handleScreenEnter}
        placeholder="화면번호"
        maxLength={6}
        className={`w-24 border rounded-lg px-2 py-1 text-sm font-mono text-center focus:outline-none transition-colors
          ${inputError
            ? 'border-red-400 bg-red-50 text-red-600 focus:ring-1 focus:ring-red-300'
            : 'border-gray-200 focus:ring-2 focus:ring-green-300'
          }`}
      />

      {/* 모두닫기 */}
      <button
        onClick={closeAllTabs}
        title="모두 닫기 (홈으로)"
        className="flex items-center gap-1 text-xs text-gray-500 hover:text-orange-500 transition-colors px-2 py-1 rounded-lg hover:bg-orange-50"
      >
        <PanelTopClose size={15} />
        <span className="hidden sm:inline">모두닫기</span>
      </button>

      {/* 화면열기 */}
      <button
        onClick={() => restoreScreens(menus)}
        title="저장된 화면 열기"
        className="flex items-center gap-1 text-xs text-gray-500 hover:text-green-600 transition-colors px-2 py-1 rounded-lg hover:bg-green-50"
      >
        <FolderOpen size={15} />
        <span className="hidden sm:inline">화면열기</span>
      </button>

      {/* 화면저장 */}
      <div className="relative">
        <button
          onClick={handleSave}
          title="현재 화면 저장"
          className="flex items-center gap-1 text-xs text-gray-500 hover:text-blue-500 transition-colors px-2 py-1 rounded-lg hover:bg-blue-50"
        >
          <Save size={15} />
          <span className="hidden sm:inline">화면저장</span>
        </button>
        {savedMsg && (
          <span className="absolute top-8 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-xs px-2 py-0.5 rounded whitespace-nowrap z-50">
            저장됨
          </span>
        )}
      </div>

      {/* 오른쪽 영역 */}
      <div className="ml-auto flex items-center gap-3">
        <span className="text-sm text-gray-600">{username}</span>
        <button
          onClick={handleLogout}
          title="로그아웃"
          className="flex items-center gap-1 text-xs text-gray-500 hover:text-red-500 transition-colors px-2 py-1 rounded-lg hover:bg-red-50"
        >
          <LogOut size={14} />
          <span className="hidden sm:inline">로그아웃</span>
        </button>
      </div>
    </header>
  )
}
