import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Play, Square, RefreshCcw, Plus, Trash2, Pencil, Check, X } from 'lucide-react'
import api from '@/lib/api'
import { useWsStore, type KdaemonEvent } from '@/store/wsStore'

// ── API ────────────────────────────────────────────────────

async function fetchStatus() {
    const res = await api.get('/api/v1/kdemon/status')
    return res.data as { status: string; updated_at: string | null }
}
async function sendCommand(cmd: 'start' | 'stop') {
    const res = await api.post('/api/v1/kdemon/command', { cmd })
    return res.data
}

interface Strategy {
    id: number
    name: string
    broker: string
    condition_seq: string
    buy_start: string
    buy_end: string
    max_positions: number
    stop_rate: number
    is_active: number
}
const emptyForm = (): Omit<Strategy, 'id'> => ({
    name: '', broker: 'kiwoom', condition_seq: '',
    buy_start: '09:05', buy_end: '10:30',
    max_positions: 3, stop_rate: 0.05, is_active: 1,
})

async function fetchStrategies(): Promise<Strategy[]> {
    const res = await api.get('/api/v1/kdemon/strategies')
    return res.data
}

// ── 직접 매수 큐 ───────────────────────────────────────

async function fetchManualStocks(): Promise<string[]> {
    const res = await api.get('/api/v1/kdemon/manual-stocks')
    return res.data.lines ?? []
}
async function saveManualStocks(lines: string[]) {
    const res = await api.put('/api/v1/kdemon/manual-stocks', { lines })
    return res.data
}

// ── 포지션 / 로그 ──────────────────────────────────────

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
    const res = await api.get('/api/v1/kdemon/positions')
    return res.data
}
async function fetchLogs(): Promise<TradeLog[]> {
    const res = await api.get('/api/v1/kdemon/logs?limit=50')
    return res.data
}
async function createStrategy(body: Omit<Strategy, 'id'>) {
    const res = await api.post('/api/v1/kdemon/strategies', body)
    return res.data
}
async function updateStrategy({ id, ...body }: Strategy) {
    const res = await api.put(`/api/v1/kdemon/strategies/${id}`, body)
    return res.data
}
async function deleteStrategy(id: number) {
    const res = await api.delete(`/api/v1/kdemon/strategies/${id}`)
    return res.data
}

// ── Component ──────────────────────────────────────────────

export default function DaemonPage() {
    const queryClient = useQueryClient()
    const kdaemonEvents = useWsStore(s => s.kdaemonEvents)
    const feedRef = useRef<HTMLDivElement>(null)
    const [showEvents, setShowEvents] = useState(true)
    const [editingId, setEditingId] = useState<number | null>(null)
    const [addingNew, setAddingNew] = useState(false)
    const [form, setForm] = useState<Omit<Strategy, 'id'>>(emptyForm())
    const [editForm, setEditForm] = useState<Strategy | null>(null)
    const [newCode, setNewCode] = useState('')

    useEffect(() => {
        if (showEvents && feedRef.current) {
            feedRef.current.scrollTop = feedRef.current.scrollHeight
        }
    }, [kdaemonEvents, showEvents])

    // ── 데몬 상태 ──
    const { data: statusData, isLoading: statusLoading } = useQuery({
        queryKey: ['kdemonStatus'], queryFn: fetchStatus, refetchInterval: 5000,
    })
    const cmdMutation = useMutation({
        mutationFn: sendCommand,
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['kdemonStatus'] }),
    })
    const isRunning = statusData?.status === 'running'

    // ── 전략 목록 ──
    const { data: strategies = [] } = useQuery({
        queryKey: ['kdemonStrategies'], queryFn: fetchStrategies,
    })
    const createMut = useMutation({
        mutationFn: createStrategy,
        onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['kdemonStrategies'] }); setAddingNew(false); setForm(emptyForm()) },
    })
    const updateMut = useMutation({
        mutationFn: updateStrategy,
        onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['kdemonStrategies'] }); setEditingId(null) },
    })
    const deleteMut = useMutation({
        mutationFn: deleteStrategy,
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['kdemonStrategies'] }),
    })

    // ── 직접 매수 큐 ──
    const { data: manualLines = [], refetch: refetchManual } = useQuery({
        queryKey: ['kdemonManualStocks'], queryFn: fetchManualStocks, refetchInterval: 10000,
    })
    const saveMut = useMutation({
        mutationFn: saveManualStocks,
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['kdemonManualStocks'] }),
    })

    // ── 포지션 / 로그 ──
    const { data: positions = [] } = useQuery({
        queryKey: ['kdemonPositions'], queryFn: fetchPositions, refetchInterval: 30000,
    })
    const { data: tradeLogs = [] } = useQuery({
        queryKey: ['kdemonLogs'], queryFn: fetchLogs, refetchInterval: 60000,
    })

    // WS 이벤트 수신 시 positions/logs 자동 갱신
    const prevEvLen = useRef(0)
    useEffect(() => {
        if (kdaemonEvents.length !== prevEvLen.current) {
            prevEvLen.current = kdaemonEvents.length
            queryClient.invalidateQueries({ queryKey: ['kdemonPositions'] })
            queryClient.invalidateQueries({ queryKey: ['kdemonLogs'] })
            queryClient.invalidateQueries({ queryKey: ['kdemonManualStocks'] })
        }
    }, [kdaemonEvents, queryClient])

    const addCode = () => {
        const code = newCode.trim()
        if (!code || manualLines.includes(code)) return
        const next = [...manualLines, code]
        setNewCode('')
        saveMut.mutate(next)
    }
    const removeCode = (code: string) => saveMut.mutate(manualLines.filter(l => l !== code))

    const startEdit = (s: Strategy) => { setEditingId(s.id); setEditForm({ ...s }) }
    const cancelEdit = () => { setEditingId(null); setEditForm(null) }

    return (
        <div className="flex flex-col h-full p-4 gap-4 overflow-auto text-sm">

            {/* ── 데몬 컨트롤 (full width) ── */}
            <div className="flex items-center gap-4 bg-white border rounded-lg px-4 py-3">
                <div className="flex items-center gap-2 border rounded-md px-3 py-1.5 bg-gray-50">
                    <span className={`w-2.5 h-2.5 rounded-full ${statusLoading ? 'bg-gray-300' : isRunning ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} />
                    <span className="font-medium">{statusLoading ? '...' : isRunning ? '실행 중' : '정지'}</span>
                    {statusData?.updated_at && <span className="text-xs text-gray-400 ml-1">{statusData.updated_at}</span>}
                </div>
                <button onClick={() => cmdMutation.mutate('start')} disabled={cmdMutation.isPending || isRunning}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium bg-green-600 text-white hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                    <Play className="w-3.5 h-3.5" /> 시작
                </button>
                <button onClick={() => cmdMutation.mutate('stop')} disabled={cmdMutation.isPending || !isRunning}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium bg-red-600 text-white hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                    <Square className="w-3.5 h-3.5" /> 정지
                </button>
                <button onClick={() => queryClient.invalidateQueries({ queryKey: ['kdemonStatus'] })}
                    className="p-1.5 text-gray-500 hover:bg-gray-100 rounded-md transition-colors">
                    <RefreshCcw className="w-4 h-4" />
                </button>
                <label className="flex items-center gap-2 ml-auto cursor-pointer select-none text-gray-600">
                    <input type="checkbox" checked={showEvents} onChange={e => setShowEvents(e.target.checked)}
                        className="w-4 h-4 accent-blue-600" />
                    이벤트 보기
                </label>
            </div>

            {/* ── 2-column grid ── */}
            <div className="grid grid-cols-2 gap-4">

                {/* LEFT: 직접 매수 큐 + 현재 포지션 */}
                <div className="flex flex-col gap-4">

                    {/* 직접 매수 큐 */}
                    <div className="bg-white border rounded-lg p-3">
                        <div className="flex items-center justify-between mb-2">
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                                직접 매수 큐
                                {manualLines.length > 0 && <span className="ml-2 text-orange-500 font-mono">{manualLines.length}</span>}
                            </p>
                            <button onClick={() => refetchManual()} className="p-1 text-gray-400 hover:bg-gray-100 rounded transition-colors">
                                <RefreshCcw className="w-3.5 h-3.5" />
                            </button>
                        </div>
                        <div className="flex flex-wrap gap-1.5 mb-2 min-h-[24px]">
                            {manualLines.map(code => (
                                <span key={code} className="flex items-center gap-1 px-2 py-0.5 bg-orange-50 border border-orange-200 rounded text-xs font-mono text-orange-700">
                                    {code}
                                    <button onClick={() => removeCode(code)} className="text-orange-400 hover:text-orange-700">
                                        <X className="w-3 h-3" />
                                    </button>
                                </span>
                            ))}
                            {manualLines.length === 0 && <span className="text-xs text-gray-400">큐 비어있음</span>}
                        </div>
                        <div className="flex gap-1.5">
                            <input
                                value={newCode}
                                onChange={e => setNewCode(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && addCode()}
                                placeholder="종목코드 (예: 005930)"
                                className="flex-1 border rounded px-2 py-1 text-xs font-mono"
                            />
                            <button onClick={addCode} disabled={saveMut.isPending}
                                className="flex items-center gap-1 px-2.5 py-1 rounded text-xs bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-40 transition-colors">
                                <Plus className="w-3.5 h-3.5" /> 추가
                            </button>
                        </div>
                    </div>

                    {/* 현재 포지션 */}
                    <div className="bg-white border rounded-lg p-3">
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                            현재 포지션
                            {positions.length > 0 && <span className="ml-2 text-blue-500 font-mono">{positions.length}</span>}
                        </p>
                        {positions.length === 0 ? (
                            <p className="text-xs text-gray-400 py-2 text-center">보유 포지션 없음</p>
                        ) : (
                            <div className="overflow-auto">
                                <table className="w-full text-xs border-collapse">
                                    <thead>
                                        <tr className="bg-gray-50 border-b border-gray-200">
                                            <th className="px-2 py-1.5 text-left text-gray-500 font-semibold">종목</th>
                                            <th className="px-2 py-1.5 text-right text-gray-500 font-semibold">매수가</th>
                                            <th className="px-2 py-1.5 text-right text-gray-500 font-semibold">수량</th>
                                            <th className="px-2 py-1.5 text-right text-gray-500 font-semibold">기준가</th>
                                            <th className="px-2 py-1.5 text-right text-gray-500 font-semibold">손절가</th>
                                            <th className="px-2 py-1.5 text-center text-gray-500 font-semibold">Stop%</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {positions.map(p => (
                                            <tr key={p.id} className="hover:bg-gray-50">
                                                <td className="px-2 py-1.5">
                                                    <span className="font-medium">{p.stk_nm || p.stk_cd}</span>
                                                    <span className="text-gray-400 ml-1 text-xs">({p.stk_cd})</span>
                                                </td>
                                                <td className="px-2 py-1.5 text-right font-mono">{p.buy_price.toLocaleString()}</td>
                                                <td className="px-2 py-1.5 text-right">{p.qty}</td>
                                                <td className="px-2 py-1.5 text-right font-mono">{p.base_price.toLocaleString()}</td>
                                                <td className="px-2 py-1.5 text-right font-mono text-red-600">{p.stop_price.toLocaleString()}</td>
                                                <td className="px-2 py-1.5 text-center">{Math.round(p.stop_rate * 100)}%</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>

                </div>

                {/* RIGHT: 실시간 이벤트 + 매매 이력 */}
                <div className="flex flex-col gap-4">

                    {/* 실시간 이벤트 */}
                    <div className="bg-white border rounded-lg p-3">
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                            실시간 이벤트
                            {kdaemonEvents.length > 0 && <span className="ml-2 text-blue-500 font-mono">{kdaemonEvents.length}</span>}
                        </p>
                        {!showEvents || kdaemonEvents.length === 0 ? (
                            <p className="text-xs text-gray-400 py-3 text-center">
                                {showEvents ? '이벤트 없음' : '이벤트 보기 비활성'}
                            </p>
                        ) : (
                            <div ref={feedRef} className="space-y-1 max-h-48 overflow-auto">
                                {[...kdaemonEvents].reverse().slice(0, 10).map((ev, i) => <EventRow key={i} ev={ev} />)}
                            </div>
                        )}
                    </div>

                    {/* 매매 이력 */}
                    <div className="bg-white border rounded-lg p-3">
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">매매 이력 (최근 50건)</p>
                        {tradeLogs.length === 0 ? (
                            <p className="text-xs text-gray-400 py-2 text-center">이력 없음</p>
                        ) : (
                            <div className="overflow-auto max-h-64">
                                <table className="w-full text-xs border-collapse">
                                    <thead>
                                        <tr className="bg-gray-50 border-b border-gray-200">
                                            <th className="px-2 py-1.5 text-left text-gray-500 font-semibold">시각</th>
                                            <th className="px-2 py-1.5 text-left text-gray-500 font-semibold">구분</th>
                                            <th className="px-2 py-1.5 text-left text-gray-500 font-semibold">종목</th>
                                            <th className="px-2 py-1.5 text-right text-gray-500 font-semibold">가격</th>
                                            <th className="px-2 py-1.5 text-right text-gray-500 font-semibold">손익</th>
                                            <th className="px-2 py-1.5 text-left text-gray-500 font-semibold">사유</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {tradeLogs.map(log => {
                                            const actionCls: Record<string, string> = {
                                                BUY: 'text-red-600 font-bold', SELL: 'text-blue-600 font-bold',
                                                ERROR: 'text-yellow-600 font-bold', FIND: 'text-gray-500',
                                            }
                                            return (
                                                <tr key={log.id} className="hover:bg-gray-50">
                                                    <td className="px-2 py-1 font-mono text-gray-400">{log.dt}</td>
                                                    <td className={`px-2 py-1 ${actionCls[log.action] ?? 'text-gray-600'}`}>{log.action}</td>
                                                    <td className="px-2 py-1">{log.stk_nm || log.stk_cd || '-'}</td>
                                                    <td className="px-2 py-1 text-right font-mono">{log.price != null ? log.price.toLocaleString() : '-'}</td>
                                                    <td className={`px-2 py-1 text-right font-mono ${log.profit != null ? (log.profit >= 0 ? 'text-red-600' : 'text-blue-600') : ''}`}>
                                                        {log.profit != null ? `${log.profit >= 0 ? '+' : ''}${log.profit.toLocaleString()}` : '-'}
                                                        {log.profit_rate != null && <span className="text-gray-400 ml-1">({log.profit_rate}%)</span>}
                                                    </td>
                                                    <td className="px-2 py-1 text-gray-400">{log.sell_reason ?? log.memo ?? ''}</td>
                                                </tr>
                                            )
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>

                </div>
            </div>

            {/* ── 매수 전략 (full width) ── */}
            <div className="bg-white border rounded-lg p-3">
                <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">매수 전략</p>
                    <button onClick={() => { setAddingNew(true); setForm(emptyForm()) }}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs bg-blue-600 text-white hover:bg-blue-700 transition-colors">
                        <Plus className="w-3.5 h-3.5" /> 추가
                    </button>
                </div>
                <div className="overflow-auto">
                    <table className="w-full text-xs border-collapse">
                        <thead>
                            <tr className="bg-gray-50 border-b border-gray-200">
                                <th className="px-2 py-2 text-left text-gray-500 font-semibold">전략명</th>
                                <th className="px-2 py-2 text-left text-gray-500 font-semibold">브로커</th>
                                <th className="px-2 py-2 text-left text-gray-500 font-semibold">조건식</th>
                                <th className="px-2 py-2 text-left text-gray-500 font-semibold">매수시간</th>
                                <th className="px-2 py-2 text-center text-gray-500 font-semibold">최대</th>
                                <th className="px-2 py-2 text-center text-gray-500 font-semibold">Stop%</th>
                                <th className="px-2 py-2 text-center text-gray-500 font-semibold">활성</th>
                                <th className="px-2 py-2"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {addingNew && (
                                <StrategyFormRow
                                    value={form}
                                    onChange={setForm}
                                    onSave={() => createMut.mutate(form)}
                                    onCancel={() => setAddingNew(false)}
                                    saving={createMut.isPending}
                                />
                            )}
                            {strategies.map(s => (
                                editingId === s.id && editForm ? (
                                    <StrategyFormRow
                                        key={s.id}
                                        value={editForm}
                                        onChange={v => setEditForm(v as Strategy)}
                                        onSave={() => updateMut.mutate(editForm)}
                                        onCancel={cancelEdit}
                                        saving={updateMut.isPending}
                                    />
                                ) : (
                                    <tr key={s.id} className="hover:bg-gray-50">
                                        <td className="px-2 py-2 font-medium">{s.name}</td>
                                        <td className="px-2 py-2 text-gray-500">{s.broker}</td>
                                        <td className="px-2 py-2 font-mono">{s.condition_seq}</td>
                                        <td className="px-2 py-2 font-mono text-gray-600">{s.buy_start}~{s.buy_end}</td>
                                        <td className="px-2 py-2 text-center">{s.max_positions}</td>
                                        <td className="px-2 py-2 text-center">{Math.round(s.stop_rate * 100)}%</td>
                                        <td className="px-2 py-2 text-center">
                                            <span className={`inline-block w-2 h-2 rounded-full ${s.is_active ? 'bg-green-500' : 'bg-gray-300'}`} />
                                        </td>
                                        <td className="px-2 py-2">
                                            <div className="flex items-center gap-1 justify-end">
                                                <button onClick={() => startEdit(s)} className="p-1 text-gray-400 hover:text-blue-600 transition-colors">
                                                    <Pencil className="w-3.5 h-3.5" />
                                                </button>
                                                <button onClick={() => deleteMut.mutate(s.id)} className="p-1 text-gray-400 hover:text-red-600 transition-colors">
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                )
                            ))}
                            {strategies.length === 0 && !addingNew && (
                                <tr><td colSpan={8} className="px-2 py-6 text-center text-gray-400">전략 없음 — 추가 버튼으로 생성</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    )
}

// ── 전략 입력 행 ─────────────────────────────────────────

function StrategyFormRow({
    value, onChange, onSave, onCancel, saving,
}: {
    value: Omit<Strategy, 'id'> | Strategy
    onChange: (v: Omit<Strategy, 'id'>) => void
    onSave: () => void
    onCancel: () => void
    saving: boolean
}) {
    const f = (key: keyof Omit<Strategy, 'id'>, val: string | number) =>
        onChange({ ...value, [key]: val })

    return (
        <tr className="bg-blue-50">
            <td className="px-1 py-1"><input value={value.name} onChange={e => f('name', e.target.value)} placeholder="전략명" className="w-80 border rounded px-1.5 py-1 text-xs" /></td>
            <td className="px-1 py-1">
                <select value={value.broker} onChange={e => f('broker', e.target.value)} className="border rounded px-1 py-1 text-xs">
                    <option value="kiwoom">키움</option>
                    <option value="kis">KIS</option>
                    <option value="ls">LS</option>
                </select>
            </td>
            <td className="px-1 py-1"><input value={value.condition_seq} onChange={e => f('condition_seq', e.target.value)} placeholder="001" className="w-16 border rounded px-1.5 py-1 text-xs font-mono" /></td>
            <td className="px-1 py-1 flex items-center gap-1">
                <input value={value.buy_start} onChange={e => f('buy_start', e.target.value)} placeholder="09:05" className="w-14 border rounded px-1.5 py-1 text-xs font-mono" />
                <span className="text-gray-400">~</span>
                <input value={value.buy_end} onChange={e => f('buy_end', e.target.value)} placeholder="10:30" className="w-14 border rounded px-1.5 py-1 text-xs font-mono" />
            </td>
            <td className="px-1 py-1 text-center"><input type="number" value={value.max_positions} onChange={e => f('max_positions', Number(e.target.value))} className="w-10 border rounded px-1 py-1 text-xs text-center" /></td>
            <td className="px-1 py-1 text-center"><input type="number" step="0.01" value={value.stop_rate} onChange={e => f('stop_rate', Number(e.target.value))} className="w-14 border rounded px-1 py-1 text-xs text-center" /></td>
            <td className="px-1 py-1 text-center">
                <input type="checkbox" checked={value.is_active === 1} onChange={e => f('is_active', e.target.checked ? 1 : 0)} className="w-4 h-4 accent-blue-600" />
            </td>
            <td className="px-1 py-1">
                <div className="flex items-center gap-1 justify-end">
                    <button onClick={onSave} disabled={saving} className="p-1 text-green-600 hover:bg-green-50 rounded transition-colors">
                        <Check className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={onCancel} className="p-1 text-gray-500 hover:bg-gray-100 rounded transition-colors">
                        <X className="w-3.5 h-3.5" />
                    </button>
                </div>
            </td>
        </tr>
    )
}

// ── 이벤트 행 ────────────────────────────────────────────

function EventRow({ ev }: { ev: KdaemonEvent }) {
    const colors: Record<string, string> = {
        BUY:   'bg-red-50 border-red-200 text-red-700',
        SELL:  'bg-blue-50 border-blue-200 text-blue-700',
        FIND:  'bg-gray-50 border-gray-200 text-gray-600',
        ERROR: 'bg-yellow-50 border-yellow-200 text-yellow-700',
        START: 'bg-green-50 border-green-200 text-green-700',
        STOP:  'bg-orange-50 border-orange-200 text-orange-700',
    }
    const cls = colors[ev.action] ?? 'bg-gray-50 border-gray-200 text-gray-600'
    return (
        <div className={`flex items-center gap-3 px-3 py-1 rounded border text-xs ${cls}`}>
            <span className="font-mono text-gray-400 w-16 shrink-0">{ev.dt}</span>
            <span className="font-bold w-10 shrink-0">{ev.action}</span>
            {ev.stk_nm && <span className="font-medium">{ev.stk_nm}</span>}
            {ev.stk_cd && <span className="text-gray-400">({ev.stk_cd})</span>}
            {ev.price != null && <span>{ev.price.toLocaleString()}원</span>}
            {ev.qty != null && <span>{ev.qty}주</span>}
            {ev.profit != null && (
                <span className={`font-semibold ${ev.profit >= 0 ? 'text-red-600' : 'text-blue-600'}`}>
                    {ev.profit >= 0 ? '+' : ''}{ev.profit.toLocaleString()}원{ev.profit_rate != null && ` (${ev.profit_rate}%)`}
                </span>
            )}
            {ev.sell_reason && <span className="text-gray-400">[{ev.sell_reason}]</span>}
            {ev.memo && <span className="text-gray-400 ml-auto truncate">{ev.memo}</span>}
        </div>
    )
}
