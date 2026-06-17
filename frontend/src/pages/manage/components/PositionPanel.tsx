import { useMemo } from 'react'
import { AgGridReact } from 'ag-grid-react'
import type { ColDef, ValueGetterParams } from 'ag-grid-community'
import { AllCommunityModule, ModuleRegistry } from 'ag-grid-community'

ModuleRegistry.registerModules([AllCommunityModule])

// ── Types ────────────────────────────────────────────────

export interface Position {
    id: number
    stk_cd: string
    stk_nm: string
    buy_price: number
    qty: number
    amount: number
    base_price: number
    stop_price: number
    stop_rate: number
    cur_price: number | null
    bought_at: string
    updated_at: string
}

export interface TickSnapshot {
    price: number
    volume_1min: number | null
    vol_power: number | null
    orderbook_ratio: number | null
}

// ── TickSignal ───────────────────────────────────────────

function TickSignal({ tick }: { tick: TickSnapshot | null }) {
    if (!tick) return <span className="text-gray-300 text-xs">—</span>

    const warnings: string[] = []
    if (tick.orderbook_ratio !== null && tick.orderbook_ratio < 0.8)
        warnings.push(`호가역전 ${tick.orderbook_ratio.toFixed(2)}`)
    if (tick.vol_power !== null && tick.vol_power < 95)
        warnings.push(`체결강도 ${tick.vol_power.toFixed(1)}%`)

    if (warnings.length > 0) {
        return (
            <span title={warnings.join(' | ')} className="text-red-500 font-bold text-xs cursor-help">
                ⚠
            </span>
        )
    }
    if (tick.vol_power !== null && tick.vol_power >= 100) {
        return <span className="text-green-500 text-xs">↑</span>
    }
    return <span className="text-gray-400 text-xs">→</span>
}

// ── VerticalPriceBar ─────────────────────────────────────

function VerticalPriceBar({ p }: { p: Position }) {
    const cur = p.cur_price
    const prices = [p.stop_price, p.buy_price, p.base_price, cur ?? p.buy_price]
    const domainMin = Math.min(...prices)
    const domainMax = Math.max(...prices)
    const pad = (domainMax - domainMin) * 0.08 || p.buy_price * 0.01
    const lo = domainMin - pad
    const hi = domainMax + pad
    const range = hi - lo
    const bot = (v: number) => Math.max(0, Math.min(100, ((v - lo) / range) * 100))

    const stopBot = bot(p.stop_price)
    const buyBot  = bot(p.buy_price)
    const baseBot = bot(p.base_price)
    const curBot  = cur != null ? bot(cur) : null

    const BAR_W = 28

    return (
        <div className="flex items-stretch gap-0">
            {/* 수직 바 */}
            <div className="relative flex-shrink-0" style={{ width: BAR_W, height: 140 }}>
                <div className="absolute inset-x-0 bg-gray-100"
                    style={{ bottom: `${stopBot}%`, top: `${100 - baseBot}%` }} />
                {curBot != null && (
                    <div className={`absolute inset-x-0 ${curBot >= buyBot ? 'bg-red-300' : 'bg-blue-300'}`}
                        style={{
                            bottom: `${Math.min(buyBot, curBot)}%`,
                            height: `${Math.abs(curBot - buyBot)}%`,
                        }} />
                )}
                <div className="absolute inset-x-0 bg-gray-500" style={{ bottom: `${buyBot}%`, height: 2 }} />
                {curBot != null && (
                    <div className="absolute" style={{
                        right: -8,
                        bottom: `${curBot}%`,
                        transform: 'translateY(50%)',
                        width: 0,
                        height: 0,
                        borderTop: '5px solid transparent',
                        borderBottom: '5px solid transparent',
                        borderRight: '8px solid #f97316',
                    }} />
                )}
            </div>
            {/* 가격 레이블 */}
            <div className="relative flex-1 text-[10px] font-mono ml-3" style={{ height: 140 }}>
                <div className="absolute left-0 flex items-center gap-1"
                    style={{ bottom: `${baseBot}%`, transform: 'translateY(50%)' }}>
                    <span className="text-blue-500 font-semibold">{p.base_price.toLocaleString()}</span>
                    <span className="text-gray-400 text-[9px]">기준가</span>
                </div>
                {cur != null && curBot != null && (
                    <div className="absolute left-0 flex items-center gap-1"
                        style={{ bottom: `${curBot}%`, transform: 'translateY(50%)' }}>
                        <span className="text-orange-600 font-bold">{cur.toLocaleString()}</span>
                        <span className="text-gray-400 text-[9px]">현재가</span>
                    </div>
                )}
                <div className="absolute left-0 flex items-center gap-1"
                    style={{ bottom: `${buyBot}%`, transform: 'translateY(50%)' }}>
                    <span className="text-gray-600">{p.buy_price.toLocaleString()}</span>
                    <span className="text-gray-400 text-[9px]">매수가</span>
                </div>
                <div className="absolute left-0 flex items-center gap-1"
                    style={{ bottom: `${stopBot}%`, transform: 'translateY(50%)' }}>
                    <span className="text-red-500">{p.stop_price.toLocaleString()}</span>
                    <span className="text-gray-400 text-[9px]">손절가</span>
                </div>
            </div>
        </div>
    )
}

// ── PositionCard ─────────────────────────────────────────

function PositionCard({ p, tick, onForceSell, isPending }: {
    p: Position
    tick: TickSnapshot | null
    onForceSell: () => void
    isPending: boolean
}) {
    const cur = p.cur_price
    const pl = cur != null ? (cur - p.buy_price) * p.qty : null
    const plRate = cur != null ? ((cur - p.buy_price) / p.buy_price) * 100 : null
    const isProfit = pl != null && pl >= 0

    return (
        <div className="bg-white border border-gray-200 rounded-lg p-3 flex flex-col gap-2.5 shadow-sm">
            <div className="flex items-start justify-between">
                <div>
                    <span className="font-semibold text-gray-900 text-sm">{p.stk_nm || p.stk_cd}</span>
                    <span className="text-gray-400 text-xs ml-1.5 font-mono">({p.stk_cd})</span>
                </div>
                <TickSignal tick={tick} />
            </div>

            <VerticalPriceBar p={p} />

            <div className="flex items-baseline gap-2 border-t border-gray-100 pt-2">
                {pl != null ? (
                    <>
                        <span className={`text-base font-bold tabular-nums ${isProfit ? 'text-red-600' : 'text-blue-600'}`}>
                            {pl >= 0 ? '+' : ''}{pl.toLocaleString()}원
                        </span>
                        <span className={`text-xs px-1.5 py-0.5 rounded font-mono ${isProfit ? 'bg-red-50 text-red-500' : 'bg-blue-50 text-blue-500'}`}>
                            {plRate! >= 0 ? '+' : ''}{plRate!.toFixed(2)}%
                        </span>
                    </>
                ) : (
                    <span className="text-gray-300 text-sm">시세 없음</span>
                )}
                <span className="ml-auto text-xs text-gray-400 font-mono">{p.qty}주</span>
            </div>

            <div className="flex items-center justify-between border-t border-gray-100 pt-1.5">
                <span className="text-[10px] text-gray-400 font-mono">
                    stop {Math.round(p.stop_rate * 100)}% · {p.bought_at?.slice(0, 10) ?? '—'}
                </span>
                <button onClick={onForceSell} disabled={isPending}
                    className="px-2 py-0.5 text-xs text-red-600 border border-red-300 rounded hover:bg-red-50 disabled:opacity-40 transition-colors">
                    강제매도
                </button>
            </div>
        </div>
    )
}

// ── PositionGrid ─────────────────────────────────────────

export function PositionGrid({ positions, handleForceSell }: {
    positions: Position[]
    handleForceSell: (stk_cd: string, stk_nm: string) => void
}) {
    const colDefs = useMemo<ColDef<Position>[]>(() => [
        { headerName: '종목', width: 130, sortable: false,
            valueGetter: (p: ValueGetterParams<Position>) => p.data ? `${p.data.stk_nm || p.data.stk_cd} (${p.data.stk_cd})` : '' },
        { field: 'buy_price', headerName: '매수가', width: 90, type: 'numericColumn',
            valueFormatter: ({ value }: { value: number }) => value.toLocaleString() },
        { field: 'cur_price', headerName: '현재가', width: 90, type: 'numericColumn',
            valueFormatter: ({ value }: { value: number | null }) => value != null ? value.toLocaleString() : '—' },
        { headerName: '평가손익', width: 110, type: 'numericColumn',
            valueGetter: (p: ValueGetterParams<Position>) =>
                p.data?.cur_price != null ? (p.data.cur_price - p.data.buy_price) * p.data.qty : null,
            valueFormatter: ({ value }: { value: number | null }) =>
                value == null ? '—' : `${value >= 0 ? '+' : ''}${value.toLocaleString()}`,
            cellClassRules: {
                'text-red-600': ({ value }: { value: number | null }) => value != null && value >= 0,
                'text-blue-600': ({ value }: { value: number | null }) => value != null && value < 0,
            } },
        { field: 'qty', headerName: '수량', width: 65, type: 'numericColumn' },
        { field: 'base_price', headerName: '기준가', width: 90, type: 'numericColumn',
            valueFormatter: ({ value }: { value: number }) => value.toLocaleString() },
        { field: 'stop_price', headerName: '손절가', width: 90, type: 'numericColumn',
            cellClass: 'text-red-500',
            valueFormatter: ({ value }: { value: number }) => value.toLocaleString() },
        { field: 'stop_rate', headerName: 'Stop%', width: 65, type: 'numericColumn',
            valueFormatter: ({ value }: { value: number }) => `${Math.round(value * 100)}%` },
        { headerName: '강제매도', width: 80, sortable: false,
            cellRenderer: ({ data }: { data: Position }) => (
                <button
                    onClick={() => handleForceSell(data.stk_cd, data.stk_nm)}
                    className="px-1.5 py-0.5 text-xs text-red-600 border border-red-300 rounded hover:bg-red-50 transition-colors">
                    강제매도
                </button>
            ) },
    ], [handleForceSell])

    if (positions.length === 0) return null

    return (
        <div className="bg-white border rounded-lg p-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                현재 포지션
                <span className="ml-2 text-blue-500 font-mono">{positions.length}</span>
            </p>
            <div className="ag-theme-alpine" style={{ height: positions.length * 28 + 32 }}>
                <AgGridReact
                    rowData={positions}
                    columnDefs={colDefs}
                    defaultColDef={{ resizable: true, sortable: true }}
                    headerHeight={28}
                    rowHeight={28}
                    domLayout="normal"
                />
            </div>
        </div>
    )
}

// ── PositionSection ──────────────────────────────────────

export function PositionSection({ positions, tickMap, handleForceSell, forceSellPending }: {
    positions: Position[]
    tickMap: Record<string, TickSnapshot | null>
    handleForceSell: (stk_cd: string, stk_nm: string) => void
    forceSellPending: boolean
}) {
    if (positions.length === 0) return null

    return (
        <div className="bg-white border rounded-lg p-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">포지션 차트</p>
            <div className={`grid gap-3 ${positions.length <= 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
                {positions.map(p => (
                    <PositionCard key={p.id} p={p}
                        tick={tickMap[p.stk_cd] ?? null}
                        onForceSell={() => handleForceSell(p.stk_cd, p.stk_nm)}
                        isPending={forceSellPending} />
                ))}
            </div>
        </div>
    )
}
