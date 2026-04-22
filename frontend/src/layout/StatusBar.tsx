import { useEffect, useState } from 'react'
import { useStatusStore, type StatusType } from '@/store/statusStore'

function getStatusStyles(type: StatusType) {
  switch (type) {
    case 'error': return { icon: '❌', text: 'text-red-700', bg: 'bg-red-50' }
    case 'warning': return { icon: '⚠️', text: 'text-orange-700', bg: 'bg-orange-50' }
    case 'success': return { icon: '✅', text: 'text-green-700', bg: 'bg-green-50' }
    default: return { icon: '📢', text: 'text-rose-900', bg: 'bg-white/40' }
  }
}

export default function StatusBar() {
  const [time, setTime] = useState(() => new Date().toLocaleTimeString('ko-KR'))
  const { message, type } = useStatusStore()
  const styles = getStatusStyles(type)

  useEffect(() => {
    const id = setInterval(() => {
      setTime(new Date().toLocaleTimeString('ko-KR'))
    }, 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <footer className="h-12 bg-rose-100 text-rose-900 flex items-center px-4 text-sm shrink-0 border-t border-rose-200 select-none shadow-[0_-1px_3px_rgba(0,0,0,0.05)]">
      {/* 1. 좌측: 상태 표시기 */}
      <div className="flex-1 flex items-center gap-4 overflow-hidden">
        <div className="flex items-center gap-2 bg-white/60 px-3 py-1.5 rounded-full shrink-0 shadow-sm border border-rose-200/50">
          <span className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.6)]" />
          <span className="font-bold text-rose-950 text-xs">시스템 정상</span>
        </div>
        <div className="flex items-center gap-4 text-rose-700 font-semibold text-xs truncate border-l border-rose-300/50 pl-4 ml-1">
          <span className="flex items-center gap-1.5">KIS <span className="text-green-600 font-black">ON</span></span>
          <span className="flex items-center gap-1.5">LS <span className="text-green-600 font-black">ON</span></span>
          <span className="flex items-center gap-1.5">키움 <span className="text-green-600 font-black">ON</span></span>
        </div>
      </div>

      {/* 2. 중앙: 시스템 메시지 영역 */}
      <div className="flex-[2] text-center px-6">
        <div className={`inline-flex items-center px-5 py-2 rounded-xl border border-rose-200/40 backdrop-blur-sm transition-colors duration-300 ${styles.bg}`}>
          <span className={`font-bold tracking-tight ${styles.text}`}>
            {styles.icon} <span className="ml-1">{message}</span>
          </span>
        </div>
      </div>

      {/* 3. 우측: 시간 및 기타 정보 */}
      <div className="flex-1 text-right font-mono flex items-center justify-end gap-5">
        <div className="flex flex-col items-end leading-tight border-r border-rose-300/50 pr-5">
          <span className="text-[9px] text-rose-500 font-black uppercase tracking-widest">Build Version</span>
          <span className="text-rose-900 font-bold text-xs">v1.0.0-stable</span>
        </div>
        <div className="flex flex-col items-end leading-tight min-w-[120px]">
          <span className="text-[9px] text-rose-500 font-black uppercase tracking-widest text-right w-full mb-0.5">Server Time</span>
          <span className="text-xl text-rose-950 font-black tabular-nums tracking-tighter">{time}</span>
        </div>
      </div>
    </footer>
  )
}
