/**
 * 계좌현황 페이지 공통 유틸리티 (순수 함수)
 */
import type { AgGridReact } from 'ag-grid-react'
import React, { type RefObject } from 'react'

export const toNum = (v: unknown): number => {
  if (v === undefined || v === null || v === '') return 0
  return Number(String(v).replace(/,/g, ''))
}

export const fmt = (v: number) => v.toLocaleString('ko-KR')

export const colorStyle = (v: number): React.CSSProperties =>
  v > 0 ? { color: '#ef4444', fontWeight: 600 } : v < 0 ? { color: '#3b82f6', fontWeight: 600 } : {}

/** 숫자 comparator (정렬용) */
export const numComparator = (a: unknown, b: unknown) => toNum(a) - toNum(b)

/** CSV 내보내기 */
export function exportCsv(gridRef: RefObject<AgGridReact | null>, fileName: string) {
  gridRef.current?.api?.exportDataAsCsv({ fileName })
}
