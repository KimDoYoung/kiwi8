import { cn } from '@/shared/lib/utils'

interface TrendBadgeProps {
    trend?: string | null
}

const styleByTrend: Record<string, string> = {
    '5일연속 오름': 'bg-red-200 text-red-900 border-red-300',
    '3연속 오름': 'bg-red-100 text-red-800 border-red-200',
    '5일연속 하락': 'bg-blue-200 text-blue-900 border-blue-300',
    '3연속 하락': 'bg-blue-100 text-blue-800 border-blue-200',
    '등락 중': 'bg-green-100 text-green-900 border-green-200',
    '데이터 부족': 'bg-gray-100 text-gray-700 border-gray-200',
}

export function TrendBadge({ trend }: TrendBadgeProps) {
    const label = trend && trend.trim().length > 0 && trend !== '-' ? trend : '데이터 부족'
    const styleClass = styleByTrend[label] ?? styleByTrend['데이터 부족']

    return (
        <span
            className={cn(
                'inline-flex w-[92px] items-center justify-center rounded-md border px-2 py-1 text-xs font-semibold leading-none',
                styleClass,
            )}
        >
            {label}
        </span>
    )
}
