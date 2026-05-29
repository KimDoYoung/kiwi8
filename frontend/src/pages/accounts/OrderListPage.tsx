import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { AgGridReact } from 'ag-grid-react'
import type { ColDef } from 'ag-grid-community'
import { AllCommunityModule, ModuleRegistry } from 'ag-grid-community'
import api from '@/lib/api'
import { fmt } from '@/lib/utils'
import { Button } from '@/shared/components/ui/button'

ModuleRegistry.registerModules([AllCommunityModule])

type Broker = '전체' | 'KIS' | 'LS' | 'KIWOOM'

interface OrderRow {
  _id: string
  broker: string
  ordNo: string
  stkCd: string
  stkNm: string
  side: string         // 매수 | 매도
  ordQty: number
  ordPrice: number
  ccnlQty: number
  remnQty: number
  // cancel metadata
  _cancelPayload: Record<string, unknown>
  _cancelApiId: string
  _cancelBroker: string
}

// ── KIS ──────────────────────────────────────────────────────────────────────
async function fetchKisOrders(): Promise<OrderRow[]> {
  const res = await api.post('/api/v1/stkcompany/kis/TTTC0084R', {
    api_id: 'TTTC0084R',
    title: 'orderlist',
    payload: {
      CTX_AREA_FK100: '',
      CTX_AREA_NK100: '',
      INQR_DVSN_1: '0',
      INQR_DVSN_2: '0',
    },
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
      RVSE_CNCL_DVSN_CD: '02',
      ORD_QTY: '0',
      ORD_UNPR: '0',
      QTY_ALL_ORD_YN: 'Y',
    },
  }))
}

// ── LS ───────────────────────────────────────────────────────────────────────
async function fetchLsOrders(): Promise<OrderRow[]> {
  const res = await api.post('/api/v1/stkcompany/ls/t0425', {
    api_id: 't0425',
    title: 'orderlist',
    payload: {
      expcode: '',
      chegb: '2',   // 미체결만
      medosu: '0',  // 전체
      sortgb: '1',  // 주문번호 역순
      cts_ordno: '',
    },
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
      stkCd,
      stkNm: '',    // t0425 응답에 종목명 없음
      side: medosu === '2' ? '매도' : '매수',
      ordQty: Number(r['주문수량'] ?? 0),
      ordPrice: Number(r['주문가격'] ?? 0),
      ccnlQty: Number(r['체결수량'] ?? 0),
      remnQty: Number(r['미체결잔량'] ?? 0),
      _cancelApiId: 'CSPAT00801',
      _cancelBroker: 'ls',
      _cancelPayload: {
        OrgOrdNo: Number(r['주문번호'] ?? 0),
        IsuNo: expcode || stkCd,
        OrdQty: 0,
      },
    }
  })
}

// ── KIWOOM ───────────────────────────────────────────────────────────────────
async function fetchKiwoomOrders(): Promise<OrderRow[]> {
  const res = await api.post('/api/v1/stkcompany/kiwoom/kt00007', {
    api_id: 'kt00007',
    title: 'orderlist',
    payload: {
      qry_tp: '3',      // 미체결만
      stk_bond_tp: '1',
      sell_tp: '0',
      stk_cd: '',
      fr_ord_no: '',
      dmst_stex_tp: '%',
    },
  })
  const data = res.data?.data
  if (!data) return []
  const list: Record<string, unknown>[] =
    data['계좌별주문체결내역상세'] ?? []
  return list.map((r, i) => {
    const stkCd = String(r['종목번호'] ?? '').replace(/^A/, '')
    const ioTpNm = String(r['주문구분'] ?? '')
    const side = ioTpNm.includes('매도') ? '매도' : '매수'
    return {
      _id: `KIWOOM-${i}`,
      broker: 'KIWOOM',
      ordNo: String(r['주문번호'] ?? ''),
      stkCd,
      stkNm: String(r['종목명'] ?? ''),
      side,
      ordQty: Number(r['주문수량'] ?? 0),
      ordPrice: Number(r['주문단가'] ?? 0),
      ccnlQty: Number(r['체결수량'] ?? 0),
      remnQty: Number(r['주문잔량'] ?? 0),
      _cancelApiId: 'kt10003',
      _cancelBroker: 'kiwoom',
      _cancelPayload: {
        dmst_stex_tp: 'KRX',
        orig_ord_no: String(r['주문번호'] ?? ''),
        stk_cd: String(r['종목번호'] ?? '').replace(/^A/, ''),
        cncl_qty: '0',
      },
    }
  })
}

async function fetchAllOrders(): Promise<OrderRow[]> {
  const results = await Promise.allSettled([
    fetchKisOrders(),
    fetchLsOrders(),
    fetchKiwoomOrders(),
  ])
  return results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
}

// ── Cancel ───────────────────────────────────────────────────────────────────
async function cancelOrder(row: OrderRow): Promise<void> {
  const url = `/api/v1/stkcompany/${row._cancelBroker}/${row._cancelApiId}`
  const res = await api.post(url, {
    api_id: row._cancelApiId,
    title: 'ordercancel',
    payload: row._cancelPayload,
  })
  if (!res.data?.success) {
    throw new Error(res.data?.error_message ?? '취소 실패')
  }
}

// ── Components ───────────────────────────────────────────────────────────────
const BROKER_COLORS: Record<Broker, string> = {
  '전체':   '#6b7280',
  'KIS':    '#80624c',
  'LS':     '#003378',
  'KIWOOM': '#e4007f',
}

function SideCell({ value }: { value: string }) {
  const isBuy = value === '매수'
  const cls = isBuy ? 'bg-red-50 text-red-500' : 'bg-blue-50 text-blue-500'
  return <span className={`px-1.5 py-0.5 rounded text-[11px] font-bold ${cls}`}>{value}</span>
}

function AmtCell({ value }: { value: number }) {
  if (!value && value !== 0) return <span className="text-gray-300 text-xs">-</span>
  return <span>{fmt(value)}</span>
}

function BrokerCell({ value }: { value: string }) {
  const color = BROKER_COLORS[value as Broker] ?? '#6b7280'
  return <span style={{ color, fontWeight: 700, fontSize: '11px' }}>{value}</span>
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function OrderListPage() {
  const [broker, setBroker] = useState<Broker>('전체')
  const queryClient = useQueryClient()

  const { data: allRows = [], isLoading, refetch } = useQuery({
    queryKey: ['order-list'],
    queryFn: fetchAllOrders,
    staleTime: 0,
  })

  const cancelMut = useMutation({
    mutationFn: cancelOrder,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['order-list'] })
    },
    onError: (e: Error) => {
      alert(`취소 실패: ${e.message}`)
    },
  })

  const rows = useMemo(() => {
    if (broker === '전체') return allRows
    return allRows.filter((r) => r.broker === broker)
  }, [allRows, broker])

  const colDefs = useMemo<ColDef<OrderRow>[]>(() => [

    { field: 'broker',    headerName: '증권사',   width: 100,  cellRenderer: BrokerCell },
    { field: 'side',      headerName: '구분',     width: 80,  cellRenderer: SideCell },
    { field: 'stkCd',    headerName: '종목코드', width: 100,  cellStyle: { fontFamily: 'monospace', fontSize: '12px' } },
    { field: 'stkNm',    headerName: '종목명',   width: 120 },
    { field: 'ordNo',    headerName: '주문번호', width: 100,  cellStyle: { fontFamily: 'monospace', fontSize: '12px' } },
    { field: 'ordQty',   headerName: '주문수량', width: 85,  type: 'numericColumn', cellRenderer: AmtCell },
    { field: 'ordPrice', headerName: '주문가',   width: 95,  type: 'numericColumn', cellRenderer: AmtCell },
    { field: 'ccnlQty',  headerName: '체결수량', width: 85,  type: 'numericColumn', cellRenderer: AmtCell },
    { field: 'remnQty',  headerName: '미체결잔량', width: 110, type: 'numericColumn',
      cellRenderer: (p: { value: number }) => (
        <span className={p.value > 0 ? 'text-orange-600 font-bold' : ''}>{fmt(p.value)}</span>
      ),
    },
    {
      headerName: '주문금액', width: 110, type: 'numericColumn',
      valueGetter: (p) => (p.data?.ordQty ?? 0) * (p.data?.ordPrice ?? 0),
      cellRenderer: AmtCell,
    },
    {
      headerName: '취소',
      width: 70,
      cellRenderer: (p: { data: OrderRow }) => (
        <button
          disabled={cancelMut.isPending}
          onClick={() => {
            if (window.confirm(`[${p.data.broker}] ${p.data.stkNm || p.data.stkCd} ${p.data.side} ${p.data.remnQty}주 취소?`))
              cancelMut.mutate(p.data)
          }}
          className="px-1.5 py-0 leading-none text-[10px] font-bold rounded border border-gray-300 text-gray-600 hover:bg-red-50 hover:border-red-300 hover:text-red-600 disabled:opacity-40 h-5"
        >
          취소
        </button>
      ),
    },    
  ], [cancelMut])

  const brokers: Broker[] = ['전체', 'KIS', 'LS', 'KIWOOM']
  const totRemn = rows.reduce((s, r) => s + r.remnQty, 0)
  const buyCount = rows.filter((r) => r.side === '매수').length
  const sellCount = rows.filter((r) => r.side === '매도').length

  return (
    <div className="flex flex-col h-full overflow-hidden bg-gray-50">
      {/* 헤더 */}
      <div className="px-4 py-2 border-b border-gray-200 bg-white flex items-center gap-3 shrink-0">
        <span className="text-sm font-bold text-gray-700">전 증권사 주문내역</span>
        <span className="text-xs text-gray-400 font-mono">[1105]</span>
        <Button
         onClick={() => refetch()}
         disabled={isLoading}
        >
          새로 고침
        </Button>
        <span className="text-xs text-gray-500 ml-2">
          총 {rows.length}건 &nbsp;|&nbsp;
          매수 <span className="text-red-500 font-bold">{buyCount}</span> /
          매도 <span className="text-blue-500 font-bold">{sellCount}</span> &nbsp;|&nbsp;
          미체결잔량 <span className="font-bold text-orange-600">{fmt(totRemn)}</span>주
        </span>
      </div>

      {/* 브로커 탭 */}
      <div className="flex gap-1 px-3 pt-2 pb-1 shrink-0">
        {brokers.map((b) => (
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
          <div className="flex items-center justify-center h-full text-sm text-gray-400">미체결 주문 없음</div>
        ) : (
          <div className="h-full ag-theme-alpine">
            <AgGridReact
              rowData={rows}
              columnDefs={colDefs}
              defaultColDef={{ resizable: true, sortable: true }}
              domLayout="normal"
              headerHeight={32}
              rowHeight={26}
              getRowId={(p) => p.data._id}
            />
          </div>
        )}
      </div>
    </div>
  )
}
