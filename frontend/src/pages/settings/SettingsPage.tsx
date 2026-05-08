import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/components/ui/card'
import { Button } from '@/shared/components/ui/button'
import { RefreshCw, Trash2, Database, Key, CheckCircle2, AlertCircle } from 'lucide-react'
import api from '@/lib/api'

type StatusMessage = {
    text: string
    type: 'success' | 'error'
} | null

interface SettingItem {
    name: string
    value: string
}

export default function SettingsPage() {
    const [lastStkFill, setLastStkFill] = useState<string>('정보 없음')
    const [isStkLoading, setIsStkLoading] = useState(false)
    const [isTokenLoading, setIsTokenLoading] = useState(false)
    const [isCacheLoading, setIsCacheLoading] = useState(false)
    const [selectedTokenBrokers, setSelectedTokenBrokers] = useState<string[]>(['kiwoom', 'kis', 'ls'])
    
    // 상태 메시지 관리를 위한 state
    const [tokenStatus, setTokenStatus] = useState<StatusMessage>(null)
    const [stkStatus, setStkStatus] = useState<StatusMessage>(null)
    const [cacheStatus, setCacheStatus] = useState<StatusMessage>(null)

    useEffect(() => {
        fetchSettings()
    }, [])

    const fetchSettings = async () => {
        try {
            const res = await api.get('/api/v1/settings')
            const settings = res.data
            const lastFill = settings.find((s: SettingItem) => s.name === "마지막으로 stk_info를 채운 시각")
            if (lastFill) {
                setLastStkFill(lastFill.value)
            }
        } catch (error) {
            console.error('Failed to fetch settings:', error)
        }
    }

    const showStatus = (setter: (status: StatusMessage) => void, text: string, type: 'success' | 'error') => {
        setter({ text, type })
        setTimeout(() => setter(null), 3000)
    }

    const handleReissueToken = async () => {
        if (selectedTokenBrokers.length === 0) {
            showStatus(setTokenStatus, '재발급할 증권사를 하나 이상 선택해주세요.', 'error')
            return
        }

        setIsTokenLoading(true)
        setTokenStatus(null)
        try {
            const results = await Promise.all(selectedTokenBrokers.map(async (broker) => {
                const res = await api.get(`/api/v1/stkcompany/${broker}/issue-new-token`)
                return {
                    broker,
                    success: res.data?.success,
                    error: res.data?.error_message,
                }
            }))

            const successBrokers = results.filter(r => r.success).map(r => r.broker)
            const failedResults = results.filter(r => !r.success)
            const successLabels = successBrokers.map((broker) =>
                broker === 'kiwoom' ? '키움증권' : broker === 'kis' ? '한국투자증권' : 'LS증권'
            )
            const failedLabels = failedResults.map((r) => {
                const label = r.broker === 'kiwoom' ? '키움증권' : r.broker === 'kis' ? '한국투자증권' : 'LS증권'
                return `${label}: ${r.error || '알 수 없는 오류'}`
            })

            if (failedResults.length === 0) {
                showStatus(setTokenStatus, `${successLabels.join(', ')} 토큰이 모두 재발급되었습니다.`, 'success')
            } else if (successBrokers.length === 0) {
                showStatus(setTokenStatus, `토큰 재발급 실패: ${failedLabels.join('; ')}`, 'error')
            } else {
                showStatus(setTokenStatus, `${successLabels.join(', ')} 토큰 재발급 완료. 실패: ${failedLabels.join('; ')}`, 'error')
            }
        } catch (error: unknown) {
            showStatus(setTokenStatus, '토큰 재발급 중 오류 발생: ' + (error as Error).message, 'error')
        } finally {
            setIsTokenLoading(false)
        }
    }

    const handleFillStkInfo = async () => {
        setIsStkLoading(true)
        setStkStatus(null)
        try {
            const res = await api.put('/api/v1/settings/stk_info?force=true')
            if (res.data && res.data.success) {
                showStatus(setStkStatus, '주식 종목 정보가 업데이트되었습니다.', 'success')
                if (res.data.data?.last_stk_info_fill) {
                    setLastStkFill(res.data.data.last_stk_info_fill)
                }
            } else {
                showStatus(setStkStatus, '종목 정보 업데이트 실패: ' + (res.data?.error_message || '알 수 없는 오류'), 'error')
            }
        } catch (error: unknown) {
            showStatus(setStkStatus, '종목 정보 업데이트 중 오류 발생: ' + (error as Error).message, 'error')
        } finally {
            setIsStkLoading(false)
        }
    }

    const handleDeleteCache = async () => {
        if (!window.confirm('모든 캐시를 삭제하시겠습니까?')) return
        setIsCacheLoading(true)
        setCacheStatus(null)
        try {
            const res = await api.delete('/api/v1/settings/cache')
            if (res.data && res.data.success) {
                showStatus(setCacheStatus, '모든 캐시가 삭제되었습니다.', 'success')
            } else {
                showStatus(setCacheStatus, '캐시 삭제 실패: ' + (res.data?.error_message || '알 수 없는 오류'), 'error')
            }
        } catch (error: unknown) {
            showStatus(setCacheStatus, '캐시 삭제 중 오류 발생: ' + (error as Error).message, 'error')
        } finally {
            setIsCacheLoading(false)
        }
    }

    // 상태 메시지 컴포넌트
    const StatusDisplay = ({ status }: { status: StatusMessage }) => {
        if (!status) return <div className="h-10" /> // 높이 고정을 위한 placeholder
        
        return (
            <div className={`flex items-center gap-2 p-2 rounded-md text-sm h-10 animate-in fade-in slide-in-from-top-1 duration-200 ${
                status.type === 'success' ? 'bg-green-500/10 text-green-600 dark:text-green-400' : 'bg-destructive/10 text-destructive'
            }`}>
                {status.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                <span className="truncate">{status.text}</span>
            </div>
        )
    }

    return (
        <div className="container mx-auto p-6 space-y-6 text-sm">
            <header className="mb-8 flex justify-between items-end">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">시스템 설정</h1>
                    <p className="text-muted-foreground mt-2">
                        Kiwi8 시스템의 핵심 구성 요소를 관리하고 데이터를 동기화합니다.
                    </p>
                </div>
                <div className="text-muted-foreground font-mono text-xs">
                    v0.0.1
                </div>
            </header>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {/* 토큰 관리 */}
                <Card className="flex flex-col">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Key className="w-5 h-5 text-primary" />
                            인증 토큰
                        </CardTitle>
                        <CardDescription>선택된 증권사의 API Access Token을 강제로 재발급합니다.</CardDescription>
                    </CardHeader>
                    <CardContent className="mt-auto space-y-4">
                        <div className="space-y-2">
                            <div className="text-xs text-gray-500">토큰 재발급 대상 증권사</div>
                            <div className="flex flex-wrap gap-2">
                                {[
                                    { key: 'kiwoom', label: '키움증권' },
                                    { key: 'kis', label: '한국투자증권' },
                                    { key: 'ls', label: 'LS증권' },
                                ].map((broker) => (
                                    <label key={broker.key} className="inline-flex items-center gap-2 px-3 py-2 border rounded-md text-sm cursor-pointer select-none bg-white">
                                        <input
                                            type="checkbox"
                                            className="h-4 w-4 accent-blue-600"
                                            checked={selectedTokenBrokers.includes(broker.key)}
                                            onChange={() => {
                                                setSelectedTokenBrokers((prev) =>
                                                    prev.includes(broker.key)
                                                        ? prev.filter((item) => item !== broker.key)
                                                        : [...prev, broker.key]
                                                )
                                            }}
                                        />
                                        <span>{broker.label}</span>
                                    </label>
                                ))}
                            </div>
                        </div>
                        <StatusDisplay status={tokenStatus} />
                        <Button 
                            onClick={handleReissueToken} 
                            disabled={isTokenLoading || selectedTokenBrokers.length === 0}
                            className="w-full"
                        >
                            <RefreshCw className={`mr-2 h-4 w-4 ${isTokenLoading ? 'animate-spin' : ''}`} />
                            토큰 재발급
                        </Button>
                    </CardContent>
                </Card>

                {/* 데이터 관리 */}
                <Card className="flex flex-col">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Database className="w-5 h-5 text-primary" />
                            마스터 데이터
                        </CardTitle>
                        <CardDescription>stk_info 테이블을 최신 상태로 업데이트합니다.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4 mt-auto">
                        <div className="flex items-center justify-between p-2 bg-muted rounded-md">
                            <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Last Update</span>
                            <span className="text-xs font-mono">{lastStkFill}</span>
                        </div>
                        <StatusDisplay status={stkStatus} />
                        <Button 
                            variant="outline"
                            onClick={handleFillStkInfo} 
                            disabled={isStkLoading}
                            className="w-full"
                        >
                            <RefreshCw className={`mr-2 h-4 w-4 ${isStkLoading ? 'animate-spin' : ''}`} />
                            종목정보 동기화
                        </Button>
                    </CardContent>
                </Card>

                {/* 시스템 유지보수 */}
                <Card className="flex flex-col border-destructive/20 bg-destructive/5">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-destructive">
                            <Trash2 className="w-5 h-5" />
                            시스템 캐시
                        </CardTitle>
                        <CardDescription>임시 저장된 시세 및 계산 데이터를 모두 삭제합니다.</CardDescription>
                        <CardDescription>전일 최종 시세 데이터도 함께 삭제됩니다.</CardDescription>
                    </CardHeader>
                    <CardContent className="mt-auto space-y-4">
                        <StatusDisplay status={cacheStatus} />
                        <Button 
                            variant="destructive" 
                            onClick={handleDeleteCache} 
                            disabled={isCacheLoading}
                            className="w-full"
                        >
                            <Trash2 className="mr-2 h-4 w-4" />
                            전체 캐시 삭제
                        </Button>
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}
