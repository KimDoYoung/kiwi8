import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import api from '@/lib/api'

// ── API ───────────────────────────────────────────────────

interface Position {
    id: number
    stk_cd: string
    stk_nm: string
    buy_price: number
    qty: number
    amount: number
    base_price: number
    stop_price: number
    stop_rate: number
    bought_at: string
    updated_at: string
}

interface TradeLog {
    id: number
    dt: string
    action: string
    stk_cd: string | null
    stk_nm: string | null
    price: number | null
    qty: number | null
    amount: number | null
    profit: number | null
    profit_rate: number | null
    sell_reason: string | null
    order_no: string | null
    memo: string | null
}

async function fetchPositions(): Promise<Position[]> {
    const res = await api.get('/api/v1/kdaemon/positions')
    return res.data
}

async function fetchLogs(): Promise<TradeLog[]> {
    const res = await api.get('/api/v1/kdaemon/logs?limit=500')
    return res.data
}

// ── 집계 헬퍼 ─────────────────────────────────────────────

function fmtMoney(v: number) {
    return v.toLocaleString('ko-KR') + '원'
}

function fmtRate(v: number) {
    const sign = v >= 0 ? '+' : ''
    return sign + v.toFixed(2) + '%'
}

function colorProfit(v: number) {
    return v > 0 ? 'text-red-600' : v < 0 ? 'text-blue-600' : 'text-gray-500'
}

interface StockStat {
    stk_cd: string
    stk_nm: string
    trades: number
    total_profit: number
    avg_rate: number
}

interface DayStat {
    date: string
    trades: number
    total_profit: number
}

function calcStockStats(logs: TradeLog[]): StockStat[] {
    const map = new Map<string, StockStat>()
    for (const l of logs) {
        if (l.action !== 'SELL' || !l.stk_cd) continue
        const key = l.stk_cd
        const cur = map.get(key) ?? { stk_cd: l.stk_cd, stk_nm: l.stk_nm ?? l.stk_cd, trades: 0, total_profit: 0, avg_rate: 0 }
        cur.trades += 1
        cur.total_profit += l.profit ?? 0
        cur.avg_rate += l.profit_rate ?? 0
        map.set(key, cur)
    }
    return Array.from(map.values()).map(s => ({ ...s, avg_rate: s.trades ? s.avg_rate / s.trades : 0 }))
        .sort((a, b) => b.total_profit - a.total_profit)
}

function calcDayStats(logs: TradeLog[]): DayStat[] {
    const map = new Map<string, DayStat>()
    for (const l of logs) {
        if (l.action !== 'SELL') continue
        const date = (l.dt ?? '').slice(0, 10)
        const cur = map.get(date) ?? { date, trades: 0, total_profit: 0 }
        cur.trades += 1
        cur.total_profit += l.profit ?? 0
        map.set(date, cur)
    }
    return Array.from(map.values()).sort((a, b) => b.date.localeCompare(a.date))
}

// ── 컴포넌트 ──────────────────────────────────────────────

type Tab = 'positions' | 'by-stock' | 'by-date' | 'history'

export default function DaemonResultPage() {
    const [tab, setTab] = useState<Tab>('positions')

    const { data: positions = [], isLoading: posLoading } = useQuery({
        queryKey: ['kdaemonPositions'],
        queryFn: fetchPositions,
        refetchInterval: 10_000,
    })

    const { data: logs = [], isLoading: logLoading } = useQuery({
        queryKey: ['kdaemonLogs'],
        queryFn: fetchLogs,
        refetchInterval: 15_000,
    })

    const sellLogs = logs.filter(l => l.action === 'SELL')
    const totalProfit = sellLogs.reduce((s, l) => s + (l.profit ?? 0), 0)
    const buyLogs = logs.filter(l => l.action === 'BUY')

    const stockStats = calcStockStats(logs)
    const dayStats = calcDayStats(logs)

    const tabs: { id: Tab; label: string }[] = [
        { id: 'positions', label: `포지션 현황 (${positions.length})` },
        { id: 'by-stock', label: '종목별 손익' },
        { id: 'by-date', label: '기간별 손익' },
        { id: 'history', label: `전체 이력 (${logs.length})` },
    ]

    return (
        <div className="p-4 space-y-4 text-sm text-gray-800 bg-white min-h-full">
            {/* 요약 카드 */}
            <div className="grid grid-cols-4 gap-3">
                <SummaryCard label="현재 포지션" value={`${positions.length}종목`} />
                <SummaryCard label="총 매수" value={`${buyLogs.length}회`} />
                <SummaryCard label="총 매도" value={`${sellLogs.length}회`} />
                <SummaryCard
                    label="누적 손익"
                    value={fmtMoney(totalProfit)}
                    valueClass={colorProfit(totalProfit)}
                />
            </div>

            {/* 탭 */}
            <div className="flex gap-1 border-b border-gray-200">
                {tabs.map(t => (
                    <button
                        key={t.id}
                        onClick={() => setTab(t.id)}
                        className={`px-4 py-2 text-xs font-medium rounded-t transition-colors ${
                            tab === t.id
                                ? 'bg-white text-blue-600 border-b-2 border-blue-500'
                                : 'text-gray-500 hover:text-gray-700'
                        }`}
                    >
                        {t.label}
                    </button>
                ))}
            </div>

            {/* 탭 컨텐츠 */}
            {(posLoading || logLoading) && (
                <div className="text-gray-400 text-center py-8">로딩 중...</div>
            )}

            {!posLoading && !logLoading && tab === 'positions' && (
                <PositionsTab positions={positions} />
            )}
            {!logLoading && tab === 'by-stock' && (
                <StockTab stats={stockStats} />
            )}
            {!logLoading && tab === 'by-date' && (
                <DateTab stats={dayStats} />
            )}
            {!logLoading && tab === 'history' && (
                <HistoryTab logs={logs} />
            )}
        </div>
    )
}

// ── 요약 카드 ─────────────────────────────────────────────

function SummaryCard({ label, value, valueClass = 'text-gray-900' }: {
    label: string; value: string; valueClass?: string
}) {
    return (
        <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
            <div className="text-gray-500 text-xs mb-1">{label}</div>
            <div className={`text-lg font-bold ${valueClass}`}>{value}</div>
        </div>
    )
}

// ── 포지션 현황 탭 ────────────────────────────────────────

function PositionsTab({ positions }: { positions: Position[] }) {
    if (positions.length === 0) {
        return <Empty msg="보유 포지션 없음" />
    }
    return (
        <Table headers={['종목코드', '종목명', '매수가', '수량', '투입금액', '기준가', '손절가', '비율', '매수일시']}>
            {positions.map(p => (
                <tr key={p.id} className="border-b border-gray-100 hover:bg-blue-50">
                    <Td>{p.stk_cd}</Td>
                    <Td cls="font-medium">{p.stk_nm}</Td>
                    <Td>{p.buy_price.toLocaleString()}</Td>
                    <Td>{p.qty.toLocaleString()}</Td>
                    <Td>{p.amount.toLocaleString()}</Td>
                    <Td>{p.base_price.toLocaleString()}</Td>
                    <Td cls="text-orange-600 font-medium">{p.stop_price.toLocaleString()}</Td>
                    <Td>{(p.stop_rate * 100).toFixed(1)}%</Td>
                    <Td cls="text-gray-400">{p.bought_at}</Td>
                </tr>
            ))}
        </Table>
    )
}

// ── 종목별 손익 탭 ────────────────────────────────────────

function StockTab({ stats }: { stats: StockStat[] }) {
    if (stats.length === 0) {
        return <Empty msg="매도 이력 없음" />
    }
    return (
        <Table headers={['종목코드', '종목명', '매도횟수', '누적 손익', '평균 수익률']}>
            {stats.map(s => (
                <tr key={s.stk_cd} className="border-b border-gray-100 hover:bg-blue-50">
                    <Td>{s.stk_cd}</Td>
                    <Td cls="font-medium">{s.stk_nm}</Td>
                    <Td>{s.trades}회</Td>
                    <Td cls={colorProfit(s.total_profit)}>{fmtMoney(s.total_profit)}</Td>
                    <Td cls={colorProfit(s.avg_rate)}>{fmtRate(s.avg_rate)}</Td>
                </tr>
            ))}
        </Table>
    )
}

// ── 기간별 손익 탭 ────────────────────────────────────────

function DateTab({ stats }: { stats: DayStat[] }) {
    if (stats.length === 0) {
        return <Empty msg="매도 이력 없음" />
    }
    return (
        <Table headers={['날짜', '매도횟수', '일별 손익']}>
            {stats.map(s => (
                <tr key={s.date} className="border-b border-gray-100 hover:bg-blue-50">
                    <Td>{s.date}</Td>
                    <Td>{s.trades}회</Td>
                    <Td cls={colorProfit(s.total_profit)}>{fmtMoney(s.total_profit)}</Td>
                </tr>
            ))}
        </Table>
    )
}

// ── 전체 이력 탭 ──────────────────────────────────────────

const ACTION_COLOR: Record<string, string> = {
    BUY: 'text-red-600 font-medium',
    SELL: 'text-blue-600 font-medium',
    FIND: 'text-gray-400',
    ERROR: 'text-orange-500',
}

function HistoryTab({ logs }: { logs: TradeLog[] }) {
    if (logs.length === 0) {
        return <Empty msg="이력 없음" />
    }
    return (
        <div className="overflow-auto max-h-[520px]">
            <Table headers={['시각', '구분', '종목', '가격', '수량', '금액', '손익', '수익률', '메모']}>
                {logs.map(l => (
                    <tr key={l.id} className="border-b border-gray-100 hover:bg-blue-50 text-xs">
                        <Td cls="text-gray-400 whitespace-nowrap">{l.dt}</Td>
                        <Td cls={ACTION_COLOR[l.action] ?? 'text-gray-600'}>{l.action}</Td>
                        <Td cls="font-medium">{l.stk_nm ?? l.stk_cd ?? '-'}</Td>
                        <Td>{l.price?.toLocaleString() ?? '-'}</Td>
                        <Td>{l.qty?.toLocaleString() ?? '-'}</Td>
                        <Td>{l.amount?.toLocaleString() ?? '-'}</Td>
                        <Td cls={l.profit != null ? colorProfit(l.profit) : ''}>
                            {l.profit != null ? fmtMoney(l.profit) : '-'}
                        </Td>
                        <Td cls={l.profit_rate != null ? colorProfit(l.profit_rate) : ''}>
                            {l.profit_rate != null ? fmtRate(l.profit_rate) : '-'}
                        </Td>
                        <Td cls="text-gray-400 max-w-[200px] truncate">{l.memo ?? '-'}</Td>
                    </tr>
                ))}
            </Table>
        </div>
    )
}

// ── 공통 UI ───────────────────────────────────────────────

function Empty({ msg }: { msg: string }) {
    return <div className="text-center text-gray-400 py-12">{msg}</div>
}

function Table({ headers, children }: { headers: string[]; children: React.ReactNode }) {
    return (
        <div className="overflow-auto rounded-lg border border-gray-200">
            <table className="w-full text-xs border-collapse">
                <thead>
                    <tr className="bg-gray-100 text-gray-600">
                        {headers.map(h => (
                            <th key={h} className="px-3 py-2 text-left font-medium whitespace-nowrap border-b border-gray-200">{h}</th>
                        ))}
                    </tr>
                </thead>
                <tbody className="bg-white">{children}</tbody>
            </table>
        </div>
    )
}

function Td({ children, cls = '' }: { children: React.ReactNode; cls?: string }) {
    return <td className={`px-3 py-2 text-gray-700 ${cls}`}>{children}</td>
}
