import { useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AgGridReact } from 'ag-grid-react'
import type { ColDef } from 'ag-grid-community'
import { AllCommunityModule, ModuleRegistry } from 'ag-grid-community'
import api from '@/shared/lib/api'
import {
  toNum, fmt,
  ProfitCell, RateCell, WeightCell, CodeCell, ActionCell,
  numComparator, exportCsv, AccountHeader,
} from './accountUtils'
import { GroupRadioButton } from '@/shared/components/GroupRadioButton'

ModuleRegistry.registerModules([AllCommunityModule])

async function fetchKisAccount() {
  const res = await api.get('/api/v1/stkcompany/kis/account/list')
  return res.data
}

export default function KisAccountPage() {
  const gridRef = useRef<AgGridReact>(null)
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['stkcompany', 'kis', 'account'],
    queryFn: fetchKisAccount,
    staleTime: 1000 * 30,
  })

  const stocks: Record<string, unknown>[] = data?.data?.output1 ?? []
  const summary = data?.data?.output2?.[0] ?? {}

  const [profitFilter, setProfitFilter] = useState('all')

  const filteredStocks = useMemo(() => {
    if (profitFilter === 'minus') return stocks.filter(s => toNum(s['평가손익금액']) < 0)
    if (profitFilter === 'plus') return stocks.filter(s => toNum(s['평가손익금액']) > 0)
    return stocks
  }, [stocks, profitFilter])

  const totalMaeip = useMemo(() =>
    stocks.reduce((sum, s) => sum + toNum(s['매입금액']), 0), [stocks])

  const 예수금 = toNum(summary['예수금총금액'])
  const 평가금액 = toNum(summary['총평가금액'])
  const 손익 = toNum(summary['평가손익합계금액'])

  const colDefs = useMemo<ColDef[]>(() => [
    {
      headerName: '종목코드', width: 100, pinned: 'left',
      valueGetter: (p) => {
        const code = String(p.data?.상품번호 ?? '')
        return code.startsWith('A') ? code.slice(1) : code
      },
      cellRenderer: CodeCell,
      comparator: (a: string, b: string) => a.localeCompare(b),
    },
    { field: '상품명', headerName: '종목명', width: 150, pinned: 'left' },
    {
      field: '전일대비', headerName: '전일대비', width: 100, type: 'numericColumn',
      cellRenderer: ProfitCell, comparator: numComparator,
    },
    {
      field: '매입평균가격', headerName: '매입평단', width: 110, type: 'numericColumn',
      valueFormatter: ({ value }) => fmt(Math.round(toNum(value))), comparator: numComparator,
    },
    {
      field: '현재가', headerName: '현재가', width: 110, type: 'numericColumn',
      valueFormatter: ({ value }) => fmt(toNum(value)), comparator: numComparator,
    },
    {
      field: '보유수량', headerName: '수량', width: 80, type: 'numericColumn',
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
      field: '평가손익금액', headerName: '손익금액', width: 120, type: 'numericColumn',
      cellRenderer: ProfitCell, comparator: numComparator,
    },
    {
      field: '평가손익율', headerName: '손익율(%)', width: 95, type: 'numericColumn',
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

  if (isLoading) {
    return <Loading message="KIS 계좌 정보를 불러오는 중..." />
  }

  if (error || !data) {
    return <LoadingFail message="KIS 계좌 정보를 불러오는데 실패했습니다." />
  }

  return (
    <div className="flex flex-col h-full text-base">
      <AccountHeader
        title="KIS 계좌현황" screenNo="2101" count={filteredStocks.length}
        예수금={예수금} 평가금액={평가금액} 손익={손익}
        onCsv={() => exportCsv(gridRef, 'KIS_계좌현황.csv')}
        onRefresh={() => refetch()}
      >
        <GroupRadioButton
          options={[
            { 
              label: '-', 
              value: 'minus', 
              className: 'data-[state=on]:bg-blue-100 data-[state=on]:text-blue-700 data-[state=on]:border-blue-300' 
            },
            { 
              label: '全', 
              value: 'all', 
              className: 'data-[state=on]:bg-gray-200 data-[state=on]:text-gray-800 data-[state=on]:border-gray-400' 
            },
            { 
              label: '+', 
              value: 'plus', 
              className: 'data-[state=on]:bg-red-100 data-[state=on]:text-red-700 data-[state=on]:border-red-300' 
            },
          ]}
          value={profitFilter}
          onValueChange={setProfitFilter}
          className="h-[26px] bg-white"
          itemClassName="h-[24px] text-xs px-3"
        />
      </AccountHeader>
      
      <div className="flex-1 ag-theme-alpine overflow-hidden">
        <AgGridReact
          ref={gridRef}
          rowData={filteredStocks}
          columnDefs={colDefs}
          defaultColDef={defaultColDef}
          domLayout="normal"
          headerHeight={36}
          rowHeight={32}
        />
      </div>
    </div>
  )
}
