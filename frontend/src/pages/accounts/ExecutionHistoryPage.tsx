import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AgGridReact } from 'ag-grid-react'
import type { ColDef } from 'ag-grid-community'
import { AllCommunityModule, ModuleRegistry } from 'ag-grid-community'
import api from '@/lib/api'
import { formatDate, formatYmd, fmt } from '@/lib/utils'

ModuleRegistry.registerModules([AllCommunityModule])

interface TradeRow {
  id: number
  broker: string
  acct_no: string
  order_no: string
  sell_buy: string        // '01':매수 '02':매도
  stk_cd: string
  stk_nm: string
  ymd: string
  order_qty: number | null
  order_price: number | null
  ccnl_qty: number | null
  ccnl_price: number | null
  ccnl_time: string
  note: string | null
  created_at: string
}

function isBuy(v: string) { return v === '01' || v === '1' }
function SideCell({ value }: { value: string }) {
  const label = isBuy(value) ? '매수' : '매도'
  const cls = isBuy(value) ? 'bg-red-50 text-red-500' : 'bg-blue-50 text-blue-500'
  return <span className={`px-1.5 py-0.5 rounded text-[11px] font-bold ${cls}`}>{label}</span>
}

function YmdCell({ value }: { value: string }) {
  if (!value) return <span>-</span>
  return <span>{formatDate(value, false)}</span>
}

function TimeCell({ value }: { value: string }) {
  if (!value) return <span>-</span>
  const v = value.replace(/:/g, '')
  if (v.length >= 6) return <span>{`${v.slice(0,2)}:${v.slice(2,4)}:${v.slice(4,6)}`}</span>
  return <span>{value}</span>
}

function AmountCell({ value }: { value: number | null }) {
  if (value == null) return <span className="text-gray-300 text-xs">-</span>
  return <span>{fmt(value)}</span>
}

async function fetchTrades(broker: string, ymd: string): Promise<TradeRow[]> {
  const params = new URLSearchParams({ limit: '300' })
  if (broker) params.set('broker', broker)
  if (ymd) params.set('ymd', ymd)
  const res = await api.get(`/api/v1/stock/trades-history?${params}`)
  return res.data?.data?.list ?? []
}

const BROKERS = ['전체', 'KIS', 'LS', 'KIWOOM'] as const
type BrokerFilter = typeof BROKERS[number]

const BROKER_COLORS: Record<BrokerFilter, string> = {
  '전체':   '#6b7280',
  'KIS':    '#80624c',
  'LS':     '#003378',
  'KIWOOM': '#e4007f',
}

export default function ExecutionHistoryPage() {
  const [broker, setBroker] = useState<BrokerFilter>('전체')
  const [ymd, setYmd] = useState(() => formatYmd(new Date()))

  const { data: rows = [], isLoading, refetch } = useQuery({
    queryKey: ['trades-history', broker, ymd],
    queryFn: () => fetchTrades(broker === '전체' ? '' : broker, ymd),
  })

  const colDefs = useMemo<ColDef<TradeRow>[]>(() => [
    { field: 'ccnl_time', headerName: '체결시간', width: 100, cellRenderer: TimeCell, cellStyle: { fontFamily: 'monospace', fontSize: '11px' } },
    { field: 'ymd',       headerName: '일자',     width: 120, cellRenderer: YmdCell },
    { field: 'broker',    headerName: '증권사',   width: 100 },
    { field: 'stk_cd',   headerName: '종목코드', width: 88, cellStyle: { fontFamily: 'monospace', fontSize: '11px' } },
    { field: 'stk_nm',   headerName: '종목명',   width: 130 },
    { field: 'sell_buy', headerName: '구분',     width: 68, cellRenderer: SideCell },
    {
      field: 'ccnl_qty', headerName: '체결수량', width: 90,
      type: 'numericColumn',
      cellRenderer: AmountCell,
    },
    {
      field: 'ccnl_price', headerName: '체결가', width: 95,
      type: 'numericColumn',
      cellRenderer: AmountCell,
    },
    {
      headerName: '체결금액', width: 115,
      type: 'numericColumn',
      valueGetter: (p) => {
        const q = p.data?.ccnl_qty ?? 0
        const pr = p.data?.ccnl_price ?? 0
        return q && pr ? q * pr : null
      },
      cellRenderer: AmountCell,
    },
    {
      field: 'order_qty', headerName: '주문수량', width: 80,
      type: 'numericColumn',
      cellRenderer: AmountCell,
    },
    {
      field: 'order_price', headerName: '주문가', width: 95,
      type: 'numericColumn',
      cellRenderer: AmountCell,
    },
    { field: 'order_no', headerName: '주문번호', width: 100, cellStyle: { fontFamily: 'monospace', fontSize: '11px' } },
    { field: 'acct_no',  headerName: '계좌번호', width: 120, cellStyle: { fontFamily: 'monospace', fontSize: '11px' } },
    { field: 'note',     headerName: '메모',     width: 120 },
  ], [])

  const totalAmt = rows.reduce((s, r) => s + (r.ccnl_qty ?? 0) * (r.ccnl_price ?? 0), 0)
  const buyCount = rows.filter((r) => isBuy(r.sell_buy)).length
  const sellCount = rows.filter((r) => !isBuy(r.sell_buy)).length

  return (
    <div className="flex flex-col h-full overflow-hidden bg-gray-50">
      {/* 헤더 */}
      <div className="px-4 py-2 border-b border-gray-200 bg-white flex items-center gap-3 shrink-0">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" className="shrink-0">
          <path d="M4 13l5 5L20 7" stroke="#16a34a" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M4 13l5 5L20 7" stroke="#16a34a" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" opacity="0.3"/>
        </svg>
        <span className="text-sm font-bold text-gray-700">전 증권사 체결내역</span>
        <span className="text-xs text-gray-400 font-mono">[1104]</span>

        {/* 날짜 */}
        <input
          type="date"
          value={`${ymd.slice(0,4)}-${ymd.slice(4,6)}-${ymd.slice(6,8)}`}
          onChange={(e) => setYmd(e.target.value.replace(/-/g, ''))}
          className="ml-2 text-xs border border-gray-200 rounded px-2 py-0.5 focus:outline-none focus:border-green-400"
        />

        <button
          onClick={() => refetch()}
          className="text-xs px-2 py-0.5 rounded border border-gray-200 hover:border-green-400 text-gray-500"
        >
          새로고침
        </button>

        <span className="text-xs text-gray-500 ml-2">
          총 {rows.length}건 &nbsp;|&nbsp;
          매수 <span className="text-red-500 font-bold">{buyCount}</span> /
          매도 <span className="text-blue-500 font-bold">{sellCount}</span> &nbsp;|&nbsp;
          체결금액 <span className="font-bold text-gray-700">{totalAmt.toLocaleString('ko-KR')}원</span>
        </span>
      </div>

      {/* 브로커 필터 */}
      <div className="flex gap-1 px-3 pt-2 pb-1 shrink-0">
        {BROKERS.map((b) => (
          <button
            key={b}
            onClick={() => setBroker(b)}
            style={broker === b ? { backgroundColor: BROKER_COLORS[b], borderColor: BROKER_COLORS[b], color: 'white' } : {}}
            className={`px-3 py-0.5 rounded-full text-xs font-semibold transition-colors border
              ${broker !== b ? 'bg-white border-gray-200 text-gray-500 hover:border-gray-400' : ''}`}
          >
            {b}
          </button>
        ))}
      </div>

      {/* 그리드 */}
      <div className="flex-1 min-h-0 px-3 pb-3">
        {isLoading ? (
          <div className="flex items-center justify-center h-full text-sm text-gray-400">로딩 중...</div>
        ) : rows.length === 0 ? (
          <div className="flex items-center justify-center h-full text-sm text-gray-400">체결내역 없음</div>
        ) : (
          <div className="h-full ag-theme-alpine">
            <AgGridReact
              rowData={rows}
              columnDefs={colDefs}
              defaultColDef={{ resizable: true, sortable: true }}
              domLayout="normal"
              headerHeight={32}
              rowHeight={26}
            />
          </div>
        )}
      </div>
    </div>
  )
}
