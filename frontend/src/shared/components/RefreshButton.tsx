import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'

interface RefreshButtonProps {
  onRefresh: () => void
  intervalSeconds?: number
  isLoading?: boolean
  enabled?: boolean
  className?: string
}

export default function RefreshButton({
  onRefresh,
  intervalSeconds = 300,
  isLoading = false,
  enabled,
  className,
}: RefreshButtonProps) {
  const [remaining, setRemaining] = useState(intervalSeconds)

  useEffect(() => {
    if (isLoading || enabled === false) return
    if (remaining <= 0) {
      onRefresh()
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRemaining(intervalSeconds)
      return
    }
    const t = setTimeout(() => setRemaining((r) => r - 1), 1000)
    return () => clearTimeout(t)
  }, [remaining, isLoading, enabled, intervalSeconds, onRefresh])

  const handleClick = () => {
    setRemaining(intervalSeconds)
    onRefresh()
  }

  const label = isLoading
    ? '로딩중...'
    : enabled === false
      ? '새로고침(장마감)'
      : remaining >= 60
        ? `새로고침(${Math.ceil(remaining / 60)}분후)`
        : `새로고침(${remaining}s)`

  return (
    <button
      onClick={handleClick}
      disabled={isLoading}
      className={cn(
        'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white border rounded-md transition-colors disabled:opacity-50',
        enabled === false
          ? 'border-slate-200 text-slate-400 hover:bg-slate-50'
          : 'border-slate-200 text-slate-600 hover:bg-slate-50',
        className,
      )}
    >
      <RefreshCw className={cn('w-3.5 h-3.5', isLoading && 'animate-spin')} />
      {label}
    </button>
  )
}
