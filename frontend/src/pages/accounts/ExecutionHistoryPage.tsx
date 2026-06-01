import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { AgGridReact } from 'ag-grid-react'
import type { ColDef } from 'ag-grid-community'
import { AllCommunityModule, ModuleRegistry } from 'ag-grid-community'
import api from '@/lib/api'
import { formatDate, formatYmd, fmt } from '@/lib/utils'
import { fetchMenuTree } from '@/services/menuService'
import { useStockDetailStore } from '@/store/stockDetailStore'
import { useLayoutStore } from '@/store/layoutStore'

ModuleRegistry.registerModules([AllCommunityModule])

// ── 체결내역 타입 ─────────────────────────────────────────────────────────────
interface TradeRow {
  id: number
  broker: string
  acct_no: string
  order_no: string
  sell_buy: string
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

// ── 미체결 주문 타입 ──────────────────────────────────────────────────────────
interface OrderRow {
  _id: string
  broker: string
  ordNo: string
  stkCd: string
  stkNm: string
  side: string
  ordQty: number
  ordPrice: number
  ccnlQty: number
  remnQty: number
  _cancelPayload: Record<string, unknown>
  _cancelApiId: string
  _cancelBroker: string
}

// ── 공통 ──────────────────────────────────────────────────────────────────────
const BROKERS = ['전체', 'KIS', 'LS', 'KIWOOM'] as const
type BrokerFilter = typeof BROKERS[number]

const BROKER_COLORS: Record<BrokerFilter, string> = {
  '전체':   '#6b7280',
  'KIS':    '#80624c',
  'LS':     '#003378',
  'KIWOOM': '#e4007f',
}

// ── 체결내역 fetch ────────────────────────────────────────────────────────────
async function fetchTrades(broker: string, ymd: string): Promise<TradeRow[]> {
  const params = new URLSearchParams({ limit: '300' })
  if (broker) params.set('broker', broker)
  if (ymd) params.set('ymd', ymd)
  const res = await api.get(`/api/v1/stock/trades-history?${params}`)
  return res.data?.data?.list ?? []
}

// ── 미체결 주문 fetch ─────────────────────────────────────────────────────────
async function fetchKisOrders(): Promise<OrderRow[]> {
  const res = await api.post('/api/v1/stkcompany/kis/TTTC0084R', {
    api_id: 'TTTC0084R', title: 'orderlist',
    payload: { CTX_AREA_FK100: '', CTX_AREA_NK100: '', INQR_DVSN_1: '0', INQR_DVSN_2: '0' },
  })
  const data = res.data?.data
  if (!data) return []
  const list: Record<string, unknown>[] = data['output'] ?? []
  return list.map((r, i) => ({
    _id: `KIS-${i}`,
    broker: 'KIS',
    ordNo: String(r['주문번호'] ?? ''),
    stkCd: String(r['상품번호'] ?? '').replace(/^A/, ''),
    stkNm: String(r['상품명'] ?? ''),
    side: r['매도매수구분코드'] === '01' ? '매도' : '매수',
    ordQty: Number(r['주문수량'] ?? 0),
    ordPrice: Number(r['주문단가'] ?? 0),
    ccnlQty: Number(r['총체결수량'] ?? 0),
    remnQty: Number(r['가능수량'] ?? 0),
    _cancelApiId: 'TTTC0013U',
    _cancelBroker: 'kis',
    _cancelPayload: {
      KRX_FWDG_ORD_ORGNO: String(r['주문채번지점번호'] ?? ''),
      ORGN_ODNO: String(r['주문번호'] ?? ''),
      ORD_DVSN: String(r['주문구분코드'] ?? '00'),
      RVSE_CNCL_DVSN_CD: '02', ORD_QTY: '0', ORD_UNPR: '0', QTY_ALL_ORD_YN: 'Y',
    },
  }))
}

async function fetchLsOrders(): Promise<OrderRow[]> {
  const res = await api.post('/api/v1/stkcompany/ls/t0425', {
    api_id: 't0425', title: 'orderlist',
    payload: { expcode: '', chegb: '2', medosu: '0', sortgb: '1', cts_ordno: '' },
  })
  const data = res.data?.data
  if (!data) return []
  const list: Record<string, unknown>[] = data['t0425OutBlock1'] ?? []
  return list.map((r, i) => {
    const expcode = String(r['종목번호'] ?? '')
    const stkCd = expcode.replace(/^A/, '')
    const medosu = String(r['구분'] ?? '')
    return {
      _id: `LS-${i}`,
      broker: 'LS',
      ordNo: String(r['주문번호'] ?? ''),
      stkCd, stkNm: '',
      side: medosu === '2' ? '매도' : '매수',
      ordQty: Number(r['주문수량'] ?? 0),
      ordPrice: Number(r['주문가격'] ?? 0),
      ccnlQty: Number(r['체결수량'] ?? 0),
      remnQty: Number(r['미체결잔량'] ?? 0),
      _cancelApiId: 'CSPAT00801', _cancelBroker: 'ls',
      _cancelPayload: { OrgOrdNo: Number(r['주문번호'] ?? 0), IsuNo: expcode || stkCd, OrdQty: 0 },
    }
  })
}

async function fetchKiwoomOrders(): Promise<OrderRow[]> {
  const res = await api.post('/api/v1/stkcompany/kiwoom/kt00007', {
    api_id: 'kt00007', title: 'orderlist',
    payload: { qry_tp: '3', stk_bond_tp: '1', sell_tp: '0', stk_cd: '', fr_ord_no: '', dmst_stex_tp: '%' },
  })
  const data = res.data?.data
  if (!data) return []
  const list: Record<string, unknown>[] = data['계좌별주문체결내역상세'] ?? []
  return list.map((r, i) => {
    const stkCd = String(r['종목번호'] ?? '').replace(/^A/, '')
    const ioTpNm = String(r['주문구분'] ?? '')
    return {
      _id: `KIWOOM-${i}`,
      broker: 'KIWOOM',
      ordNo: String(r['주문번호'] ?? ''),
      stkCd, stkNm: String(r['종목명'] ?? ''),
      side: ioTpNm.includes('매도') ? '매도' : '매수',
      ordQty: Number(r['주문수량'] ?? 0),
      ordPrice: Number(r['주문단가'] ?? 0),
      ccnlQty: Number(r['체결수량'] ?? 0),
      remnQty: Number(r['주문잔량'] ?? 0),
      _cancelApiId: 'kt10003', _cancelBroker: 'kiwoom',
      _cancelPayload: {
        dmst_stex_tp: 'KRX',
        orig_ord_no: String(r['주문번호'] ?? ''),
        stk_cd: stkCd,
        cncl_qty: '0',
      },
    }
  })
}

async function fetchAllOrders(): Promise<OrderRow[]> {
  const results = await Promise.allSettled([fetchKisOrders(), fetchLsOrders(), fetchKiwoomOrders()])
  return results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
}

async function cancelOrder(row: OrderRow): Promise<void> {
  const url = `/api/v1/stkcompany/${row._cancelBroker}/${row._cancelApiId}`
  const res = await api.post(url, { api_id: row._cancelApiId, title: 'ordercancel', payload: row._cancelPayload })
  if (!res.data?.success) throw new Error(res.data?.error_message ?? '취소 실패')
}

// ── 셀 렌더러 ─────────────────────────────────────────────────────────────────
function isBuy(v: string) { return v === '01' || v === '1' }

function SideCellTrade({ value }: { value: string }) {
  const label = isBuy(value) ? '매수' : '매도'
  const cls = isBuy(value) ? 'bg-red-50 text-red-500' : 'bg-blue-50 text-blue-500'
  return <span className={`px-1.5 py-0.5 rounded text-[11px] font-bold ${cls}`}>{label}</span>
}

function SideCellOrder({ value }: { value: string }) {
  const isBuyOrder = value === '매수'
  const cls = isBuyOrder ? 'bg-red-50 text-red-500' : 'bg-blue-50 text-blue-500'
  return <span className={`px-1.5 py-0.5 rounded text-[11px] font-bold ${cls}`}>{value}</span>
}

function BrokerCell({ value }: { value: string }) {
  const color = BROKER_COLORS[value as BrokerFilter] ?? '#6b7280'
  return <span style={{ color, fontWeight: 700, fontSize: '11px' }}>{value}</span>
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

function AmtCell({ value }: { value: number }) {
  if (!value && value !== 0) return <span className="text-gray-300 text-xs">-</span>
  return <span>{fmt(value)}</span>
}

// ── 메인 페이지 ───────────────────────────────────────────────────────────────
export default function ExecutionHistoryPage() {
  const [broker, setBroker] = useState<BrokerFilter>('전체')
  const [ymd, setYmd] = useState(() => formatYmd(new Date()))
  const queryClient = useQueryClient()
  const setStock = useStockDetailStore((s) => s.setStock)
  const openByScreenNo = useLayoutStore((s) => s.openByScreenNo)

  const { data: menus } = useQuery({
    queryKey: ['menus'],
    queryFn: fetchMenuTree,
    staleTime: 1000 * 60 * 10,
  })

  // 체결내역
  const { data: tradeRows = [], isLoading: tradeLoading, refetch: refetchTrades } = useQuery({
    queryKey: ['trades-history', broker, ymd],
    queryFn: () => fetchTrades(broker === '전체' ? '' : broker, ymd),
  })

  // 미체결 주문
  const { data: allOrderRows = [], isLoading: orderLoading, refetch: refetchOrders } = useQuery({
    queryKey: ['order-list'],
    queryFn: fetchAllOrders,
    staleTime: 0,
  })

  const cancelMut = useMutation({
    mutationFn: cancelOrder,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['order-list'] }),
    onError: (e: Error) => alert(`취소 실패: ${e.message}`),
  })

  // broker 필터 적용
  const orderRows = useMemo(() => {
    if (broker === '전체') return allOrderRows
    return allOrderRows.filter((r) => r.broker === broker)
  }, [allOrderRows, broker])

  // 컬럼 정의 - 미체결
  const orderColDefs = useMemo<ColDef<OrderRow>[]>(() => [
    { field: 'broker',   headerName: '증권사',   width: 80,  cellRenderer: BrokerCell },
    { field: 'side',     headerName: '구분',     width: 70,  cellRenderer: SideCellOrder },
    {
      field: 'stkCd', headerName: '종목코드', width: 85,
      cellRenderer: ({ value }: { value: string }) => (
        <span
          className="font-mono text-gray-500 cursor-pointer hover:text-green-600 hover:underline"
          style={{ fontSize: '11px' }}
          onClick={() => window.open(`https://finance.naver.com/item/main.naver?code=${value}`, '_blank')}
        >{value}</span>
      ),
    },
    {
      field: 'stkNm', headerName: '종목명', width: 110,
      cellRenderer: ({ value, data }: { value: string; data: OrderRow }) => (
        <span
          className="text-blue-600 cursor-pointer hover:underline"
          onClick={() => { setStock(data.stkCd, value); openByScreenNo('1201', menus || []) }}
        >{value}</span>
      ),
    },
    { field: 'ordNo',   headerName: '주문번호', width: 90,  cellStyle: { fontFamily: 'monospace', fontSize: '11px' } },
    { field: 'ordQty',  headerName: '주문수량', width: 90,  type: 'numericColumn', cellRenderer: AmtCell },
    { field: 'ordPrice',headerName: '주문가',   width: 90,  type: 'numericColumn', cellRenderer: AmtCell },
    { field: 'ccnlQty', headerName: '체결수량', width: 90,  type: 'numericColumn', cellRenderer: AmtCell },
    { field: 'remnQty', headerName: '미체결잔량', width: 100, type: 'numericColumn',
      cellRenderer: (p: { value: number }) => (
        <span className={p.value > 0 ? 'text-orange-600 font-bold' : ''}>{fmt(p.value)}</span>
      ),
    },
    {
      headerName: '취소', width: 65,
      cellRenderer: (p: { data: OrderRow }) => (
        <button
          disabled={cancelMut.isPending}
          onClick={() => {
            if (window.confirm(`[${p.data.broker}] ${p.data.stkNm || p.data.stkCd} ${p.data.side} ${p.data.remnQty}주 취소?`))
              cancelMut.mutate(p.data)
          }}
          className="px-1.5 py-0 h-5 leading-none text-[10px] font-bold rounded border border-gray-300 text-gray-600 hover:bg-red-50 hover:border-red-300 hover:text-red-600 disabled:opacity-40"
        >
          취소
        </button>
      ),
    },
  ], [cancelMut, setStock, openByScreenNo, menus])

  // 컬럼 정의 - 체결내역
  const tradeColDefs = useMemo<ColDef<TradeRow>[]>(() => [
    { field: 'ccnl_time',   headerName: '체결시간', width: 90,  cellRenderer: TimeCell, cellStyle: { fontFamily: 'monospace', fontSize: '11px' } },
    { field: 'ymd',         headerName: '일자',     width: 110, cellRenderer: YmdCell },
    { field: 'broker',      headerName: '증권사',   width: 90  },
    {
      field: 'stk_cd', headerName: '종목코드', width: 85,
      cellRenderer: ({ value }: { value: string }) => (
        <span
          className="font-mono text-gray-500 cursor-pointer hover:text-green-600 hover:underline"
          style={{ fontSize: '11px' }}
          onClick={() => window.open(`https://finance.naver.com/item/main.naver?code=${value}`, '_blank')}
        >{value}</span>
      ),
    },
    {
      field: 'stk_nm', headerName: '종목명', width: 120,
      cellRenderer: ({ value, data }: { value: string; data: TradeRow }) => (
        <span
          className="text-blue-600 cursor-pointer hover:underline"
          onClick={() => { setStock(data.stk_cd, value); openByScreenNo('1201', menus || []) }}
        >{value}</span>
      ),
    },
    { field: 'sell_buy',   headerName: '구분',     width: 70,  cellRenderer: SideCellTrade },
    { field: 'ccnl_qty',   headerName: '체결수량', width: 85,  type: 'numericColumn', cellRenderer: AmountCell },
    { field: 'ccnl_price', headerName: '체결가',   width: 90,  type: 'numericColumn', cellRenderer: AmountCell },
    {
      headerName: '체결금액', width: 110, type: 'numericColumn',
      valueGetter: (p) => {
        const q = p.data?.ccnl_qty ?? 0
        const pr = p.data?.ccnl_price ?? 0
        return q && pr ? q * pr : null
      },
      cellRenderer: AmountCell,
    },
    { field: 'order_qty',   headerName: '주문수량', width: 90,  type: 'numericColumn', cellRenderer: AmountCell },
    { field: 'order_price', headerName: '주문가',   width: 100,  type: 'numericColumn', cellRenderer: AmountCell },
    { field: 'order_no',   headerName: '주문번호', width: 95,  cellStyle: { fontFamily: 'monospace', fontSize: '11px' } },
    { field: 'acct_no',    headerName: '계좌번호', width: 115, cellStyle: { fontFamily: 'monospace', fontSize: '11px' } },
    { field: 'note',       headerName: '메모',     width: 110 },
  ], [setStock, openByScreenNo, menus])

  const totalAmt = tradeRows.reduce((s, r) => s + (r.ccnl_qty ?? 0) * (r.ccnl_price ?? 0), 0)
  const tradeBuy = tradeRows.filter((r) => isBuy(r.sell_buy)).length
  const tradeSell = tradeRows.filter((r) => !isBuy(r.sell_buy)).length
  const totRemn = orderRows.reduce((s, r) => s + r.remnQty, 0)

  return (
    <div className="flex flex-col h-full overflow-hidden bg-gray-50">

      {/* 헤더 */}
      <div className="px-4 py-2 border-b border-gray-200 bg-white flex items-center gap-3 shrink-0 flex-wrap">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="shrink-0">
          <path d="M4 13l5 5L20 7" stroke="#16a34a" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        <span className="text-sm font-bold text-gray-700">전 증권사 주문/체결</span>
        <span className="text-xs text-gray-400 font-mono">[1104]</span>

        <input
          type="date"
          value={`${ymd.slice(0,4)}-${ymd.slice(4,6)}-${ymd.slice(6,8)}`}
          onChange={(e) => setYmd(e.target.value.replace(/-/g, ''))}
          className="text-xs border border-gray-200 rounded px-2 py-0.5 focus:outline-none focus:border-green-400"
        />
        <button
          onClick={() => refetchTrades()}
          className="text-xs px-2 py-0.5 rounded border border-gray-200 hover:border-green-400 text-gray-500"
        >
          체결 새로고침
        </button>
        <button
          onClick={() => refetchOrders()}
          disabled={orderLoading}
          className="text-xs px-2 py-0.5 rounded border border-gray-200 hover:border-orange-400 text-gray-500 disabled:opacity-40"
        >
          주문 새로고침
        </button>
      </div>

      {/* 브로커 필터 (공통) */}
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

      {/* ── 미체결 주문 그리드 (상단 40%) ── */}
      <div className="h-[40%] min-h-0 flex flex-col px-3 pt-1 pb-1">
        <div className="flex items-center gap-2 mb-1 shrink-0">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <rect x="3" y="4" width="14" height="16" rx="2" stroke="#f97316" strokeWidth="2" fill="#fff7ed"/>
            <path d="M7 8h6M7 12h6M7 16h3" stroke="#f97316" strokeWidth="1.8" strokeLinecap="round"/>
          </svg>
          <span className="text-[11px] font-semibold text-orange-600">미체결 주문</span>
          <span className="text-[10px] text-gray-400">
            {orderRows.length}건 &nbsp;|&nbsp;
            잔량 <span className="text-orange-500 font-bold">{fmt(totRemn)}</span>주
          </span>
        </div>
        {orderLoading ? (
          <div className="flex items-center justify-center flex-1 text-sm text-gray-400">로딩 중...</div>
        ) : orderRows.length === 0 ? (
          <div className="flex items-center justify-center flex-1 text-xs text-gray-400">미체결 주문 없음</div>
        ) : (
          <div className="flex-1 min-h-0 ag-theme-alpine">
            <AgGridReact
              rowData={orderRows}
              columnDefs={orderColDefs}
              defaultColDef={{ resizable: true, sortable: true }}
              domLayout="normal"
              headerHeight={28}
              rowHeight={24}
              getRowId={(p) => p.data._id}
            />
          </div>
        )}
      </div>

      {/* 구분선 */}
      <div className="h-px bg-gray-300 shrink-0 mx-3" />

      {/* ── 체결내역 그리드 (하단 flex-1) ── */}
      <div className="flex-1 min-h-0 flex flex-col px-3 pt-1 pb-3">
        <div className="flex items-center gap-2 mb-1 shrink-0">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M4 13l5 5L20 7" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <span className="text-[11px] font-semibold text-green-700">체결내역</span>
          <span className="text-[10px] text-gray-400">
            {tradeRows.length}건 &nbsp;|&nbsp;
            매수 <span className="text-red-500 font-bold">{tradeBuy}</span> /
            매도 <span className="text-blue-500 font-bold">{tradeSell}</span> &nbsp;|&nbsp;
            <span className="font-bold text-gray-600">{totalAmt.toLocaleString('ko-KR')}원</span>
          </span>
        </div>
        {tradeLoading ? (
          <div className="flex items-center justify-center flex-1 text-sm text-gray-400">로딩 중...</div>
        ) : tradeRows.length === 0 ? (
          <div className="flex items-center justify-center flex-1 text-xs text-gray-400">체결내역 없음</div>
        ) : (
          <div className="flex-1 min-h-0 ag-theme-alpine">
            <AgGridReact
              rowData={tradeRows}
              columnDefs={tradeColDefs}
              defaultColDef={{ resizable: true, sortable: true }}
              domLayout="normal"
              headerHeight={28}
              rowHeight={24}
            />
          </div>
        )}
      </div>

    </div>
  )
}
