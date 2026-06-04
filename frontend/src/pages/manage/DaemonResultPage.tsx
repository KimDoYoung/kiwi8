import { useState, useRef, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import api from '@/lib/api'
import { llmAgent } from '@/services/LlmAgent'

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
    const res = await api.get('/api/v1/kdaemon/logs?limit=50')
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

type Tab = 'positions' | 'by-stock' | 'by-date' | 'history' | 'summary'

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
        { id: 'summary', label: 'AI 요약' },
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
            {tab === 'summary' && (
                <SummaryTab positions={positions} logs={logs} />
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
    const sorted = [...logs].reverse()
    return (
        <div className="overflow-auto max-h-[520px]">
            <Table headers={['시각', '구분', '종목', '가격', '수량', '금액', '손익', '수익률', '메모']}>
                {sorted.map(l => (
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

// ── LLM 요약 탭 ──────────────────────────────────────────

function extractInitialCash(logs: TradeLog[]): number | null {
    for (const l of [...logs].reverse()) {
        if (l.action === 'FIND' && l.memo) {
            const m = l.memo.match(/예수금[=\s]+([\d,]+)원/)
            if (m) return parseInt(m[1].replace(/,/g, ''))
        }
    }
    return null
}

function elapsedStr(dtStr: string): string {
    const start = new Date(dtStr.replace(' ', 'T'))
    const diffMs = Date.now() - start.getTime()
    const mins = Math.floor(diffMs / 60000)
    const hours = Math.floor(mins / 60)
    if (hours > 0) return `${hours}시간 ${mins % 60}분`
    return `${mins}분`
}

function buildPrompt(positions: Position[], logs: TradeLog[]): string {
    const now = new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
    const lines: string[] = []

    // 시작시간 / 경과시간
    const firstBuy = [...logs].reverse().find(l => l.action === 'BUY')
    const startTime = firstBuy?.dt ?? null
    const elapsed = startTime ? elapsedStr(startTime) : null

    // 예수금
    const initialCash = extractInitialCash(logs)
    const heldAmount = positions.reduce((s, p) => s + p.amount, 0)
    const remainingCash = initialCash != null ? initialCash - heldAmount : null

    lines.push(`[kdaemon 자동매매 현황] 조회시각: ${now}`)
    if (startTime) lines.push(`  시작: ${startTime}  경과: ${elapsed}`)
    if (initialCash != null) lines.push(`  초기 예수금: ${initialCash.toLocaleString()}원  추정 잔여: ${(remainingCash ?? 0).toLocaleString()}원`)
    lines.push('')

    lines.push(`■ 현재 포지션 (${positions.length}개)`)
    if (positions.length === 0) {
        lines.push('  - 없음')
    } else {
        for (const p of positions) {
            lines.push(`  - ${p.stk_nm}(${p.stk_cd}): 매수가 ${p.buy_price.toLocaleString()}원, ${p.qty}주, 손절가 ${p.stop_price.toLocaleString()}원`)
        }
    }
    lines.push('')

    const tradeLogs = logs.filter(l => l.action === 'BUY' || l.action === 'SELL')
    lines.push(`■ 매매 이력 (${tradeLogs.length}건)`)
    if (tradeLogs.length === 0) {
        lines.push('  - 없음')
    } else {
        for (const l of [...tradeLogs].reverse()) {
            const nm = l.stk_nm ?? l.stk_cd ?? '?'
            const price = l.price?.toLocaleString() ?? '-'
            const qty = l.qty ?? '-'
            const amount = l.amount?.toLocaleString() ?? '-'
            if (l.action === 'BUY') {
                lines.push(`  - ${l.dt} | 매수 | ${nm} | ${price}원 × ${qty}주 = ${amount}원`)
            } else {
                const sign = (l.profit ?? 0) >= 0 ? '+' : ''
                const profit = l.profit != null ? ` | 손익 ${sign}${l.profit.toLocaleString()}원(${sign}${l.profit_rate ?? 0}%)` : ''
                lines.push(`  - ${l.dt} | 매도 | ${nm} | ${price}원 × ${qty}주 = ${amount}원${profit}`)
            }
        }
    }
    lines.push('')

    const sellLogs = logs.filter(l => l.action === 'SELL')
    const buyLogs = logs.filter(l => l.action === 'BUY')
    const totalProfit = sellLogs.reduce((s, l) => s + (l.profit ?? 0), 0)
    const profitSign = totalProfit >= 0 ? '+' : ''
    lines.push('■ 집계')
    lines.push(`  - 총 매수: ${buyLogs.length}회 / 총 매도: ${sellLogs.length}회`)
    lines.push(`  - 누적 손익: ${profitSign}${totalProfit.toLocaleString()}원`)
    lines.push('')
    lines.push('위 자동매매 수행 결과를 한국어로 간결하게 요약해주세요. 시작시간, 경과시간, 예수금 변화, 수익/손실 현황, 현재 모니터링 상태를 포함해주세요.')

    return lines.join('\n')
}

// 마침표 단위로 줄바꿈 + 금액/비율 색상 처리
function renderSummaryText(text: string) {
    const sentences = text
        .replace(/\.\s+/g, '.\n')
        .split('\n')
        .map(s => s.trim())
        .filter(Boolean)

    return sentences.map((sentence, i) => {
        // 숫자+원 or 숫자+% 패턴 분리
        const parts = sentence.split(/([-+]?[\d,]+원|[-+]?\d+\.?\d*%)/)
        return (
            <p key={i} className="mb-3 leading-relaxed">
                {parts.map((part, j) => {
                    if (/^-[\d,]+원$/.test(part) || /^-\d+\.?\d*%$/.test(part)) {
                        return <span key={j} className="text-blue-600 font-bold">{part}</span>
                    }
                    if (/^\+?[\d,]+원$/.test(part) || /^\+\d+\.?\d*%$/.test(part)) {
                        return <span key={j} className="text-red-600 font-bold">{part}</span>
                    }
                    return <span key={j}>{part}</span>
                })}
            </p>
        )
    })
}

const SYS_PROMPT = '당신은 주식 자동매매 결과를 분석하는 한국어 AI 어시스턴트입니다. 간결하고 친절하게 답변해주세요.'

interface ChatMsg { role: 'user' | 'assistant'; content: string }

function SummaryTab({ positions, logs }: { positions: Position[]; logs: TradeLog[] }) {
    const [messages, setMessages] = useState<ChatMsg[]>([])
    const [input, setInput] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const bottomRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages, loading])

    async function sendMessage(content: string) {
        if (!content.trim() || loading) return
        const next: ChatMsg[] = [...messages, { role: 'user', content }]
        setMessages(next)
        setInput('')
        setLoading(true)
        setError('')
        try {
            const reply = await llmAgent.chat(next, SYS_PROMPT)
            setMessages(prev => [...prev, { role: 'assistant', content: reply }])
        } catch (e) {
            setError('AI 호출 실패: ' + String(e))
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
                <button
                    onClick={() => { setMessages([]); setError(''); sendMessage(buildPrompt(positions, logs)) }}
                    disabled={loading}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                    {loading && messages.length === 0 ? <Loader2 className="w-4 h-4 animate-spin" /> : '🤖'}
                    분석 시작
                </button>
                {messages.length > 0 && (
                    <button
                        onClick={() => { setMessages([]); setError('') }}
                        className="px-3 py-2 text-xs text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50"
                    >
                        대화 초기화
                    </button>
                )}
                <span className="text-xs text-gray-400">Ollama 실행 중이어야 합니다</span>
            </div>

            {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">{error}</div>
            )}

            {messages.length === 0 && !loading && (
                <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg text-gray-400 text-sm">
                    "분석 시작"을 클릭하면 매매 데이터를 AI에 전송합니다. 이후 추가 질문도 가능합니다.
                </div>
            )}

            {(messages.length > 0 || loading) && (
                <div className="border border-gray-200 rounded-lg overflow-auto max-h-[480px] bg-white p-3 space-y-3">
                    {messages.map((m, i) => (
                        <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[85%] px-4 py-3 rounded-2xl text-base leading-relaxed ${
                                m.role === 'user'
                                    ? 'bg-blue-600 text-white text-sm rounded-br-sm'
                                    : 'bg-gray-100 text-gray-800 rounded-bl-sm'
                            }`}>
                                {m.role === 'assistant' ? renderSummaryText(m.content) : m.content}
                            </div>
                        </div>
                    ))}
                    {loading && (
                        <div className="flex justify-start">
                            <div className="bg-gray-100 px-4 py-3 rounded-2xl rounded-bl-sm">
                                <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                            </div>
                        </div>
                    )}
                    <div ref={bottomRef} />
                </div>
            )}

            {messages.length > 0 && (
                <div className="flex gap-2">
                    <input
                        type="text"
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input) } }}
                        placeholder="추가 질문을 입력하세요... (Enter)"
                        disabled={loading}
                        className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300 disabled:opacity-50"
                    />
                    <button
                        onClick={() => sendMessage(input)}
                        disabled={loading || !input.trim()}
                        className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-colors"
                    >
                        전송
                    </button>
                </div>
            )}
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
