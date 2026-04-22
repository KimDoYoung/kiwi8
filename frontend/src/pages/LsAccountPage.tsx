import { useMemo, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AgGridReact } from 'ag-grid-react'
import type { ColDef } from 'ag-grid-community'
import { AllCommunityModule, ModuleRegistry } from 'ag-grid-community'
import api from '@/lib/api'
import {
  toNum, fmt,
  ProfitCell, RateCell, WeightCell, CodeCell, ActionCell,
  numComparator, exportCsv, AccountHeader,
} from './accountUtils'

ModuleRegistry.registerModules([AllCommunityModule])

async function fetchLsAccount() {
  const res = await api.get('/api/v1/stkcompany/ls/account/list')
  return res.data
}

export default function LsAccountPage() {
  const gridRef = useRef<AgGridReact>(null)
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['stkcompany', 'ls', 'account'],
    queryFn: fetchLsAccount,
    staleTime: 1000 * 30,
  })

  const stocks: Record<string, unknown>[] = data?.data?.t0424OutBlock1 ?? []
  const summary = data?.data?.t0424OutBlock ?? {}

  const totalMaeip = useMemo(() =>
    stocks.reduce((sum, s) => sum + toNum(s['매입금액']), 0), [stocks])

  const 예수금 = toNum(summary['추정D2예수금'])
  const 잔고평가 = toNum(summary['평가금액'])
  const 손익 = toNum(summary['평가손익'])

  const colDefs = useMemo<ColDef[]>(() => [
    {
      headerName: '종목코드', width: 100, pinned: 'left',
      valueGetter: (p) => {
        const code = String(p.data?.종목번호 ?? '')
        return code.startsWith('A') ? code.slice(1) : code
      },
      cellRenderer: CodeCell,
      comparator: (a: string, b: string) => a.localeCompare(b),
    },
    { field: '종목명', headerName: '종목명', width: 150, pinned: 'left' },
    {
      field: '전일대비', headerName: '전일대비', width: 100, type: 'numericColumn',
      cellRenderer: ProfitCell, comparator: numComparator,
    },
    {
      field: '평균단가', headerName: '매입평단', width: 110, type: 'numericColumn',
      valueFormatter: ({ value }) => fmt(toNum(value)), comparator: numComparator,
    },
    {
      field: '현재가', headerName: '현재가', width: 110, type: 'numericColumn',
      valueFormatter: ({ value }) => fmt(toNum(value)), comparator: numComparator,
    },
    {
      field: '잔고수량', headerName: '수량', width: 80, type: 'numericColumn',
      valueFormatter: ({ value }) => fmt(toNum(value)), comparator: numComparator,
    },
    {
      headerName: '비중(%)', width: 85, type: 'numericColumn',
      valueGetter: (p) => totalMaeip > 0 ? toNum(p.data?.매입금액) / totalMaeip * 100 : 0,
      cellRenderer: WeightCell, comparator: numComparator,
    },
    {
      field: '매입금액', headerName: '매입금액', width: 120, type: 'numericColumn',
      valueFormatter: ({ value }) => fmt(toNum(value)), comparator: numComparator,
    },
    {
      field: '평가금액', headerName: '평가금액', width: 120, type: 'numericColumn',
      valueFormatter: ({ value }) => fmt(toNum(value)), comparator: numComparator,
    },
    {
      field: '평가손익', headerName: '손익금액', width: 120, type: 'numericColumn',
      cellRenderer: ProfitCell, comparator: numComparator,
    },
    {
      field: '수익율', headerName: '손익율(%)', width: 95, type: 'numericColumn',
      cellRenderer: RateCell, comparator: numComparator,
    },
    { field: '가격추세', headerName: '추세', width: 100, sortable: false },
    {
      headerName: '', width: 145, sortable: false, resizable: false,
      cellRenderer: ActionCell,
    },
  ], [totalMaeip])

  const defaultColDef = useMemo<ColDef>(() => ({
    sortable: true, resizable: true,
  }), [])

  return (
    <div className="flex flex-col h-full text-base">
      {!isLoading && !error && (
        <AccountHeader
          title="LS 계좌현황" screenNo="4101" count={stocks.length}
          예수금Label="예수금" 예수금={예수금}
          평가금액Label="잔고평가" 평가금액={잔고평가}
          손익={손익}
          onCsv={() => exportCsv(gridRef, 'LS_계좌현황.csv')}
          onRefresh={() => refetch()}
        />
      )}
      {isLoading && <div className="flex-1 flex items-center justify-center text-gray-400">데이터 로딩 중...</div>}
      {error && <div className="flex-1 flex items-center justify-center text-red-400">데이터를 불러오지 못했습니다.</div>}
      {!isLoading && !error && (
        <div className="flex-1 ag-theme-alpine overflow-hidden">
          <AgGridReact
            ref={gridRef}
            rowData={stocks}
            columnDefs={colDefs}
            defaultColDef={defaultColDef}
            domLayout="normal"
            headerHeight={36}
            rowHeight={32}
          />
        </div>
      )}
    </div>
  )
}
