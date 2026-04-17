import { useMemo } from 'react'
import { AgGridReact } from 'ag-grid-react'
import type { ColDef, ValueFormatterParams } from 'ag-grid-community'
import { AllCommunityModule, ModuleRegistry } from 'ag-grid-community'

ModuleRegistry.registerModules([AllCommunityModule])

interface BalanceRow {
  broker: string
  code: string
  name: string
  qty: number
  avgPrice: number
  currentPrice: number
  evalAmount: number
  profitAmount: number
  profitRate: number
  weight: number
}

const numFmt = (v: number) => v.toLocaleString('ko-KR')
const colorStyle = (v: number): React.CSSProperties =>
  v > 0 ? { color: '#ef4444', fontWeight: 600 } : v < 0 ? { color: '#3b82f6', fontWeight: 600 } : {}

function ProfitCell({ value }: { value: number }) {
  return <span style={colorStyle(value)}>{(value > 0 ? '+' : '') + numFmt(value)}</span>
}
function RateCell({ value }: { value: number }) {
  return <span style={colorStyle(value)}>{(value > 0 ? '+' : '') + value.toFixed(2) + '%'}</span>
}
function PriceCell({ value }: { value: number }) {
  return <span style={{ fontFamily: 'monospace' }}>{numFmt(value)}</span>
}

const fmtNum = (p: ValueFormatterParams) => numFmt(p.value)

const ROW_DATA: BalanceRow[] = [
  { broker: '키움', code: '005930', name: '삼성전자',    qty: 50,  avgPrice: 62_000, currentPrice: 71_800, evalAmount: 3_590_000, profitAmount: 490_000,  profitRate: 15.81, weight: 14.2 },
  { broker: '키움', code: '000660', name: 'SK하이닉스',  qty: 10,  avgPrice: 185_000, currentPrice: 178_500, evalAmount: 1_785_000, profitAmount: -65_000, profitRate: -3.51, weight: 7.1  },
  { broker: '키움', code: '035420', name: 'NAVER',       qty: 8,   avgPrice: 210_000, currentPrice: 228_000, evalAmount: 1_824_000, profitAmount: 144_000, profitRate: 8.57,  weight: 7.2  },
  { broker: '키움', code: '373220', name: 'LG에너지솔루션', qty: 3, avgPrice: 380_000, currentPrice: 345_000, evalAmount: 1_035_000, profitAmount: -105_000, profitRate: -9.21, weight: 4.1 },
  { broker: 'KIS',  code: '005380', name: '현대차',      qty: 15,  avgPrice: 215_000, currentPrice: 238_000, evalAmount: 3_570_000, profitAmount: 345_000,  profitRate: 10.70, weight: 14.1 },
  { broker: 'KIS',  code: '051910', name: 'LG화학',      qty: 5,   avgPrice: 312_000, currentPrice: 287_000, evalAmount: 1_435_000, profitAmount: -125_000, profitRate: -8.01, weight: 5.7  },
  { broker: 'KIS',  code: '006400', name: '삼성SDI',     qty: 4,   avgPrice: 415_000, currentPrice: 398_000, evalAmount: 1_592_000, profitAmount: -68_000,  profitRate: -4.09, weight: 6.3  },
  { broker: 'KIS',  code: '035720', name: '카카오',      qty: 30,  avgPrice: 48_500,  currentPrice: 53_200,  evalAmount: 1_596_000, profitAmount: 141_000,  profitRate: 9.69,  weight: 6.3  },
  { broker: 'KIS',  code: '247540', name: '에코프로비엠', qty: 6,  avgPrice: 155_000, currentPrice: 172_000, evalAmount: 1_032_000, profitAmount: 102_000,  profitRate: 10.97, weight: 4.1  },
  { broker: 'KIS',  code: '003550', name: 'LG',          qty: 20,  avgPrice: 78_000,  currentPrice: 82_500,  evalAmount: 1_650_000, profitAmount: 90_000,   profitRate: 5.77,  weight: 6.5  },
  { broker: 'LS',   code: '068270', name: '셀트리온',    qty: 12,  avgPrice: 165_000, currentPrice: 189_000, evalAmount: 2_268_000, profitAmount: 288_000,  profitRate: 14.55, weight: 9.0  },
  { broker: 'LS',   code: '207940', name: '삼성바이오로직스', qty: 2, avgPrice: 820_000, currentPrice: 895_000, evalAmount: 1_790_000, profitAmount: 150_000, profitRate: 9.15, weight: 7.1 },
  { broker: 'LS',   code: '000270', name: '기아',        qty: 18,  avgPrice: 95_000,  currentPrice: 102_500, evalAmount: 1_845_000, profitAmount: 135_000,  profitRate: 7.89,  weight: 7.3  },
  { broker: 'LS',   code: '036570', name: 'NC소프트',    qty: 7,   avgPrice: 195_000, currentPrice: 172_000, evalAmount: 1_204_000, profitAmount: -161_000, profitRate: -11.79, weight: 4.8 },
]

export default function RealtimeBalancePage() {
  const colDefs = useMemo<ColDef<BalanceRow>[]>(() => [
    { field: 'broker',        headerName: '증권사',   width: 72,  pinned: 'left' },
    { field: 'code',          headerName: '종목코드', width: 90,  cellStyle: { fontFamily: 'monospace', fontSize: '11px' } },
    { field: 'name',          headerName: '종목명',   width: 150, pinned: 'left' },
    { field: 'qty',           headerName: '수량',     width: 70,  type: 'numericColumn', valueFormatter: fmtNum },
    { field: 'avgPrice',      headerName: '평균단가', width: 100, type: 'numericColumn', cellRenderer: PriceCell },
    { field: 'currentPrice',  headerName: '현재가',   width: 100, type: 'numericColumn', cellRenderer: PriceCell },
    { field: 'evalAmount',    headerName: '평가금액', width: 120, type: 'numericColumn', valueFormatter: fmtNum },
    { field: 'profitAmount',  headerName: '수익금액', width: 115, type: 'numericColumn', cellRenderer: ProfitCell },
    { field: 'profitRate',    headerName: '수익률',   width: 95,  type: 'numericColumn', cellRenderer: RateCell },
    { field: 'weight',        headerName: '비중(%)',  width: 85,  type: 'numericColumn',
      valueFormatter: (p) => p.value.toFixed(1) + '%' },
  ], [])

  const defaultColDef = useMemo<ColDef>(() => ({
    sortable: true,
    resizable: true,
  }), [])

  const totalEval = ROW_DATA.reduce((s, r) => s + r.evalAmount, 0)
  const totalProfit = ROW_DATA.reduce((s, r) => s + r.profitAmount, 0)

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-2 border-b border-gray-200 bg-gray-50 flex items-center gap-4 shrink-0 text-xs">
        <span className="font-bold text-gray-700 text-sm">실시간 통합 잔고</span>
        <span className="text-gray-400 font-mono">[1102]</span>
        <span className="text-gray-500">총평가 <span className="font-semibold text-gray-800">{numFmt(totalEval)}</span>원</span>
        <span className="text-gray-500">수익금 <span style={colorStyle(totalProfit)} className="font-semibold">{(totalProfit > 0 ? '+' : '') + numFmt(totalProfit)}</span>원</span>
        <span className="ml-auto text-gray-400">{ROW_DATA.length}종목</span>
      </div>
      <div className="flex-1 ag-theme-alpine overflow-hidden">
        <AgGridReact
          rowData={ROW_DATA}
          columnDefs={colDefs}
          defaultColDef={defaultColDef}
          domLayout="normal"
          headerHeight={32}
          rowHeight={26}
        />
      </div>
    </div>
  )
}
