import { useMemo } from 'react'
import { AgGridReact } from 'ag-grid-react'
import type { ColDef, ValueFormatterParams } from 'ag-grid-community'
import { AllCommunityModule, ModuleRegistry } from 'ag-grid-community'

ModuleRegistry.registerModules([AllCommunityModule])

interface AccountRow {
  broker: string
  accountNo: string
  deposit: number
  stockValue: number
  totalValue: number
  buyAmount: number
  profitAmount: number
  profitRate: number
}

const numFmt = (v: number) => v.toLocaleString('ko-KR')
const pctFmt = (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(2)}%`

const colorClass = (v: number) =>
  v > 0 ? 'text-red-500 font-semibold' : v < 0 ? 'text-blue-500 font-semibold' : ''

function ProfitCell({ value }: { value: number }) {
  return <span className={colorClass(value)}>{numFmt(value)}</span>
}
function RateCell({ value }: { value: number }) {
  return <span className={colorClass(value)}>{pctFmt(value)}</span>
}

const ROW_DATA: AccountRow[] = [
  { broker: '키움증권',       accountNo: '1033-4006', deposit: 1_250_000, stockValue: 8_430_500, totalValue: 9_680_500, buyAmount: 7_800_000, profitAmount: 630_500,   profitRate: 8.08  },
  { broker: '한국투자증권',   accountNo: '55401234',  deposit: 3_100_000, stockValue: 12_750_000, totalValue: 15_850_000, buyAmount: 13_200_000, profitAmount: -450_000, profitRate: -3.41 },
  { broker: 'LS증권',         accountNo: '8820-9901', deposit: 500_000,   stockValue: 4_120_000, totalValue: 4_620_000, buyAmount: 3_900_000, profitAmount: 220_000,   profitRate: 5.64  },
  { broker: '합계',           accountNo: '',          deposit: 4_850_000, stockValue: 25_300_500, totalValue: 30_150_500, buyAmount: 24_900_000, profitAmount: 400_500,  profitRate: 1.61  },
]

const fmtNum = (p: ValueFormatterParams) => numFmt(p.value)

export default function AccountSummaryPage() {
  const colDefs = useMemo<ColDef<AccountRow>[]>(() => [
    { field: 'broker',       headerName: '증권사',       width: 130, pinned: 'left',
      cellStyle: (p) => p.value === '합계' ? { fontWeight: 700, background: '#f0fdf4' } : {} },
    { field: 'accountNo',    headerName: '계좌번호',     width: 120, cellStyle: { fontFamily: 'monospace' } },
    { field: 'deposit',      headerName: '예수금',       width: 130, type: 'numericColumn', valueFormatter: fmtNum },
    { field: 'buyAmount',    headerName: '매입금액',     width: 140, type: 'numericColumn', valueFormatter: fmtNum },
    { field: 'stockValue',   headerName: '주식평가금액', width: 140, type: 'numericColumn', valueFormatter: fmtNum },
    { field: 'totalValue',   headerName: '총평가금액',   width: 140, type: 'numericColumn', valueFormatter: fmtNum,
      cellStyle: { fontWeight: 600 } },
    { field: 'profitAmount', headerName: '수익금액',     width: 140, type: 'numericColumn',
      cellRenderer: ProfitCell },
    { field: 'profitRate',   headerName: '수익률',       width: 110, type: 'numericColumn',
      cellRenderer: RateCell },
  ], [])

  const defaultColDef = useMemo<ColDef>(() => ({
    sortable: true,
    resizable: true,
  }), [])

  const getRowStyle = (p: { data?: AccountRow }) =>
    p.data?.broker === '합계' ? { background: '#f0fdf4', borderTop: '1px solid #bbf7d0' } : undefined

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-2.5 border-b border-gray-200 bg-gray-50 flex items-center gap-3 shrink-0">
        <span className="text-sm font-bold text-gray-700">통합 계좌 요약</span>
        <span className="text-xs text-gray-400 font-mono">[1101]</span>
        <span className="ml-auto text-xs text-gray-400">기준일: 2026-04-17</span>
      </div>
      <div className="flex-1 ag-theme-alpine overflow-hidden">
        <AgGridReact
          rowData={ROW_DATA}
          columnDefs={colDefs}
          defaultColDef={defaultColDef}
          getRowStyle={getRowStyle}
          domLayout="normal"
          headerHeight={36}
          rowHeight={42}
        />
      </div>
    </div>
  )
}
