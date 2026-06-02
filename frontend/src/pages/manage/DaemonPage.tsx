import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Play, Square, RefreshCcw, Save, ListFilter } from 'lucide-react'
import api from '@/lib/api'
import { useWsStore, type KdaemonEvent } from '@/store/wsStore'

async function fetchStatus() {
    const res = await api.get('/api/v1/kdemon/status')
    return res.data as { status: string; updated_at: string | null }
}

async function sendCommand(cmd: 'start' | 'stop') {
    const res = await api.post('/api/v1/kdemon/command', { cmd })
    return res.data
}

async function fetchSettings() {
    const res = await api.get('/api/v1/settings/list')
    const all: { name: string; value: string }[] = Array.isArray(res.data) ? res.data : []
    return {
        stop_rate: all.find(s => s.name === 'auto_trade_stop_rate')?.value ?? '0.05',
        max_positions: all.find(s => s.name === 'auto_trade_max_positions')?.value ?? '3',
        condition_seq: all.find(s => s.name === 'auto_trade_condition_seq')?.value ?? '',
    }
}

async function saveSetting(key: string, value: string) {
    await api.put(`/api/v1/settings/${key}`, { value })
}

async function fetchConditions() {
    const res = await api.get('/api/v1/kdemon/conditions')
    return (res.data?.data ?? []) as { seq: string; name: string }[]
}

export default function DaemonPage() {
    const queryClient = useQueryClient()
    const kdaemonEvents = useWsStore(s => s.kdaemonEvents)
    const feedRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (feedRef.current) {
            feedRef.current.scrollTop = feedRef.current.scrollHeight
        }
    }, [kdaemonEvents])

    // ── 데몬 상태 ──
    const { data: statusData, isLoading: statusLoading } = useQuery({
        queryKey: ['kdemonStatus'],
        queryFn: fetchStatus,
        refetchInterval: 5000,
    })
    const cmdMutation = useMutation({
        mutationFn: sendCommand,
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['kdemonStatus'] }),
    })
    const isRunning = statusData?.status === 'running'

    // ── 설정 ──
    const { data: settingsData } = useQuery({
        queryKey: ['autoTradeSettings'],
        queryFn: fetchSettings,
    })

    const [stopRate, setStopRate] = useState('0.05')
    const [maxPositions, setMaxPositions] = useState('3')
    const [conditionSeq, setConditionSeq] = useState('')
    const [saveMsg, setSaveMsg] = useState('')

    useEffect(() => {
        if (settingsData) {
            setStopRate(settingsData.stop_rate)
            setMaxPositions(settingsData.max_positions)
            setConditionSeq(settingsData.condition_seq)
        }
    }, [settingsData])

    const handleSave = async () => {
        try {
            await Promise.all([
                saveSetting('auto_trade_stop_rate', stopRate),
                saveSetting('auto_trade_max_positions', maxPositions),
                saveSetting('auto_trade_condition_seq', conditionSeq),
            ])
            queryClient.invalidateQueries({ queryKey: ['autoTradeSettings'] })
            setSaveMsg('저장 완료')
            setTimeout(() => setSaveMsg(''), 2000)
        } catch {
            setSaveMsg('저장 실패')
            setTimeout(() => setSaveMsg(''), 2000)
        }
    }

    // ── 조건식 목록 ──
    const [showConditions, setShowConditions] = useState(false)
    const { data: conditions, isFetching: condFetching, refetch: refetchConditions } = useQuery({
        queryKey: ['kdemonConditions'],
        queryFn: fetchConditions,
        enabled: false,
    })

    const handleLoadConditions = () => {
        setShowConditions(true)
        refetchConditions()
    }

    return (
        <div className="flex flex-col h-full p-4 gap-6 overflow-auto">
            <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold">K-데몬</h2>
                <span className="text-gray-400 font-mono text-xs">[8201]</span>
            </div>

            {/* ── 상태 / 제어 ── */}
            <div className="bg-white border rounded-lg p-4">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">데몬 상태</p>
                <div className="flex items-center gap-4 flex-wrap">
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-md border bg-gray-50">
                        <span className={`w-2.5 h-2.5 rounded-full ${
                            statusLoading ? 'bg-gray-300' :
                            isRunning ? 'bg-green-500 animate-pulse' : 'bg-gray-400'
                        }`} />
                        <span className="text-sm font-medium">
                            {statusLoading ? '...' : isRunning ? '실행 중' : '정지'}
                        </span>
                        {statusData?.updated_at && (
                            <span className="text-xs text-gray-400 ml-1">{statusData.updated_at}</span>
                        )}
                    </div>

                    <button
                        onClick={() => cmdMutation.mutate('start')}
                        disabled={cmdMutation.isPending || isRunning}
                        className="flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-medium bg-green-600 text-white hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                        <Play className="w-3.5 h-3.5" /> 시작
                    </button>

                    <button
                        onClick={() => cmdMutation.mutate('stop')}
                        disabled={cmdMutation.isPending || !isRunning}
                        className="flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-medium bg-red-600 text-white hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                        <Square className="w-3.5 h-3.5" /> 정지
                    </button>

                    <button
                        onClick={() => queryClient.invalidateQueries({ queryKey: ['kdemonStatus'] })}
                        className="p-1.5 rounded-md text-gray-500 hover:bg-gray-100 transition-colors"
                    >
                        <RefreshCcw className="w-4 h-4" />
                    </button>
                </div>
                {cmdMutation.isError && (
                    <p className="mt-2 text-xs text-red-500">명령 실패: {String(cmdMutation.error)}</p>
                )}
            </div>

            {/* ── 자동매매 설정 ── */}
            <div className="bg-white border rounded-lg p-4">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">자동매매 설정</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">

                    <label className="flex flex-col gap-1">
                        <span className="text-xs text-gray-600">손절/익절 비율 (stop_rate)</span>
                        <div className="flex items-center gap-2">
                            <input
                                type="number"
                                step="0.01" min="0.01" max="0.5"
                                value={stopRate}
                                onChange={e => setStopRate(e.target.value)}
                                className="w-24 border rounded-md px-2 py-1.5 text-sm font-mono"
                            />
                            <span className="text-xs text-gray-500">
                                = -{Math.round(parseFloat(stopRate || '0') * 100)}%
                            </span>
                        </div>
                    </label>

                    <label className="flex flex-col gap-1">
                        <span className="text-xs text-gray-600">최대 보유 종목 수</span>
                        <input
                            type="number"
                            step="1" min="1" max="10"
                            value={maxPositions}
                            onChange={e => setMaxPositions(e.target.value)}
                            className="w-20 border rounded-md px-2 py-1.5 text-sm font-mono"
                        />
                    </label>

                    <div className="flex flex-col gap-1">
                        <span className="text-xs text-gray-600">조건식 seq 번호</span>
                        <div className="flex items-center gap-2">
                            <input
                                type="text"
                                value={conditionSeq}
                                onChange={e => setConditionSeq(e.target.value)}
                                placeholder="예: 001"
                                className="w-24 border rounded-md px-2 py-1.5 text-sm font-mono"
                            />
                            <button
                                onClick={handleLoadConditions}
                                disabled={condFetching}
                                className="flex items-center gap-1 px-2 py-1.5 border rounded-md text-xs text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
                            >
                                <ListFilter className="w-3.5 h-3.5" />
                                {condFetching ? '조회중...' : '목록'}
                            </button>
                        </div>

                        {/* 조건식 목록 드롭다운 */}
                        {showConditions && conditions && conditions.length > 0 && (
                            <div className="mt-1 border rounded-md bg-white shadow-sm max-h-40 overflow-auto">
                                {conditions.map(c => (
                                    <button
                                        key={c.seq}
                                        onClick={() => { setConditionSeq(c.seq); setShowConditions(false) }}
                                        className="w-full text-left px-3 py-1.5 text-xs hover:bg-blue-50 flex items-center gap-2"
                                    >
                                        <span className="font-mono text-gray-400 w-8">{c.seq}</span>
                                        <span>{c.name}</span>
                                    </button>
                                ))}
                            </div>
                        )}
                        {showConditions && conditions?.length === 0 && !condFetching && (
                            <p className="text-xs text-gray-400 mt-1">조건식 없음</p>
                        )}
                    </div>
                </div>

                <div className="flex items-center gap-3 mt-5">
                    <button
                        onClick={handleSave}
                        className="flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                    >
                        <Save className="w-3.5 h-3.5" /> 저장
                    </button>
                    {saveMsg && (
                        <span className={`text-xs ${saveMsg.includes('실패') ? 'text-red-500' : 'text-green-600'}`}>
                            {saveMsg}
                        </span>
                    )}
                </div>
            </div>

            {/* ── 이벤트 피드 ── */}
            <div className="bg-white border rounded-lg p-4 flex-1 min-h-0">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                    실시간 이벤트
                    {kdaemonEvents.length > 0 && (
                        <span className="ml-2 text-blue-500 font-mono">{kdaemonEvents.length}</span>
                    )}
                </p>
                {kdaemonEvents.length === 0 ? (
                    <p className="text-xs text-gray-400 py-4 text-center">이벤트 없음 — 데몬 시작 후 표시됩니다.</p>
                ) : (
                    <div ref={feedRef} className="space-y-1.5 max-h-64 overflow-auto">
                        {[...kdaemonEvents].reverse().slice(-10).map((ev, i) => (
                            <EventRow key={i} ev={ev} />
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}

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
        <div className={`flex items-center gap-3 px-3 py-1.5 rounded border text-xs ${cls}`}>
            <span className="font-mono text-gray-400 w-16 shrink-0">{ev.dt}</span>
            <span className="font-bold w-10 shrink-0">{ev.action}</span>
            {ev.stk_nm && <span className="font-medium">{ev.stk_nm}</span>}
            {ev.stk_cd && <span className="text-gray-400">({ev.stk_cd})</span>}
            {ev.price != null && <span>{ev.price.toLocaleString()}원</span>}
            {ev.qty != null && <span>{ev.qty}주</span>}
            {ev.profit != null && (
                <span className={ev.profit >= 0 ? 'text-red-600 font-semibold' : 'text-blue-600 font-semibold'}>
                    {ev.profit >= 0 ? '+' : ''}{ev.profit.toLocaleString()}원
                    {ev.profit_rate != null && ` (${ev.profit_rate}%)`}
                </span>
            )}
            {ev.sell_reason && <span className="text-gray-400">[{ev.sell_reason}]</span>}
            {ev.memo && <span className="text-gray-400 ml-auto truncate">{ev.memo}</span>}
        </div>
    )
}
