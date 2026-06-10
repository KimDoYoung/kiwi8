import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Play, Square, RefreshCcw, Plus, Trash2, Pencil, Check, X } from 'lucide-react'
import api from '@/lib/api'
import { useWsStore, type KdaemonEvent } from '@/store/wsStore'
import { Switch } from '@/shared/components/ui/switch'
import { AgGridReact } from 'ag-grid-react'
import type { ColDef } from 'ag-grid-community'
import { AllCommunityModule, ModuleRegistry } from 'ag-grid-community'

ModuleRegistry.registerModules([AllCommunityModule])

// ── API ────────────────────────────────────────────────────

async function fetchStatus() {
    const res = await api.get('/api/v1/kdaemon/status')
    return res.data as { status: string; updated_at: string | null; dry_run: boolean }
}
async function sendCommand(cmd: string, args?: Record<string, unknown>) {
    const res = await api.post('/api/v1/kdaemon/command', { cmd, args })
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
    const res = await api.get('/api/v1/kdaemon/strategies')
    return res.data
}

// ── 직접 매수 큐 ───────────────────────────────────────

async function fetchManualStocks(): Promise<string[]> {
    const res = await api.get('/api/v1/kdaemon/manual-stocks')
    return res.data.lines ?? []
}
async function saveManualStocks(lines: string[]) {
    const res = await api.put('/api/v1/kdaemon/manual-stocks', { lines })
    return res.data
}

// ── 포지션 ────────────────────────────────────────────

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
    cur_price: number | null
    bought_at: string
    updated_at: string
}

async function fetchPositions(): Promise<Position[]> {
    const res = await api.get('/api/v1/kdaemon/positions')
    return res.data
}

interface TickSnapshot {
    price: number
    volume_1min: number | null
    vol_power: number | null
    orderbook_ratio: number | null
}
async function fetchLastTick(stk_cd: string): Promise<TickSnapshot | null> {
    const res = await api.get(`/api/v1/kdaemon/positions/${stk_cd}/ticks`, { params: { n: 5 } })
    const ticks: TickSnapshot[] = res.data
    return ticks.length > 0 ? ticks[ticks.length - 1] : null
}
async function forceSellPosition(stk_cd: string) {
    const res = await api.post(`/api/v1/kdaemon/positions/${stk_cd}/sell`)
    return res.data
}
async function createStrategy(body: Omit<Strategy, 'id'>) {
    const res = await api.post('/api/v1/kdaemon/strategies', body)
    return res.data
}
async function updateStrategy({ id, ...body }: Strategy) {
    const res = await api.put(`/api/v1/kdaemon/strategies/${id}`, body)
    return res.data
}
async function deleteStrategy(id: number) {
    const res = await api.delete(`/api/v1/kdaemon/strategies/${id}`)
    return res.data
}

// ── Component ──────────────────────────────────────────────

export default function DaemonPage() {
    const queryClient = useQueryClient()
    const kdaemonEvents = useWsStore(s => s.kdaemonEvents)
    const clearKdaemonEvents = useWsStore(s => s.clearKdaemonEvents)
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
        queryKey: ['kdaemonStatus'], queryFn: fetchStatus, refetchInterval: 5000,
    })
    const cmdMutation = useMutation({
        mutationFn: ({ cmd, args }: { cmd: string; args?: Record<string, unknown> }) => sendCommand(cmd, args),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['kdaemonStatus'] }),
    })
    const isRunning = statusData?.status === 'running'
    const isDryRun = statusData?.dry_run !== false  // 기본 true

    // ── 전략 목록 ──
    const { data: strategies = [] } = useQuery({
        queryKey: ['kdaemonStrategies'], queryFn: fetchStrategies,
    })
    const createMut = useMutation({
        mutationFn: createStrategy,
        onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['kdaemonStrategies'] }); setAddingNew(false); setForm(emptyForm()) },
    })
    const updateMut = useMutation({
        mutationFn: updateStrategy,
        onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['kdaemonStrategies'] }); setEditingId(null) },
    })
    const deleteMut = useMutation({
        mutationFn: deleteStrategy,
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['kdaemonStrategies'] }),
    })

    // ── 직접 매수 큐 ──
    const { data: manualLines = [], refetch: refetchManual } = useQuery({
        queryKey: ['kdaemonManualStocks'], queryFn: fetchManualStocks, refetchInterval: 10000,
    })
    const saveMut = useMutation({
        mutationFn: saveManualStocks,
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['kdaemonManualStocks'] }),
    })

    // ── 포지션 ──
    const { data: positions = [] } = useQuery({
        queryKey: ['kdaemonPositions'], queryFn: fetchPositions, refetchInterval: 30000,
    })
    const [tickMap, setTickMap] = useState<Record<string, TickSnapshot | null>>({})
    useEffect(() => {
        positions.forEach(p => {
            fetchLastTick(p.stk_cd).then(t => setTickMap(prev => ({ ...prev, [p.stk_cd]: t })))
        })
    }, [positions])
    const forceSellMut = useMutation({
        mutationFn: forceSellPosition,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['kdaemonPositions'] })
            queryClient.invalidateQueries({ queryKey: ['kdaemonLogs'] })
        },
    })
    const handleForceSell = (stk_cd: string, stk_nm: string) => {
        if (!window.confirm(`${stk_nm}(${stk_cd}) 강제매도 하시겠습니까?`)) return
        forceSellMut.mutate(stk_cd)
    }

    // WS 이벤트 수신 시 positions/manualStocks 자동 갱신
    const prevEvLen = useRef(0)
    useEffect(() => {
        if (kdaemonEvents.length !== prevEvLen.current) {
            prevEvLen.current = kdaemonEvents.length
            queryClient.invalidateQueries({ queryKey: ['kdaemonPositions'] })
            queryClient.invalidateQueries({ queryKey: ['kdaemonManualStocks'] })
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
                <button onClick={() => cmdMutation.mutate({ cmd: 'start' })} disabled={cmdMutation.isPending || isRunning}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium bg-green-600 text-white hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                    <Play className="w-3.5 h-3.5" /> 시작
                </button>
                <button onClick={() => cmdMutation.mutate({ cmd: 'stop' })} disabled={cmdMutation.isPending || !isRunning}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium bg-red-600 text-white hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                    <Square className="w-3.5 h-3.5" /> 정지
                </button>
                <button onClick={() => queryClient.invalidateQueries({ queryKey: ['kdaemonStatus'] })}
                    className="p-1.5 text-gray-500 hover:bg-gray-100 rounded-md transition-colors">
                    <RefreshCcw className="w-4 h-4" />
                </button>
                <div className={`flex items-center gap-2 border rounded-md px-3 py-1.5 transition-colors ${isDryRun ? 'bg-gray-50' : 'bg-orange-50 border-orange-300'}`}>
                    <span className={`text-xs font-semibold ${isDryRun ? 'text-gray-500' : 'text-orange-600'}`}>
                        {isDryRun ? '연습' : '실제'}
                    </span>
                    <Switch
                        checked={!isDryRun}
                        onCheckedChange={(checked) =>
                            cmdMutation.mutate({ cmd: 'dry_run', args: { value: !checked } })
                        }
                        disabled={cmdMutation.isPending}
                        className="data-[state=checked]:bg-orange-500"
                    />
                </div>
                <label className="flex items-center gap-2 ml-auto cursor-pointer select-none text-gray-600">
                    <input type="checkbox" checked={showEvents} onChange={e => setShowEvents(e.target.checked)}
                        className="w-4 h-4 accent-blue-600" />
                    이벤트 보기
                </label>
            </div>

            {/* ── 2-column grid ── */}
            <div className="grid grid-cols-2 gap-4">

                {/* LEFT: 직접 매수 큐 + 포지션 그리드 */}
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
                            {manualLines.map(line => {
                                const [cd, sr] = line.split(',')
                                const stopLabel = sr ? ` ${parseFloat(sr) > 1 ? sr : String(parseFloat(sr) * 100)}%` : ''
                                return (
                                    <span key={line} className="flex items-center gap-1 px-2 py-0.5 bg-orange-50 border border-orange-200 rounded text-xs font-mono text-orange-700">
                                        {cd}{stopLabel && <span className="text-orange-400">{stopLabel}</span>}
                                        <button onClick={() => removeCode(line)} className="text-orange-400 hover:text-orange-700">
                                            <X className="w-3 h-3" />
                                        </button>
                                    </span>
                                )
                            })}
                            {manualLines.length === 0 && <span className="text-xs text-gray-400">큐 비어있음</span>}
                        </div>
                        <div className="flex gap-1.5">
                            <input
                                value={newCode}
                                onChange={e => setNewCode(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && addCode()}
                                placeholder="005930 또는 005930,5 (5% 손절)"
                                className="flex-1 border rounded px-2 py-1 text-xs font-mono"
                            />
                            <button onClick={addCode} disabled={saveMut.isPending}
                                className="flex items-center gap-1 px-2.5 py-1 rounded text-xs bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-40 transition-colors">
                                <Plus className="w-3.5 h-3.5" /> 추가
                            </button>
                        </div>
                    </div>

                    {/* 포지션 AG Grid */}
                    <PositionGrid
                        positions={positions}
                        handleForceSell={handleForceSell}
                    />

                    {/* 포지션 차트 (AG Grid 아래) */}
                    <PositionSection
                        positions={positions}
                        tickMap={tickMap}
                        handleForceSell={handleForceSell}
                        forceSellPending={forceSellMut.isPending}
                    />

                </div>

                {/* RIGHT: 실시간 이벤트 */}
                <div className="flex flex-col gap-4">

                    {/* 실시간 이벤트 */}
                    <div className="bg-white border rounded-lg p-3">
                        <div className="flex items-center justify-between mb-2">
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                                실시간 이벤트
                                {kdaemonEvents.length > 0 && <span className="ml-2 text-blue-500 font-mono">{kdaemonEvents.length}</span>}
                            </p>
                            {kdaemonEvents.length > 0 && (
                                <button onClick={clearKdaemonEvents}
                                    className="text-xs text-gray-400 hover:text-red-500 transition-colors px-1.5 py-0.5 rounded hover:bg-red-50">
                                    전체 지우기
                                </button>
                            )}
                        </div>
                        {!showEvents || kdaemonEvents.length === 0 ? (
                            <p className="text-xs text-gray-400 py-3 text-center">
                                {showEvents ? '이벤트 없음' : '이벤트 보기 비활성'}
                            </p>
                        ) : (
                            <div ref={feedRef} className="space-y-1 max-h-[540px] overflow-auto">
                                {[...kdaemonEvents].reverse().map((ev, i) => <EventRow key={i} ev={ev} />)}
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

// ── Tick 신호 표시 ───────────────────────────────────────

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
            {ev.memo && <span className="text-gray-400 truncate">{ev.memo}</span>}
        </div>
    )
}

// ── 수직 가격 바 ─────────────────────────────────────────

function VerticalPriceBar({ p }: { p: Position }) {
    const cur = p.cur_price
    const prices = [p.stop_price, p.buy_price, p.base_price, cur ?? p.buy_price]
    const domainMin = Math.min(...prices)
    const domainMax = Math.max(...prices)
    const pad = (domainMax - domainMin) * 0.08 || p.buy_price * 0.01
    const lo = domainMin - pad
    const hi = domainMax + pad
    const range = hi - lo
    // bottom% — 높을수록 위
    const bot = (v: number) => Math.max(0, Math.min(100, ((v - lo) / range) * 100))

    const stopBot = bot(p.stop_price)
    const buyBot  = bot(p.buy_price)
    const baseBot = bot(p.base_price)
    const curBot  = cur != null ? bot(cur) : null

    const BAR_W = 28  // px

    return (
        <div className="flex items-stretch gap-0">
            {/* 수직 바 */}
            <div className="relative flex-shrink-0" style={{ width: BAR_W, height: 140 }}>
                {/* 트랙 배경 */}
                <div className="absolute inset-x-0 bg-gray-100"
                    style={{ bottom: `${stopBot}%`, top: `${100 - baseBot}%` }} />
                {/* 매수가 ↔ 현재가 구간: 수익=빨강, 손실=파랑 */}
                {curBot != null && (
                    <div className={`absolute inset-x-0 ${curBot >= buyBot ? 'bg-red-300' : 'bg-blue-300'}`}
                        style={{
                            bottom: `${Math.min(buyBot, curBot)}%`,
                            height: `${Math.abs(curBot - buyBot)}%`,
                        }} />
                )}
                {/* 매수가 라인 (회색) */}
                <div className="absolute inset-x-0 bg-gray-500" style={{ bottom: `${buyBot}%`, height: 2 }} />
                {/* 현재가 삼각형 마커 (바 오른쪽, 왼쪽 방향) */}
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
                {/* 기준가 */}
                <div className="absolute left-0 flex items-center gap-1"
                    style={{ bottom: `${baseBot}%`, transform: 'translateY(50%)' }}>
                    <span className="text-blue-500 font-semibold">{p.base_price.toLocaleString()}</span>
                    <span className="text-gray-400 text-[9px]">기준가</span>
                </div>
                {/* 현재가 */}
                {cur != null && curBot != null && (
                    <div className="absolute left-0 flex items-center gap-1"
                        style={{ bottom: `${curBot}%`, transform: 'translateY(50%)' }}>
                        <span className="text-orange-600 font-bold">{cur.toLocaleString()}</span>
                        <span className="text-gray-400 text-[9px]">현재가</span>
                    </div>
                )}
                {/* 매수가 */}
                <div className="absolute left-0 flex items-center gap-1"
                    style={{ bottom: `${buyBot}%`, transform: 'translateY(50%)' }}>
                    <span className="text-gray-600">{p.buy_price.toLocaleString()}</span>
                    <span className="text-gray-400 text-[9px]">매수가</span>
                </div>
                {/* 손절가 */}
                <div className="absolute left-0 flex items-center gap-1"
                    style={{ bottom: `${stopBot}%`, transform: 'translateY(50%)' }}>
                    <span className="text-red-500">{p.stop_price.toLocaleString()}</span>
                    <span className="text-gray-400 text-[9px]">손절가</span>
                </div>
            </div>
        </div>
    )
}

// ── 포지션 카드 ──────────────────────────────────────────

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
            {/* HEADER */}
            <div className="flex items-start justify-between">
                <div>
                    <span className="font-semibold text-gray-900 text-sm">{p.stk_nm || p.stk_cd}</span>
                    <span className="text-gray-400 text-xs ml-1.5 font-mono">({p.stk_cd})</span>
                </div>
                <TickSignal tick={tick} />
            </div>

            {/* VERTICAL PRICE BAR */}
            <VerticalPriceBar p={p} />

            {/* P&L */}
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

            {/* FOOTER */}
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

// ── 포지션 AG Grid ───────────────────────────────────────

function PositionGrid({ positions, handleForceSell }: {
    positions: Position[]
    handleForceSell: (stk_cd: string, stk_nm: string) => void
}) {
    const colDefs = useMemo<ColDef<Position>[]>(() => [
        { headerName: '종목', width: 130, sortable: false,
            valueGetter: ({ data }: { data: Position }) => `${data!.stk_nm || data!.stk_cd} (${data!.stk_cd})` },
        { field: 'buy_price', headerName: '매수가', width: 90, type: 'numericColumn',
            valueFormatter: ({ value }: { value: number }) => value.toLocaleString() },
        { field: 'cur_price', headerName: '현재가', width: 90, type: 'numericColumn',
            valueFormatter: ({ value }: { value: number | null }) => value != null ? value.toLocaleString() : '—' },
        { headerName: '평가손익', width: 110, type: 'numericColumn',
            valueGetter: ({ data }: { data: Position }) =>
                data!.cur_price != null ? (data!.cur_price - data!.buy_price) * data!.qty : null,
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

// ── 포지션 섹션 (카드 그리드) ────────────────────────────

function PositionSection({ positions, tickMap, handleForceSell, forceSellPending }: {
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
