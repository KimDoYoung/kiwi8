import { useQuery } from '@tanstack/react-query'
import api from '@/shared/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card'
import {
    Wallet,
    TrendingUp,
    TrendingDown,
    PieChart as PieChartIcon,
    BarChart3,
    RefreshCw,
    Building2,
    Banknote,
    Briefcase,
    Store,
    Landmark
} from 'lucide-react'
import ReactECharts from 'echarts-for-react'
import { cn, formatCost } from '@/shared/lib/utils'
import Loading from '@/shared/components/Loading'
import LoadingFail from '@/shared/components/LoadingFail'

interface AccountData {
    id: string
    증권사: string
    증권사명: string
    계좌번호: string
    총자산: number
    매입금액: number
    평가손익: number
    수익률: string
    주문가능금액: number
    보유종목수: number
}

interface SummaryData {
    전체자산: number
    전체매입금액: number
    전체평가손익: number
    전체수익률: string
    계좌개수: number
}

interface AccountSummaryResponse {
    summary: SummaryData
    accounts: Record<string, AccountData>
}

export default function AccountSummaryPage() {
    const { data, isLoading, isError, refetch, isFetching } = useQuery<AccountSummaryResponse>({
        queryKey: ['accountSummary'],
        queryFn: async () => {
            const res = await api.get('/api/v1/stkcompany/summary')
            return res.data
        }
    })

    if (isLoading) {
        return <Loading message="계좌 정보를 불러오는 중..." />
    }

    if (isError || !data) {
        return <LoadingFail message="계좌 정보를 불러오는데 실패했습니다." />
    }

    const { summary, accounts } = data
    
    // 증권사 순서: 1. 한국투자증권(kis), 2. LS증권(ls), 3. 키움증권(kiwoom)
    const BROKER_ORDER: Record<string, number> = { kis: 1, ls: 2, kiwoom: 3 }
    const accountList = Object.values(accounts).sort((a, b) => 
        (BROKER_ORDER[a.id] || 99) - (BROKER_ORDER[b.id] || 99)
    )

    // 파이 차트 데이터 (자산 비중)
    const pieOption = {
        tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
        legend: { bottom: '0%', left: 'center', itemSize: 10, textStyle: { fontSize: 11 } },
        series: [
            {
                name: '자산 비중',
                type: 'pie',
                radius: ['40%', '70%'],
                avoidLabelOverlap: false,
                itemStyle: { borderRadius: 6, borderColor: '#fff', borderWidth: 2 },
                label: { show: false },
                emphasis: { label: { show: true, fontSize: 14, fontWeight: 'bold' } },
                data: accountList.map(acc => ({
                    value: acc.총자산,
                    name: acc.증권사명,
                    itemStyle: {
                        color: acc.id === 'kis' ? '#80624c' : acc.id === 'ls' ? '#003378' : '#e4007f'
                    }
                }))
            }
        ]
    }

    // 바 차트 데이터 (매입금액 vs 평가손익)
    const barOption = {
        tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
        grid: { left: '3%', right: '4%', bottom: '10%', top: '5%', containLabel: true },
        legend: { bottom: '0%', left: 'center', itemSize: 10, textStyle: { fontSize: 11 } },
        xAxis: { type: 'category', data: accountList.map(acc => acc.증권사명), axisLabel: { fontSize: 11 } },
        yAxis: { type: 'value', axisLabel: { fontSize: 10 } },
        series: [
            {
                name: '매입금액',
                type: 'bar',
                data: accountList.map(acc => ({
                    value: acc.매입금액,
                    itemStyle: {
                        color: acc.id === 'kis' ? '#80624c' : acc.id === 'ls' ? '#003378' : '#e4007f'
                    }
                })),
                label: { show: false }
            },
            {
                name: '평가손익',
                type: 'bar',
                data: accountList.map(acc => ({
                    value: acc.평가손익,
                    itemStyle: { color: acc.평가손익 >= 0 ? '#ef4444' : '#3b82f6' }
                })),
                label: { show: true, position: 'top', fontSize: 10, formatter: (p: any) => formatCost(p.value) }
            }
        ]
    }

    return (
        <div className="flex flex-col h-full bg-slate-50 overflow-y-auto">
            {/* 헤더 */}
            <div className="px-6 py-4 bg-white border-b border-slate-200 flex items-center justify-between sticky top-0 z-10">
                <div className="flex items-center gap-2">
                    <Wallet className="w-5 h-5 text-primary" />
                    <h1 className="text-lg font-bold text-slate-800">통합 계좌 요약</h1>
                    <span className="text-xs text-slate-400 font-mono ml-1">[1101]</span>
                </div>
                <button
                    onClick={() => refetch()}
                    disabled={isFetching}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white border border-slate-200 rounded-md hover:bg-slate-50 transition-colors disabled:opacity-50"
                >
                    <RefreshCw className={cn("w-3.5 h-3.5", isFetching && "animate-spin")} />
                    새로고침
                </button>
            </div>

            <div className="p-6 space-y-8">
                {/* 전체 요약 카드 */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
                    <Card className="shadow-sm hover:shadow-md transition-all duration-300 border-slate-200/60 overflow-hidden bg-white">
                        <CardContent className="p-0">
                            <div className="p-4 flex items-start justify-between">
                                <div>
                                    <p className="text-sm font-medium text-slate-500 uppercase tracking-wider">전체 자산</p>
                                    <p className="text-2xl lg:text-3xl font-bold mt-1.5 text-slate-900">{formatCost(summary.전체자산)}</p>
                                </div>
                                <div className="p-2 bg-blue-50 rounded-lg text-blue-600">
                                    <Wallet className="w-5 h-5" />
                                </div>
                            </div>
                            <div className="px-4 py-2 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
                                <span className="text-[10px] text-slate-400">등록 계좌</span>
                                <span className="text-xs font-semibold text-slate-600">{summary.계좌개수}개</span>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="shadow-sm hover:shadow-md transition-all duration-300 border-slate-200/60 overflow-hidden bg-white">
                        <CardContent className="p-0">
                            <div className="p-4 flex items-start justify-between">
                                <div>
                                    <p className="text-sm font-medium text-slate-500 uppercase tracking-wider">전체 매입</p>
                                    <p className="text-2xl lg:text-3xl font-bold mt-1.5 text-slate-900">{formatCost(summary.전체매입금액)}</p>
                                </div>
                                <div className="p-2 bg-slate-100 rounded-lg text-slate-600">
                                    <Banknote className="w-5 h-5" />
                                </div>
                            </div>
                            <div className="px-4 py-2 bg-slate-50 border-t border-slate-100" />
                        </CardContent>
                    </Card>

                    <Card className="shadow-sm hover:shadow-md transition-all duration-300 border-slate-200/60 overflow-hidden bg-white">
                        <CardContent className="p-0">
                            <div className="p-4 flex items-start justify-between">
                                <div>
                                    <p className="text-sm font-medium text-slate-500 uppercase tracking-wider">전체 평가손익</p>
                                    <p className={cn(
                                        "text-2xl lg:text-3xl font-bold mt-1.5",
                                        summary.전체평가손익 >= 0 ? "text-red-600" : "text-blue-600"
                                    )}>
                                        {summary.전체평가손익 >= 0 ? '+' : ''}{formatCost(summary.전체평가손익)}
                                    </p>
                                </div>
                                <div className={cn(
                                    "p-2 rounded-lg",
                                    summary.전체평가손익 >= 0 ? "bg-red-50 text-red-600" : "bg-blue-50 text-blue-600"
                                )}>
                                    {summary.전체평가손익 >= 0 ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
                                </div>
                            </div>
                            <div className="px-4 py-2 bg-slate-50 border-t border-slate-100" />
                        </CardContent>
                    </Card>

                    <Card className="shadow-sm hover:shadow-md transition-all duration-300 border-slate-200/60 overflow-hidden bg-white">
                        <CardContent className="p-0">
                            <div className="p-4 flex items-start justify-between">
                                <div>
                                    <p className="text-sm font-medium text-slate-500 uppercase tracking-wider">전체 수익률</p>
                                    <p className={cn(
                                        "text-2xl lg:text-3xl font-bold mt-1.5",
                                        summary.전체수익률.startsWith('-') ? "text-blue-600" : "text-red-600"
                                    )}>
                                        {summary.전체수익률}
                                    </p>
                                </div>
                                <div className={cn(
                                    "p-2 rounded-lg",
                                    summary.전체수익률.startsWith('-') ? "bg-blue-50 text-blue-600" : "bg-red-50 text-red-600"
                                )}>
                                    <TrendingUp className="w-5 h-5" />
                                </div>
                            </div>
                            <div className="px-4 py-2 bg-slate-50 border-t border-slate-100" />
                        </CardContent>
                    </Card>
                </div>

                {/* 차트 영역 */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <Card className="shadow-sm border-slate-200">
                        <CardHeader className="py-3 px-4 border-b border-slate-100 flex flex-row items-center gap-2">
                            <PieChartIcon className="w-4 h-4 text-slate-400" />
                            <CardTitle className="text-sm font-bold">증권사별 자산 비중</CardTitle>
                        </CardHeader>
                        <CardContent className="p-4 h-[280px]">
                            <ReactECharts option={pieOption} style={{ height: '100%' }} />
                        </CardContent>
                    </Card>

                    <Card className="shadow-sm border-slate-200">
                        <CardHeader className="py-3 px-4 border-b border-slate-100 flex flex-row items-center gap-2">
                            <BarChart3 className="w-4 h-4 text-slate-400" />
                            <CardTitle className="text-sm font-bold">증권사별 평가손익</CardTitle>
                        </CardHeader>
                        <CardContent className="p-4 h-[280px]">
                            <ReactECharts option={barOption} style={{ height: '100%' }} />
                        </CardContent>
                    </Card>
                </div>

                {/* 증권사별 상세 카드 */}
                <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2 pt-2">
                    <Building2 className="w-4 h-4 text-primary" />
                    증권사별 상세 현황
                </h2>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {accountList.map((acc) => {
                        const brokerColor = acc.id === 'kis' ? '#80624c' : acc.id === 'ls' ? '#003378' : '#e4007f'
                        const BrokerIcon = acc.id === 'kis' ? Landmark : acc.id === 'ls' ? Store : Building2
                        
                        return (
                            <Card key={acc.id} className="shadow-sm hover:shadow-md transition-all duration-300 border-slate-200/80 hover:border-slate-300 bg-white">
                                <CardHeader className="py-4 px-5 border-b border-slate-100 flex flex-row items-center gap-2 bg-white rounded-t-xl">
                                    <div 
                                        className="px-3 py-1.5 rounded-md text-white font-bold text-sm flex items-center gap-1.5 shadow-sm"
                                        style={{ backgroundColor: brokerColor }}
                                    >
                                        <BrokerIcon className="w-4 h-4" />
                                        {acc.증권사명}
                                    </div>
                                    <span className="text-sm font-mono text-slate-400 ml-1">
                                        ({acc.계좌번호})
                                    </span>
                                </CardHeader>
                                <CardContent className="p-5">
                                    <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                                        {/* Row 1 */}
                                        <div className="flex justify-between items-center">
                                            <span className="text-slate-500">종목수</span>
                                            <span className="font-bold text-slate-800">{acc.보유종목수}개</span>
                                        </div>
                                        <div className="flex justify-between items-center">
                                            <span className="text-slate-500">수익률</span>
                                            <span className={cn(
                                                "font-bold",
                                                acc.수익률.startsWith('-') ? "text-blue-600" : "text-red-600"
                                            )}>
                                                {acc.수익률}
                                            </span>
                                        </div>
                                        
                                        {/* Row 2 */}
                                        <div className="flex justify-between items-center">
                                            <span className="text-slate-500">총자산</span>
                                            <span className="font-bold text-slate-800">{formatCost(acc.총자산)}</span>
                                        </div>
                                        <div className="flex justify-between items-center">
                                            <span className="text-slate-500">매입금액</span>
                                            <span className="font-bold text-slate-800">{formatCost(acc.매입금액)}</span>
                                        </div>

                                        {/* Row 3 */}
                                        <div className="flex justify-between items-center">
                                            <span className="text-slate-500">평가손익</span>
                                            <span className={cn(
                                                "font-bold",
                                                acc.평가손익 >= 0 ? "text-red-600" : "text-blue-600"
                                            )}>
                                                {acc.평가손익 > 0 ? '+' : ''}{formatCost(acc.평가손익)}
                                            </span>
                                        </div>
                                        <div className="flex justify-between items-center">
                                            <span className="text-slate-500">주문가능</span>
                                            <span className="font-bold text-sky-500">{formatCost(acc.주문가능금액)}</span>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        )
                    })}
                </div>
            </div>
        </div>
    )
}
