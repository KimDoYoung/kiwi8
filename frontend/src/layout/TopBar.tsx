import { useState, useRef, type KeyboardEvent } from 'react'
import { LogOut, Settings } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '@/store/authStore'
import { useLayoutStore } from '@/store/layoutStore'
import { fetchMenuTree } from '@/services/menuService'
import api from '@/shared/lib/api'
import TopBarControlPanel from './topbar/TopBarControlPanel'
import LayoutPresetPanel from './topbar/LayoutPresetPanel'

export default function TopBar() {
  const { username, logout } = useAuthStore()
  const { openByScreenNo } = useLayoutStore()

  const [screenInput, setScreenInput] = useState('')
  const [inputError, setInputError] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

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

  const handleLogout = async () => {
    try { await api.get('/logout') } finally { logout() }
  }

  return (
    <header className="h-12 bg-blue-100 border-b border-green-200 flex items-center px-3 shrink-0 z-10 gap-2">

      {/* 1) Logo Area */}
      <div className="flex items-center gap-1.5 shrink-0 mr-2">
        <img src="/images/kiwi8-logo.svg" alt="KIWI8 Logo" className="w-6 h-6" />
        <span className="text-xl font-bold text-green-600 tracking-tight">kiwi8</span>
        {health?.version && (
          <span className="text-[10px] text-gray-400 font-mono">v{health.version}</span>
        )}
      </div>

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
        <LayoutPresetPanel />
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
