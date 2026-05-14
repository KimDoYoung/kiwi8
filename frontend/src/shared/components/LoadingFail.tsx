import { AlertCircle, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/shared/components/ui/button'

interface LoadingFailProps {
  message?: string
  onRetry?: () => void
  className?: string
}

export default function LoadingFail({ 
  message = '데이터를 불러오는데 실패했습니다.', 
  onRetry,
  className 
}: LoadingFailProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center h-full min-h-[200px] text-destructive gap-3", className)}>
      <AlertCircle className="w-8 h-8" />
      <span className="text-sm font-medium">{message}</span>
      {onRetry && (
        <Button 
          variant="outline" 
          size="sm" 
          onClick={onRetry}
          className="mt-2"
        >
          <RefreshCw className="w-4 h-4 mr-2" />
          다시 시도
        </Button>
      )}
    </div>
  )
}
