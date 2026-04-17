import { useEffect, useState } from 'react'

export default function StatusBar() {
  const [time, setTime] = useState(() => new Date().toLocaleTimeString('ko-KR'))

  useEffect(() => {
    const id = setInterval(() => {
      setTime(new Date().toLocaleTimeString('ko-KR'))
    }, 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <footer className="h-6 bg-gray-800 text-gray-300 flex items-center justify-between px-3 text-xs shrink-0">
      <div className="flex items-center gap-4">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-gray-500 inline-block" />
          시장 대기
        </span>
        <span className="text-gray-500">키움 ─</span>
        <span className="text-gray-500">KIS ─</span>
        <span className="text-gray-500">LS ─</span>
      </div>
      <div className="font-mono">{time}</div>
    </footer>
  )
}
