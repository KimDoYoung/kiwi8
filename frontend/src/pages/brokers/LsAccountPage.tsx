import { useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AgGridReact, type CustomCellRendererProps } from 'ag-grid-react'
import type { ColDef, RowDoubleClickedEvent } from 'ag-grid-community'
import { AllCommunityModule, ModuleRegistry } from 'ag-grid-community'
import { useModalStore } from '@/store/modalStore'
import { useStockDetailStore } from '@/store/stockDetailStore'
import { useLayoutStore } from '@/store/layoutStore'
import api from '@/lib/api'
import { toNum, fmt, numComparator, exportCsv } from '@/lib/utils'
import {
    ProfitCell, RateCell, WeightCell, CodeCell, ActionCell, AccountHeader, PrevDayCell,
} from './AccountGridComponents'
import { GroupRadioButton } from '@/shared/components/GroupRadioButton'
import Loading from '@/shared/components/Loading'
import LoadingFail from '@/shared/components/LoadingFail'
import { TrendBadge } from '@/shared/components/TrendBadge'
import { fetchMenuTree } from '@/services/menuService'
import { getMarketStatus } from '@/services/stockService'
import { Switch } from '@/shared/components/ui/switch'
import { Label } from '@/shared/components/ui/label'
import { StockFilterButton } from '@/shared/components/StockFilterButton'
import { type StockOption } from '@/shared/components/StocksSelectBox'

ModuleRegistry.registerModules([AllCommunityModule])

async function fetchLsAccount() {
    const res = await api.get('/api/v1/stkcompany/ls/account/list')
    return res.data
}

export default function LsAccountPage() {
    const gridRef = useRef<AgGridReact>(null)
    const openOrderModal = useModalStore((s) => s.openOrderModal)
    const setStock = useStockDetailStore((s) => s.setStock)
    const openByScreenNo = useLayoutStore((s) => s.openByScreenNo)

    const { data: menus } = useQuery({
        queryKey: ['menus'],
        queryFn: fetchMenuTree,
        staleTime: 1000 * 60 * 10,
    })

    const { data, isLoading, error, refetch, isFetching } = useQuery({
        queryKey: ['stkcompany', 'ls', 'account'],
        queryFn: fetchLsAccount,
        staleTime: 1000 * 30,
    })

    const { data: marketStatus } = useQuery({
        queryKey: ['marketStatus'],
        queryFn: getMarketStatus,
        refetchInterval: 60_000,
    })

    const [profitFilter, setProfitFilter] = useState('all')
    const [isSimpleView, setIsSimpleView] = useState(false)
    const [filterCodes, setFilterCodes] = useState<string[]>([])

    const accountData = useMemo(() => data?.data ?? {}, [data])
    const rawStocks = useMemo<Record<string, unknown>[]>(() => {
        const d = accountData as Record<string, unknown>
        return (d.t0424OutBlock1 ?? d.t0424OutBlock_1 ?? d.output1 ?? []) as Record<string, unknown>[]
    }, [accountData])

    const uniqueStocks = useMemo<StockOption[]>(() => {
        const seen = new Set<string>()
        const list: StockOption[] = []
        rawStocks.forEach((s: Record<string, unknown>) => {
            const code = String(s['종목번호'] ?? s['종목코드'] ?? '')
            const cleanCode = code.startsWith('A') ? code.slice(1) : code
            const name = String(s['종목명'] ?? '')
            if (cleanCode && !seen.has(cleanCode)) {
                seen.add(cleanCode)
                list.push({ stk_cd: cleanCode, stk_nm: name })
            }
        })
        return list.sort((a, b) => a.stk_nm.localeCompare(b.stk_nm))
    }, [rawStocks])

    const stocks = useMemo(() => {
        let list: Record<string, unknown>[] = rawStocks.map((s) => {
            const code = String(s['종목번호'] ?? s['종목코드'] ?? '')
            return {
                ...s,
                종목번호: code.startsWith('A') ? code.slice(1) : code,
            }
        })

        if (filterCodes.length > 0) {
            list = list.filter(s => filterCodes.includes(String(s.종목번호)))
        }

        if (profitFilter === 'minus') return list.filter(s => toNum(s['평가손익']) < 0)
        if (profitFilter === 'plus') return list.filter(s => toNum(s['평가손익']) > 0)
        return list
    }, [rawStocks, profitFilter, filterCodes])

    const summary = useMemo(() => {
        const d = accountData as Record<string, unknown>
        return (d.t0424OutBlock ?? (d.output2 as Record<string, unknown>[])?.[0] ?? {}) as Record<string, unknown>
    }, [accountData])

    const totalMaeip = useMemo(() =>
        rawStocks.reduce((sum, s) => sum + toNum(s['매입금액']), 0), [rawStocks])

    const 예수금 = toNum(summary['추정D2예수금'])
    const 잔고평가 = toNum(summary['평가금액'])
    const 손익 = toNum(summary['평가손익'])

    const sumMaeip = useMemo(() => stocks.reduce((s, r) => s + toNum(r['매입금액']), 0), [stocks])
    const sumPyeong = useMemo(() => stocks.reduce((s, r) => s + toNum(r['평가금액']), 0), [stocks])
    const sumSonik = useMemo(() => stocks.reduce((s, r) => s + toNum(r['평가손익']), 0), [stocks])

    const gridData = useMemo(() => [
        ...stocks,
        { 
            종목명: '합계', 
            매입금액: sumMaeip, 
            평가금액: sumPyeong, 
            평가손익: sumSonik, 
            수익율: sumMaeip !== 0 ? (sumSonik / sumMaeip) * 100 : 0,
            _isSummary: true 
        },
    ], [stocks, sumMaeip, sumPyeong, sumSonik])

    const colDefs = useMemo<ColDef[]>(() => {
        const allCols: (ColDef & { simple?: boolean })[] = [
            {
                headerName: '종목코드', width: 100, pinned: 'left', simple: true,
                valueGetter: (p) => p.data?._isSummary ? '' : (p.data?.종목번호 ?? p.data?.종목코드 ?? ''),
                cellRenderer: CodeCell,
                comparator: (a: string, b: string) => a.localeCompare(b),
            },
            { field: '종목명', headerName: '종목명', width: 150, pinned: 'left', simple: true },
            {
                field: '전일대비', headerName: '전일대비', width: 130, simple: true,
                cellRenderer: (p: CustomCellRendererProps) => p.data?._isSummary ? '' : <PrevDayCell value={toNum(p.value)} rate={toNum(p.data?.전일대비율)} />,
                comparator: numComparator,
            },
            {
                field: '평균단가', headerName: '매입평단', width: 110, type: 'numericColumn',
                valueFormatter: ({ value, data }) => (data?._isSummary || toNum(value) === 0) ? '' : fmt(toNum(value)),
                comparator: numComparator,
            },
            {
                field: '현재가', headerName: '현재가', width: 110, type: 'numericColumn', simple: true,
                valueFormatter: ({ value, data }) => (data?._isSummary || toNum(value) === 0) ? '' : fmt(toNum(value)),
                comparator: numComparator,
            },
            {
                field: '1주당', headerName: '1주당', width: 100, type: 'numericColumn', simple: true,
                cellRenderer: (p: CustomCellRendererProps) => (p.data?._isSummary && toNum(p.value) === 0) ? '' : <ProfitCell {...p} />,
                comparator: numComparator,
            },
            {
                field: '잔고수량', headerName: '수량', width: 80, type: 'numericColumn', simple: true,
                valueFormatter: ({ value, data }) => (data?._isSummary || toNum(value) === 0) ? '' : fmt(toNum(value)),
                comparator: numComparator,
            },
            {
                headerName: '비중(%)', width: 85, type: 'numericColumn', simple: false,
                valueGetter: (p) => {
                    if (p.data?._isSummary) return (sumMaeip > 0 ? sumMaeip / totalMaeip * 100 : 0)
                    return totalMaeip > 0 ? toNum(p.data?.매입금액) / totalMaeip * 100 : 0
                },
                cellRenderer: (p: CustomCellRendererProps) => (p.data?._isSummary && p.value === 0) ? '' : <WeightCell {...p} />,
                comparator: numComparator,
            },
            {
                field: '매입금액', headerName: '매입금액', width: 120, type: 'numericColumn',
                valueFormatter: ({ value, data }) => (data?._isSummary && toNum(value) === 0) ? '' : fmt(toNum(value)),
                comparator: numComparator,
            },
            {
                field: '평가금액', headerName: '평가금액', width: 120, type: 'numericColumn', simple: true,
                valueFormatter: ({ value, data }) => (data?._isSummary && toNum(value) === 0) ? '' : fmt(toNum(value)),
                comparator: numComparator,
            },
            {
                field: '평가손익', headerName: '손익금액', width: 120, type: 'numericColumn', simple: true,
                cellRenderer: (p: CustomCellRendererProps) => (p.data?._isSummary && toNum(p.value) === 0) ? '' : <ProfitCell {...p} />,
                comparator: numComparator,
            },
            {
                field: '수익율', headerName: '손익율(%)', width: 95, type: 'numericColumn', simple: true,
                cellRenderer: (p: CustomCellRendererProps) => (p.data?._isSummary && toNum(p.value) === 0) ? '' : <RateCell {...p} />,
                comparator: numComparator,
            },
            { 
                field: '가격추세', headerName: '추세', width: 106, sortable: false,
                cellRenderer: (p: CustomCellRendererProps) => p.data?._isSummary ? '' : <TrendBadge trend={p.data?.가격추세} />,
            },
            {
                headerName: '', width: 145, sortable: false, resizable: false, simple: false,
                cellRenderer: (p: CustomCellRendererProps) => p.data?._isSummary ? null : (
                    <ActionCell 
                        onBuy={() => openOrderModal({
                            stk_cd: p.data?.종목번호 ?? p.data?.종목코드,
                            stk_nm: p.data?.종목명,
                            price: toNum(p.data?.현재가),
                            qty: 1,
                            broker: 'ls',
                            order_type: 'buy'
                        })}
                        onSell={() => openOrderModal({
                            stk_cd: p.data?.종목번호 ?? p.data?.종목코드,
                            stk_nm: p.data?.종목명,
                            price: toNum(p.data?.현재가),
                            qty: toNum(p.data?.잔고수량),
                            broker: 'ls',
                            order_type: 'sell'
                        })}
                    />
                ),
            },
        ]

        const strip = (cols: (ColDef & { simple?: boolean })[]) => cols.map(({ simple: _, ...col }) => col)
        return isSimpleView ? strip(allCols.filter(col => col.simple)) : strip(allCols)
    }, [totalMaeip, sumMaeip, openOrderModal, isSimpleView])

    const defaultColDef = useMemo<ColDef>(() => ({
        sortable: true, resizable: true,
    }), [])

    const onRowDoubleClicked = (p: RowDoubleClickedEvent) => {
        if (p.data?._isSummary) return
        const code = p.data?.종목번호 ?? p.data?.종목코드
        const name = p.data?.종목명
        setStock(code, name)
        openByScreenNo('1201', menus || [])
    }

    if (isLoading) {
        return <Loading message="LS 계좌 정보를 불러오는 중..." />
    }

    if (error || !data || data.success === false) {
        return <LoadingFail message={data?.error_message || 'LS 계좌 정보를 불러오는데 실패했습니다.'} />
    }

    return (
        <div className="flex flex-col h-full text-base">
            <AccountHeader
                title="LS 계좌현황" screenNo="3101" count={stocks.length}
                예수금Label="예수금" 예수금={예수금}
                평가금액Label="평가금액" 평가금액={잔고평가}
                손익={손익}
                onCsv={() => exportCsv(gridRef, 'LS_계좌현황.csv')}
                onRefresh={() => refetch()}
                isLoading={isFetching}
                enabled={marketStatus?.is_open}
            >
                <div className="flex items-center gap-2 mr-4 bg-white px-3 py-1 rounded-md border border-gray-200 h-[26px]">
                    <Label htmlFor="simple-view" className="text-xs text-gray-600 cursor-pointer">간단히</Label>
                    <Switch
                        id="simple-view"
                        checked={isSimpleView}
                        onCheckedChange={setIsSimpleView}
                    />
                </div>
                <GroupRadioButton
                    options={[
                        {
                            label: '-',
                            value: 'minus',
                            className: 'data-[state=on]:bg-blue-100 data-[state=on]:text-blue-700 data-[state=on]:border-blue-300'
                        },
                        {
                            label: '全',
                            value: 'all',
                            className: 'data-[state=on]:bg-gray-200 data-[state=on]:text-gray-800 data-[state=on]:border-gray-300'
                        },
                        {
                            label: '+',
                            value: 'plus',
                            className: 'data-[state=on]:bg-red-100 data-[state=on]:text-red-700 data-[state=on]:border-red-300'
                        },
                    ]}
                    value={profitFilter}
                    onValueChange={setProfitFilter}
                    className="h-[26px] bg-white mr-4"
                    itemClassName="h-[24px] text-xs px-3"
                />

                <StockFilterButton 
                    uniqueStocks={uniqueStocks} 
                    filterCodes={filterCodes} 
                    onFilterChange={setFilterCodes} 
                />
            </AccountHeader>

            <div className="flex-1 ag-theme-alpine overflow-hidden">
                <AgGridReact
                    ref={gridRef}
                    rowData={gridData}
                    columnDefs={colDefs}
                    defaultColDef={defaultColDef}
                    domLayout="normal"
                    headerHeight={36}
                    rowHeight={32}
                    onRowDoubleClicked={onRowDoubleClicked}
                    postSortRows={({ nodes }) => {
                        const idx = nodes.findIndex(n => n.data?._isSummary)
                        if (idx > -1) nodes.push(nodes.splice(idx, 1)[0])
                    }}
                    getRowClass={(p) => p.data?._isSummary ? 'summary-row' : ''}
                />
            </div>
        </div>
    )
}
