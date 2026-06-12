import { useState, useRef, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import api from '@/lib/api'
import { llmAgent } from '@/services/LlmAgent'

// ── 타입 ──────────────────────────────────────────────────

interface TradeResult {
    id: number
    stk_cd: string
    stk_nm: string
    buy_price: number
    qty: number
    buy_amount: number
    buy_fee: number
    buy_strategy: string
    buy_order_no: string | null
    bought_at: string
    sell_price: number | null
    sell_amount: number | null
    sell_fee: number | null
    sell_reason: string | null
    sell_order_no: string | null
    sold_at: string | null
    profit: number | null
    profit_net: number | null
    profit_rate: number | null
    dry_run: number
    deposit_after: number | null
}

async function fetchResults(): Promise<TradeResult[]> {
    const res = await api.get('/api/v1/kdaemon/results')
    return res.data
}

// ── 포맷 헬퍼 ─────────────────────────────────────────────

function fmtMoney(v: number | null) {
    if (v == null) return '-'
    return (v >= 0 ? '+' : '') + v.toLocaleString('ko-KR') + '원'
}

function fmtRate(v: number | null) {
    if (v == null) return '-'
    return (v >= 0 ? '+' : '') + v.toFixed(2) + '%'
}

function colorProfit(v: number | null) {
    if (v == null) return 'text-gray-400'
    return v > 0 ? 'text-red-600' : v < 0 ? 'text-blue-600' : 'text-gray-500'
}

const REASON_KR: Record<string, string> = {
    signal_a: '호가압력(A)',
    signal_b: '체결강도(B)',
    signal_c: '거래량(C)',
    trailing_stop: '트레일링손절',
    manual: '수동',
}

// ── 컴포넌트 ──────────────────────────────────────────────

type Tab = 'results' | 'summary'

export default function DaemonResultPage() {
    const [tab, setTab] = useState<Tab>('results')

    const { data: results = [], isLoading } = useQuery({
        queryKey: ['kdaemonResults'],
        queryFn: fetchResults,
        refetchInterval: 15_000,
    })

    const closed = results.filter(r => r.sold_at != null)
    const open = results.filter(r => r.sold_at == null)
    const totalNet = closed.reduce((s, r) => s + (r.profit_net ?? 0), 0)
    const wins = closed.filter(r => (r.profit_net ?? 0) > 0).length
    const winRate = closed.length > 0 ? Math.round(wins / closed.length * 100) : 0

    const tabs: { id: Tab; label: string }[] = [
        { id: 'results', label: `자동매매 결과 (${results.length})` },
        { id: 'summary', label: 'AI 요약' },
    ]

    return (
        <div className="p-4 space-y-4 text-sm text-gray-800 bg-white min-h-full">
            {/* 요약 카드 */}
            <div className="grid grid-cols-4 gap-3">
                <SummaryCard label="보유 중" value={`${open.length}종목`} />
                <SummaryCard label="완료 거래" value={`${closed.length}건`} />
                <SummaryCard label="승률" value={closed.length > 0 ? `${winRate}%` : '-'} />
                <SummaryCard
                    label="누적 실수익"
                    value={totalNet !== 0 ? fmtMoney(totalNet) : '0원'}
                    valueClass={colorProfit(totalNet)}
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

            {isLoading && (
                <div className="text-gray-400 text-center py-8">로딩 중...</div>
            )}

            {!isLoading && tab === 'results' && (
                <ResultsTab results={results} />
            )}
            {tab === 'summary' && (
                <SummaryTab results={results} />
            )}
        </div>
    )
}

// ── 자동매매 결과 탭 ──────────────────────────────────────

function ResultsTab({ results }: { results: TradeResult[] }) {
    const [stkQuery, setStkQuery] = useState('')
    const [dateFrom, setDateFrom] = useState('')
    const [dateTo, setDateTo] = useState('')

    const filtered = results.filter(r => {
        if (stkQuery) {
            const q = stkQuery.trim().toLowerCase()
            if (!r.stk_nm.toLowerCase().includes(q) && !r.stk_cd.includes(q)) return false
        }
        if (dateFrom && r.bought_at < dateFrom) return false
        if (dateTo   && r.bought_at > dateTo + ' 23:59:59') return false
        return true
    })

    const reset = () => { setStkQuery(''); setDateFrom(''); setDateTo('') }
    const hasFilter = stkQuery || dateFrom || dateTo

    if (results.length === 0) {
        return <Empty msg="자동매매 이력 없음" />
    }
    return (
        <div className="space-y-2">
            {/* 검색 조건 */}
            <div className="flex flex-wrap items-center gap-2 px-1">
                <input
                    value={stkQuery}
                    onChange={e => setStkQuery(e.target.value)}
                    placeholder="종목명 / 코드"
                    className="border rounded px-2 py-1 text-xs w-32 focus:outline-none focus:ring-1 focus:ring-blue-400"
                />
                <span className="text-xs text-gray-400">매수일</span>
                <input
                    type="date"
                    value={dateFrom}
                    onChange={e => setDateFrom(e.target.value)}
                    className="border rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                />
                <span className="text-xs text-gray-400">~</span>
                <input
                    type="date"
                    value={dateTo}
                    onChange={e => setDateTo(e.target.value)}
                    className="border rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                />
                {hasFilter && (
                    <button onClick={reset} className="text-xs text-gray-400 hover:text-red-500 transition-colors px-1.5 py-1 rounded hover:bg-red-50">
                        초기화
                    </button>
                )}
                <span className="text-xs text-gray-400 ml-auto">{filtered.length} / {results.length}건</span>
            </div>

            <div className="overflow-auto max-h-[540px]">
                {filtered.length === 0 ? (
                    <Empty msg="검색 결과 없음" />
                ) : (
                    <Table headers={[
                        '종목명', '매수가', '매도가', '수량', '매수금액', '매도금액',
                        '매수수수료', '매도수수료', '실수익', '수익률', '매수전략', '매도이유',
                        '매수일시', '매도일시',
                    ]}>
                        {filtered.map(r => {
                            const open = r.sold_at == null
                            const rowCls = open
                                ? 'border-b border-gray-100 bg-yellow-50 hover:bg-yellow-100'
                                : 'border-b border-gray-100 hover:bg-blue-50'
                            return (
                                <tr key={r.id} className={rowCls}>
                                    <Td cls="font-medium whitespace-nowrap">
                                        {r.stk_nm}
                                        {open && <span className="ml-1 text-[10px] text-yellow-600 font-bold">보유중</span>}
                                        {r.dry_run === 1 && <span className="ml-1 text-[10px] text-gray-400">DRY</span>}
                                    </Td>
                                    <Td>{r.buy_price.toLocaleString()}</Td>
                                    <Td>{r.sell_price?.toLocaleString() ?? '-'}</Td>
                                    <Td>{r.qty.toLocaleString()}</Td>
                                    <Td>{r.buy_amount.toLocaleString()}</Td>
                                    <Td>{r.sell_amount?.toLocaleString() ?? '-'}</Td>
                                    <Td cls="text-gray-400">{r.buy_fee.toLocaleString()}</Td>
                                    <Td cls="text-gray-400">{r.sell_fee?.toLocaleString() ?? '-'}</Td>
                                    <Td cls={colorProfit(r.profit_net)}>{fmtMoney(r.profit_net)}</Td>
                                    <Td cls={colorProfit(r.profit_rate)}>{fmtRate(r.profit_rate)}</Td>
                                    <Td cls="text-gray-500">{r.buy_strategy}</Td>
                                    <Td cls="text-gray-500">{r.sell_reason ? (REASON_KR[r.sell_reason] ?? r.sell_reason) : '-'}</Td>
                                    <Td cls="text-gray-400 whitespace-nowrap">{r.bought_at}</Td>
                                    <Td cls="text-gray-400 whitespace-nowrap">{r.sold_at ?? '-'}</Td>
                                </tr>
                            )
                        })}
                    </Table>
                )}
            </div>
        </div>
    )
}

// ── AI 요약 탭 ────────────────────────────────────────────

function buildPrompt(results: TradeResult[]): string {
    const now = new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
    const closed = results.filter(r => r.sold_at != null)
    const open = results.filter(r => r.sold_at == null)
    const totalNet = closed.reduce((s, r) => s + (r.profit_net ?? 0), 0)
    const wins = closed.filter(r => (r.profit_net ?? 0) > 0).length

    const lines: string[] = []
    lines.push(`[kdaemon 자동매매 결과] 조회시각: ${now}`)
    lines.push(`  완료: ${closed.length}건  승률: ${closed.length > 0 ? Math.round(wins / closed.length * 100) : 0}%  누적 실수익: ${totalNet.toLocaleString()}원`)
    lines.push('')

    if (open.length > 0) {
        lines.push(`■ 보유 중 (${open.length}종목)`)
        for (const r of open) {
            lines.push(`  - ${r.stk_nm}(${r.stk_cd}): 매수가 ${r.buy_price.toLocaleString()}원 ${r.qty}주 / ${r.buy_strategy}`)
        }
        lines.push('')
    }

    if (closed.length > 0) {
        lines.push(`■ 완료 거래 (${closed.length}건)`)
        for (const r of closed) {
            const sign = (r.profit_net ?? 0) >= 0 ? '+' : ''
            lines.push(
                `  - ${r.stk_nm}(${r.stk_cd}): ${r.buy_price.toLocaleString()}→${r.sell_price?.toLocaleString()}원 ` +
                `${sign}${(r.profit_net ?? 0).toLocaleString()}원(${sign}${r.profit_rate?.toFixed(2)}%) ` +
                `매도이유: ${REASON_KR[r.sell_reason ?? ''] ?? r.sell_reason ?? '-'}`
            )
        }
        lines.push('')
    }

    lines.push('위 자동매매 결과를 한국어로 간결하게 요약해주세요. 수익/손실 현황, 매도 이유 패턴, 전략 효과를 포함해주세요.')
    return lines.join('\n')
}

function renderSummaryText(text: string) {
    const sentences = text
        .replace(/\.\s+/g, '.\n')
        .split('\n')
        .map(s => s.trim())
        .filter(Boolean)

    return sentences.map((sentence, i) => {
        const parts = sentence.split(/([-+]?[\d,]+원|[-+]?\d+\.?\d*%)/)
        return (
            <p key={i} className="mb-3 leading-relaxed">
                {parts.map((part, j) => {
                    if (/^-[\d,]+원$/.test(part) || /^-\d+\.?\d*%$/.test(part))
                        return <span key={j} className="text-blue-600 font-bold">{part}</span>
                    if (/^\+?[\d,]+원$/.test(part) || /^\+\d+\.?\d*%$/.test(part))
                        return <span key={j} className="text-red-600 font-bold">{part}</span>
                    return <span key={j}>{part}</span>
                })}
            </p>
        )
    })
}

const SYS_PROMPT = '당신은 주식 자동매매 결과를 분석하는 한국어 AI 어시스턴트입니다. 간결하고 친절하게 답변해주세요.'

interface ChatMsg { role: 'user' | 'assistant'; content: string }

function SummaryTab({ results }: { results: TradeResult[] }) {
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
                    onClick={() => { setMessages([]); setError(''); sendMessage(buildPrompt(results)) }}
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
