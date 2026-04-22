/**
 * 계좌현황 페이지 공통 유틸리티
 */
import type { AgGridReact } from 'ag-grid-react'
import type { RefObject } from 'react'

export const toNum = (v: unknown): number => {
  if (v === undefined || v === null || v === '') return 0
  return Number(String(v).replace(/,/g, ''))
}

export const fmt = (v: number) => v.toLocaleString('ko-KR')

export const colorStyle = (v: number): React.CSSProperties =>
  v > 0 ? { color: '#ef4444', fontWeight: 600 } : v < 0 ? { color: '#3b82f6', fontWeight: 600 } : {}

/** 손익금액 셀 */
export function ProfitCell({ value }: { value: number }) {
  const n = toNum(value)
  return <span style={colorStyle(n)}>{fmt(n)}</span>
}

/** 손익율 셀 (% 기호 없음, 헤더에 표시) */
export function RateCell({ value }: { value: number }) {
  const n = toNum(value)
  return <span style={colorStyle(n)}>{n.toFixed(2)}</span>
}

/** 비중 셀 (+ 부호 없음, 음수 없음) */
export function WeightCell({ value }: { value: number }) {
  const n = toNum(value)
  return <span>{n.toFixed(1) + '%'}</span>
}

/** 종목코드 클릭 → 네이버 금융 오픈 */
export function CodeCell({ value }: { value: string }) {
  return (
    <button
      className="font-mono text-blue-600 hover:underline cursor-pointer w-full text-center"
      style={{ fontSize: '13px' }}
      onClick={() => window.open(`https://finance.naver.com/item/main.naver?code=${value}`, '_blank')}
    >
      {value}
    </button>
  )
}

/** 매수/매도/상세 버튼 (동작 미구현) */
export function ActionCell() {
  return (
    <div className="flex gap-1 items-center h-full">
      <button className="px-2 py-0.5 text-xs font-medium bg-red-50 text-red-600 border border-red-200 rounded hover:bg-red-100 transition-colors">
        매수
      </button>
      <button className="px-2 py-0.5 text-xs font-medium bg-blue-50 text-blue-600 border border-blue-200 rounded hover:bg-blue-100 transition-colors">
        매도
      </button>
      <button className="px-2 py-0.5 text-xs font-medium bg-gray-50 text-gray-500 border border-gray-200 rounded hover:bg-gray-100 transition-colors">
        상세
      </button>
    </div>
  )
}

/** 숫자 comparator (정렬용) */
export const numComparator = (a: unknown, b: unknown) => toNum(a) - toNum(b)

/** CSV 내보내기 */
export function exportCsv(gridRef: RefObject<AgGridReact | null>, fileName: string) {
  gridRef.current?.api?.exportDataAsCsv({ fileName })
}

/** 헤더바 컴포넌트 */
export function AccountHeader({
  title, screenNo, count,
  예수금Label = '예수금', 예수금 = 0,
  평가금액Label = '평가금액', 평가금액 = 0,
  손익 = 0,
  onCsv, onRefresh,
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
}) {
  return (
    <div className="px-4 py-2 border-b border-gray-200 bg-gray-50 flex items-center gap-0 shrink-0 text-sm flex-wrap">
      {/* 타이틀 */}
      <span className="font-bold text-gray-700">{title}</span>
      <span className="text-gray-400 font-mono ml-1 mr-3">[{screenNo}]</span>

      {/* 종목 수 */}
      <span className="text-gray-500">총 <span className="font-semibold text-gray-800">{count}</span>종목</span>
      <Pipe />

      {/* 예수금 */}
      <span className="text-gray-500">{예수금Label} <span className="font-semibold text-gray-800">{fmt(예수금)}</span>원</span>
      <Pipe />

      {/* 평가금액 */}
      <span className="text-gray-500">{평가금액Label} <span className="font-semibold text-gray-800">{fmt(평가금액)}</span>원</span>
      <Pipe />

      {/* 손익 */}
      <span className="text-gray-500">
        손익 <span style={colorStyle(손익)} className="font-semibold">{fmt(손익)}</span>원
      </span>
      <Pipe />

      {/* 버튼들 */}
      <button
        onClick={onCsv}
        className="px-2.5 py-1 text-xs bg-green-50 hover:bg-green-100 text-green-700 rounded border border-green-200 transition-colors"
      >
        CSV저장
      </button>
      <span className="mx-1" />
      <button
        onClick={onRefresh}
        className="px-2.5 py-1 text-xs bg-blue-50 hover:bg-blue-100 text-blue-600 rounded border border-blue-200 transition-colors"
      >
        새로고침
      </button>
    </div>
  )
}

function Pipe() {
  return <span className="mx-2 text-gray-300">|</span>
}
