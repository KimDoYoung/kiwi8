import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AgGridReact } from 'ag-grid-react'
import type { ColDef } from 'ag-grid-community'
import { AllCommunityModule, ModuleRegistry } from 'ag-grid-community'
import api from '@/lib/api'
import { formatYmd, fmt } from '@/lib/utils'
import { useWsStore } from '@/store/wsStore'
import { useStockDetailStore } from '@/store/stockDetailStore'
import { useLayoutStore } from '@/store/layoutStore'
import { fetchMenuTree } from '@/services/menuService'
import { useQuery as useMenuQuery } from '@tanstack/react-query'

ModuleRegistry.registerModules([AllCommunityModule])

// ── 공통 체결 행 ──────────────────────────────────────────────────────────────
interface ExecRow {
  _id: string
  broker: string      // 'KIS' | 'LS' | 'KIWOOM'
  side: string        // '매수' | '매도'
  stk_cd: string
  stk_nm: string
  ccnl_qty: number
  ccnl_price: number
  amount: number
  order_time: string  // HHMMSS
  order_no: string
}

const BROKERS = ['전체', 'KIS', 'LS', 'KIWOOM'] as const
type BrokerFilter = typeof BROKERS[number]

const BROKER_COLORS: Record<BrokerFilter, string> = {
  '전체':   '#6b7280',
  'KIS':    '#80624c',
  'LS':     '#003378',
  'KIWOOM': '#e4007f',
}

// ── fetch 함수 ────────────────────────────────────────────────────────────────
async function fetchKisExec(ymd: string): Promise<ExecRow[]> {
  const res = await api.post('/api/v1/stkcompany/kis/TTTC0081R', {
    api_id: 'TTTC0081R', title: 'execlist',
    payload: {
      INQR_STRT_DT: ymd, INQR_END_DT: ymd,
      SLL_BUY_DVSN_CD: '00', CCLD_DVSN: '01',
      ORD_GNO_BRNO: '', ODNO: '', PDNO: '',
      CTX_AREA_FK100: '', CTX_AREA_NK100: '',
    },
  })
  const list: Record<string, unknown>[] = res.data?.data?.output1 ?? []
  return list
    .filter((r) => Number(r['총체결수량'] ?? 0) > 0)
    .map((r, i) => {
      const qty = Number(r['총체결수량'] ?? 0)
      const price = Number(r['평균가'] ?? 0)
      const sideNm = String(r['매도매수구분코드명'] ?? '')
      const side = sideNm.includes('매도') ? '매도' : '매수'
      const rawCd = String(r['상품번호'] ?? '')
      return {
        _id: `KIS-${i}`,
        broker: 'KIS',
        side,
        stk_cd: rawCd.startsWith('A') ? rawCd.slice(1) : rawCd,
        stk_nm: String(r['상품명'] ?? ''),
        ccnl_qty: qty,
        ccnl_price: price,
        amount: Number(r['총체결금액'] ?? qty * price),
        order_time: String(r['주문시각'] ?? '').slice(0, 6),
        order_no: String(r['주문번호'] ?? ''),
      }
    })
}

async function fetchLsExec(_ymd: string): Promise<ExecRow[]> {
  const res = await api.get('/api/v1/stkcompany/ls/execlist')
  const list: Record<string, unknown>[] = res.data?.data?.t0425OutBlock1 ?? []
  return list
    .filter((r) => Number(r['체결수량'] ?? 0) > 0)
    .map((r, i) => {
      const qty = Number(r['체결수량'] ?? 0)
      const price = Number(r['체결가격'] ?? 0)
      const medosu = String(r['구분'] ?? '')
      const side = medosu === '1' ? '매도' : '매수'
      const rawCd = String(r['종목번호'] ?? '')
      return {
        _id: `LS-${i}`,
        broker: 'LS',
        side,
        stk_cd: rawCd.startsWith('A') ? rawCd.slice(1) : rawCd,
        stk_nm: String(r['stk_nm'] ?? ''),
        ccnl_qty: qty,
        ccnl_price: price,
        amount: qty * price,
        order_time: String(r['주문시간'] ?? '').slice(0, 6),
        order_no: String(r['주문번호'] ?? ''),
      }
    })
}

async function fetchKiwoomExec(): Promise<ExecRow[]> {
  const res = await api.post('/api/v1/stkcompany/kiwoom/kt00007', {
    api_id: 'kt00007', title: 'execlist',
    payload: { qry_tp: '4', stk_bond_tp: '1', sell_tp: '0', stk_cd: '', fr_ord_no: '', dmst_stex_tp: '%' },
  })
  const list: Record<string, unknown>[] = res.data?.data?.['계좌별주문체결내역상세'] ?? []
  return list
    .filter((r) => Number(r['체결수량'] ?? 0) > 0)
    .map((r, i) => {
      const qty = Number(r['체결수량'] ?? 0)
      const price = Number(r['체결단가'] ?? 0)
      const orderType = String(r['주문구분'] ?? '')
      const side = orderType.includes('매도') ? '매도' : '매수'
      const rawCd = String(r['종목번호'] ?? '')
      return {
        _id: `KIWOOM-${i}`,
        broker: 'KIWOOM',
        side,
        stk_cd: rawCd.startsWith('A') ? rawCd.slice(1) : rawCd,
        stk_nm: String(r['종목명'] ?? ''),
        ccnl_qty: qty,
        ccnl_price: price,
        amount: qty * price,
        order_time: String(r['주문시간'] ?? '').slice(0, 6),
        order_no: String(r['주문번호'] ?? ''),
      }
    })
}

async function fetchAllExecs(ymd: string): Promise<ExecRow[]> {
  const results = await Promise.allSettled([
    fetchKisExec(ymd),
    fetchLsExec(ymd),
    fetchKiwoomExec(),
  ])
  const rows = results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
  return rows.sort((a, b) => b.order_time.localeCompare(a.order_time))
}

// ── 셀 렌더러 ──────────────────────────────────────────────────────────────────
function SideCell({ value }: { value: string }) {
  const isBuy = value === '매수'
  const cls = isBuy ? 'bg-red-50 text-red-500' : 'bg-blue-50 text-blue-500'
  return <span className={`px-1.5 py-0.5 rounded text-[11px] font-bold ${cls}`}>{value}</span>
}

function BrokerCell({ value }: { value: string }) {
  const color = BROKER_COLORS[value as BrokerFilter] ?? '#6b7280'
  return <span style={{ color, fontWeight: 700, fontSize: '11px' }}>{value}</span>
}

function TimeCell({ value }: { value: string }) {
  if (!value) return <span>-</span>
  const v = value.replace(/:/g, '').padEnd(6, '0')
  return <span>{`${v.slice(0,2)}:${v.slice(2,4)}:${v.slice(4,6)}`}</span>
}

function AmtCell({ value }: { value: number }) {
  if (!value && value !== 0) return <span className="text-gray-300 text-xs">-</span>
  return <span>{fmt(value)}</span>
}

// ── 메인 페이지 ────────────────────────────────────────────────────────────────
export default function ExecutionHistoryPage() {
  const [broker, setBroker] = useState<BrokerFilter>('전체')
  const [ymd, setYmd] = useState(() => formatYmd(new Date()))
  const gridRef = useRef<AgGridReact>(null)
  const setStock = useStockDetailStore((s) => s.setStock)
  const openByScreenNo = useLayoutStore((s) => s.openByScreenNo)

  const { data: menus } = useMenuQuery({
    queryKey: ['menus'],
    queryFn: fetchMenuTree,
    staleTime: 1000 * 60 * 10,
  })

  const { data: allRows = [], isLoading, refetch } = useQuery({
    queryKey: ['exec-history', ymd],
    queryFn: () => fetchAllExecs(ymd),
    staleTime: 0,
  })

  // 체결 이벤트 → 자동 갱신
  const latestOrderKey = useWsStore((s) => {
    const ev = s.orderEvents[0]
    return ev ? `${ev.broker}-${ev.order_no}-${ev.ccnl_time}` : null
  })
  useEffect(() => {
    if (latestOrderKey) refetch()
  }, [latestOrderKey, refetch])

  const rows = useMemo(() => {
    if (broker === '전체') return allRows
    return allRows.filter((r) => r.broker === broker)
  }, [allRows, broker])

  const buyCount = rows.filter((r) => r.side === '매수').length
  const sellCount = rows.filter((r) => r.side === '매도').length
  const totalAmt = rows.reduce((s, r) => s + r.amount, 0)

  const colDefs = useMemo<ColDef<ExecRow>[]>(() => [
    { field: 'broker',      headerName: '증권사',   width: 80,  cellRenderer: BrokerCell },
    { field: 'side',        headerName: '구분',     width: 65,  cellRenderer: SideCell },
    {
      field: 'stk_cd', headerName: '종목코드', width: 85,
      cellStyle: { fontFamily: 'monospace', fontSize: '11px', color: '#6b7280' },
    },
    {
      field: 'stk_nm', headerName: '종목명', width: 120,
      cellRenderer: ({ value, data }: { value: string; data: ExecRow }) => (
        <span
          className="text-blue-600 cursor-pointer hover:underline"
          onClick={() => { setStock(data.stk_cd, value); openByScreenNo('1201', menus || []) }}
        >{value || data.stk_cd}</span>
      ),
    },
    { field: 'ccnl_qty',   headerName: '체결수량', width: 90,  type: 'numericColumn', cellRenderer: AmtCell },
    { field: 'ccnl_price', headerName: '체결가격', width: 90,  type: 'numericColumn', cellRenderer: AmtCell },
    {
      field: 'amount', headerName: '체결금액', width: 110, type: 'numericColumn',
      cellRenderer: AmtCell,
    },
    { field: 'order_time', headerName: '주문시간', width: 80, cellRenderer: TimeCell, cellStyle: { fontFamily: 'monospace', fontSize: '11px' } },
    { field: 'order_no',   headerName: '주문번호', width: 95, cellStyle: { fontFamily: 'monospace', fontSize: '11px' } },
  ], [setStock, openByScreenNo, menus])

  const getRowId = useCallback((p: { data: ExecRow }) => p.data._id, [])

  return (
    <div className="flex flex-col h-full overflow-hidden bg-gray-50">

      {/* 헤더 */}
      <div className="px-4 py-2 border-b border-gray-200 bg-white flex items-center gap-3 shrink-0 flex-wrap">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="shrink-0">
          <path d="M4 13l5 5L20 7" stroke="#16a34a" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        <span className="text-sm font-bold text-gray-700">전 증권사 체결내역</span>
        <span className="text-xs text-gray-400 font-mono">[1104]</span>

        <input
          type="date"
          value={`${ymd.slice(0,4)}-${ymd.slice(4,6)}-${ymd.slice(6,8)}`}
          onChange={(e) => setYmd(e.target.value.replace(/-/g, ''))}
          className="text-xs border border-gray-200 rounded px-2 py-0.5 focus:outline-none focus:border-green-400"
        />
        <button
          onClick={() => refetch()}
          disabled={isLoading}
          className="text-xs px-2 py-0.5 rounded border border-gray-200 hover:border-green-400 text-gray-500 disabled:opacity-40"
        >
          새로고침
        </button>
      </div>

      {/* 브로커 필터 + 요약 */}
      <div className="flex items-center gap-2 px-3 pt-2 pb-1 shrink-0 flex-wrap">
        <div className="flex gap-1">
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
        <span className="text-[11px] text-gray-400 ml-2">
          {rows.length}건 &nbsp;|&nbsp;
          매수 <span className="text-red-500 font-bold">{buyCount}</span> /
          매도 <span className="text-blue-500 font-bold">{sellCount}</span> &nbsp;|&nbsp;
          <span className="font-bold text-gray-600">{totalAmt.toLocaleString('ko-KR')}원</span>
        </span>
      </div>

      {/* 체결내역 그리드 */}
      <div className="flex-1 min-h-0 px-3 pb-3">
        {isLoading ? (
          <div className="flex items-center justify-center h-full text-sm text-gray-400">로딩 중...</div>
        ) : rows.length === 0 ? (
          <div className="flex items-center justify-center h-full text-xs text-gray-400">체결내역 없음</div>
        ) : (
          <div className="h-full ag-theme-alpine">
            <AgGridReact
              ref={gridRef}
              rowData={rows}
              columnDefs={colDefs}
              defaultColDef={{ resizable: true, sortable: true }}
              domLayout="normal"
              headerHeight={28}
              rowHeight={24}
              getRowId={getRowId}
            />
          </div>
        )}
      </div>

    </div>
  )
}
