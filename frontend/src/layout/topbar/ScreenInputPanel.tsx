import { useState, useRef, type KeyboardEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useLayoutStore } from '@/store/layoutStore'
import { fetchMenuTree } from '@/services/menuService'
import LayoutPresetPanel from './LayoutPresetPanel'

export default function ScreenInputPanel() {
  const openByScreenNo = useLayoutStore((s) => s.openByScreenNo)
  const [value, setValue] = useState('')
  const [error, setError] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const { data: menus = [] } = useQuery({
    queryKey: ['menus'],
    queryFn: fetchMenuTree,
    staleTime: 1000 * 60 * 10,
  })

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === '+' || e.key === 'Delete') {
      setValue('')
      setError(false)
      return
    }
    if (e.key !== 'Enter') return
    const val = value.trim()
    if (!val) return
    const ok = openByScreenNo(val, menus)
    if (ok) {
      setValue('')
      setError(false)
    } else {
      setError(true)
      setTimeout(() => setError(false), 1000)
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setValue(e.target.value.replace(/\D/g, '').slice(0, 4))
  }

  return (
    <div className="flex items-center gap-1.5 shrink-0">
      <input
        ref={inputRef}
        type="text"
        inputMode="numeric"
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder="화면번호"
        maxLength={4}
        className={`w-22 border rounded-lg px-2 py-1 text-sm font-mono text-center focus:outline-none transition-colors
          ${error
            ? 'border-red-400 bg-red-50 text-red-600 focus:ring-1 focus:ring-red-300'
            : 'border-gray-200 focus:ring-2 focus:ring-blue-400'
          }`}
      />
      <LayoutPresetPanel />
    </div>
  )
}
