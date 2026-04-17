import { useState, useRef, type KeyboardEvent } from 'react'
import { LogOut, BookX, BookCheck, Settings } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '@/store/authStore'
import { useLayoutStore } from '@/store/layoutStore'
import { fetchMenuTree } from '@/services/menuService'
import api from '@/services/api'
import TopBarControlPanel from './topbar/TopBarControlPanel'

export default function TopBar() {
  const { username, logout } = useAuthStore()
  const { openByScreenNo, closeAllTabs, saveScreens, restoreScreens, isClosed } = useLayoutStore()

  const [screenInput, setScreenInput] = useState('')
  const [inputError, setInputError] = useState(false)
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
      setInputError(true)
      setTimeout(() => setInputError(false), 1000)
    }
  }

  const handleToggle = () => {
    if (isClosed) {
      restoreScreens(menus)
    } else {
      saveScreens()
      closeAllTabs()
    }
  }

  const handleLogout = async () => {
    try { await api.get('/logout') } finally { logout() }
  }

  return (
    <header className="h-12 bg-white border-b border-gray-200 flex items-center px-3 shrink-0 z-10 gap-2">

      {/* 1) Logo Area */}
      <span className="text-xl font-bold text-green-600 tracking-tight shrink-0 mr-2">kiwi8</span>

      {/* 구분선 */}
      <span className="h-5 w-px bg-gray-200 shrink-0" />

      {/* 2) Screen Control Area */}
      <div className="flex items-center gap-1.5 shrink-0">
        <input
          ref={inputRef}
          type="text"
          value={screenInput}
          onChange={(e) => setScreenInput(e.target.value)}
          onKeyDown={handleScreenEnter}
          placeholder="화면번호"
          maxLength={6}
          className={`w-22 border rounded-lg px-2 py-1 text-sm font-mono text-center focus:outline-none transition-colors
            ${inputError
              ? 'border-red-400 bg-red-50 text-red-600 focus:ring-1 focus:ring-red-300'
              : 'border-gray-200 focus:ring-2 focus:ring-green-300'
            }`}
        />
        <button
          onClick={handleToggle}
          title={isClosed ? '저장된 화면 열기' : '모두 닫기'}
          className={`p-1.5 rounded-lg transition-colors
            ${isClosed
              ? 'text-green-600 hover:text-green-800 hover:bg-green-50'
              : 'text-gray-400 hover:text-orange-500 hover:bg-orange-50'
            }`}
        >
          {isClosed ? <BookCheck size={16} /> : <BookX size={16} />}
        </button>
      </div>

      {/* 구분선 */}
      <span className="h-5 w-px bg-gray-200 shrink-0" />

      {/* 3) Control Area */}
      <TopBarControlPanel />

      {/* 구분선 */}
      <span className="h-5 w-px bg-gray-200 shrink-0" />

      {/* 4) User Area */}
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-sm text-gray-600">{username}</span>
        <button
          title="설정"
          className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
        >
          <Settings size={15} />
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
  )
}
