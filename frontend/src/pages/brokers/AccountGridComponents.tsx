/**
 * 계좌현황 페이지 공통 유틸리티
 */
import React from 'react'
import { toNum, fmt, colorStyle } from '@/lib/utils'
import RefreshButton from '@/shared/components/RefreshButton'

/** 손익금액 셀 */
export const ProfitCell = React.memo(function ProfitCell({ value }: { value: number }) {
  const n = toNum(value)
  return <span style={colorStyle(n)}>{fmt(n)}</span>
})

/** 전일대비 셀 — 금액 (비율) 한 줄 우정렬, 양수=빨강/음수=파랑, + 기호 생략, % 없음 */
export const PrevDayCell = React.memo(function PrevDayCell({ value, rate }: { value: number; rate: number }) {
  const color = value > 0 ? '#ef4444' : value < 0 ? '#3b82f6' : undefined
  const fmtAmt = value < 0 ? `-${fmt(Math.abs(value))}` : fmt(value)
  const fmtRate = value < 0 ? `-${Math.abs(rate).toFixed(2)}` : `${rate.toFixed(2)}`
  return (
    <span style={{ color, fontWeight: 600, display: 'flex', justifyContent: 'flex-end', alignItems: 'baseline', gap: '3px' }}>
      <span>{fmtAmt}</span>
      <span style={{ fontSize: '10px', opacity: 0.85 }}>({fmtRate})</span>
    </span>
  )
})

/** 손익율 셀 (% 기호 없음, 헤더에 표시) */
export const RateCell = React.memo(function RateCell({ value }: { value: number }) {
  const n = toNum(value)
  return <span style={colorStyle(n)}>{n.toFixed(2)}</span>
})

/** 비중 셀 (+ 부호 없음, 음수 없음) */
export const WeightCell = React.memo(function WeightCell({ value }: { value: number }) {
  const n = toNum(value)
  return <span>{n.toFixed(1) + '%'}</span>
})

/** 종목코드 클릭 → 네이버 금융 오픈 */
export const CodeCell = React.memo(function CodeCell({ value }: { value: string }) {
  return (
    <button
      className="font-mono text-blue-600 hover:underline cursor-pointer w-full text-center"
      style={{ fontSize: '13px' }}
      onClick={() => window.open(`https://finance.naver.com/item/main.naver?code=${value}`, '_blank')}
    >
      {value}
    </button>
  )
})

/** 매수/매도/상세 버튼 */
export const ActionCell = React.memo(function ActionCell({
  onBuy,
  onSell
}: {
  onBuy?: () => void,
  onSell?: () => void
}) {
  return (
    <div className="flex gap-1 items-center h-full">
      <button
        onClick={(e) => { e.stopPropagation(); onBuy?.(); }}
        className="px-2 py-0.5 text-xs font-medium bg-red-50 text-red-600 border border-red-200 rounded hover:bg-red-100 transition-colors"
      >
        매수
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); onSell?.(); }}
        className="px-2 py-0.5 text-xs font-medium bg-blue-50 text-blue-600 border border-blue-200 rounded hover:bg-blue-100 transition-colors"
      >
        매도
      </button>
    </div>
  )
})

/** 헤더바 컴포넌트 */
export function AccountHeader({
  title,
  screenNo,
  count,
  예수금Label = '예수금',
  예수금 = 0,
  평가금액Label = '평가금액',
  평가금액 = 0,
  손익 = 0,
  onCsv,
  onRefresh,
  isLoading = false,
  intervalSeconds = 300,
  enabled,
  children,
}: {
  title: string
  screenNo: string
  count: number
  예수금Label?: string
  예수금?: number
  평가금액Label?: string
  평가금액?: number
  손익?: number
  onCsv: () => void
  onRefresh: () => void
  isLoading?: boolean
  intervalSeconds?: number
  enabled?: boolean
  children?: React.ReactNode
}) {
  return (
    <div className="px-4 py-2 border-b border-gray-200 bg-gray-50 flex items-center gap-0 shrink-0 text-sm flex-wrap">
      {/* 타이틀 */}
      <span className="font-bold text-gray-700">{title}</span>
      <span className="text-gray-400 font-mono ml-1 mr-3">[{screenNo}]</span>

      {/* 종목 수 */}
      <span className="text-gray-500">
        총 <span className="font-semibold text-gray-800">{count}</span>종목
      </span>
      <Pipe />

      {/* 예수금 */}
      <span className="text-gray-500">
        {예수금Label} <span className="font-semibold text-gray-800">{fmt(예수금)}</span>원
      </span>
      <Pipe />

      {/* 평가금액 */}
      <span className="text-gray-500">
        {평가금액Label} <span className="font-semibold text-gray-800">{fmt(평가금액)}</span>원
      </span>
      <Pipe />

      {/* 손익 */}
      <span className="text-gray-500">
        손익 <span style={colorStyle(손익)} className="font-semibold">{fmt(손익)}</span>원
      </span>
      <Pipe />

      {/* 커스텀 영역 (필터 라디오 버튼 등) */}
      {children}
      {children && <span className="mx-1" />}

      {/* 버튼들 */}
      <button
        onClick={onCsv}
        className="px-2.5 py-1 text-xs bg-green-50 hover:bg-green-100 text-green-700 rounded border border-green-200 transition-colors"
      >
        CSV저장
      </button>
      <span className="mx-1" />
      <RefreshButton
        onRefresh={onRefresh}
        intervalSeconds={intervalSeconds}
        isLoading={isLoading}
        enabled={enabled}
      />
    </div>
  )
}

function Pipe() {
  return <span className="mx-2 text-gray-300">|</span>
}

