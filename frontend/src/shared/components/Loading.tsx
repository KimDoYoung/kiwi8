import { RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'

interface LoadingProps {
  message?: string
  className?: string
}

export default function Loading({ message = '불러오는 중...', className }: LoadingProps) {
  return (
    <div className={cn("flex items-center justify-center h-full min-h-[200px]", className)}>
      <RefreshCw className="w-8 h-8 animate-spin text-primary" />
      <span className="ml-2 text-slate-600">{message}</span>
    </div>
  )
}
