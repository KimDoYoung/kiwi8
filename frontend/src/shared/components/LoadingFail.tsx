import { AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface LoadingFailProps {
  message?: string
  className?: string
}

export default function LoadingFail({ message = '데이터를 불러오는데 실패했습니다.', className }: LoadingFailProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center h-full min-h-[200px] text-destructive gap-3", className)}>
      <AlertCircle className="w-8 h-8" />
      <span className="text-sm font-medium">{message}</span>
    </div>
  )
}
