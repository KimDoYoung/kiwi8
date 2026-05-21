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

async function fetchKisAccount() {
    const res = await api.get('/api/v1/stkcompany/kis/account/list')
    return res.data
}

export default function KisAccountPage() {
    const gridRef = useRef<AgGridReact>(null)
    const openOrderModal = useModalStore((s) => s.openOrderModal)
    const setStock = useStockDetailStore((s) => s.setStock)
    const openByScreenNo = useLayoutStore((s) => s.openByScreenNo)
    const [isSimpleView, setIsSimpleView] = useState(false)
    const [filterCodes, setFilterCodes] = useState<string[]>([])

    const { data: menus } = useQuery({
        queryKey: ['menus'],
        queryFn: fetchMenuTree,
        staleTime: 1000 * 60 * 10,
    })

    const { data, isLoading, error, refetch, isFetching } = useQuery({
        queryKey: ['stkcompany', 'kis', 'account'],
        queryFn: fetchKisAccount,
        staleTime: 1000 * 30,
    })

    const { data: marketStatus } = useQuery({
        queryKey: ['marketStatus'],
        queryFn: getMarketStatus,
        refetchInterval: 60_000,
    })

    const rawStocks = useMemo<Record<string, unknown>[]>(() => data?.data?.output1 ?? [], [data])
    const summary = data?.data?.output2?.[0] ?? {}

    const uniqueStocks = useMemo<StockOption[]>(() => {
        const seen = new Set<string>()
        const list: StockOption[] = []
        rawStocks.forEach((s: Record<string, unknown>) => {
            const code = String(s['상품번호'] ?? '')
            const cleanCode = code.startsWith('A') ? code.slice(1) : code
            const name = String(s['상품명'] ?? '')
            if (cleanCode && !seen.has(cleanCode)) {
                seen.add(cleanCode)
                list.push({ stk_cd: cleanCode, stk_nm: name })
            }
        })
        return list.sort((a, b) => a.stk_nm.localeCompare(b.stk_nm))
    }, [rawStocks])

    const [profitFilter, setProfitFilter] = useState('all')

    const filteredStocks = useMemo(() => {
        let list = rawStocks

        if (filterCodes.length > 0) {
            list = list.filter(s => {
                const code = String(s['상품번호'] ?? '')
                const cleanCode = code.startsWith('A') ? code.slice(1) : code
                return filterCodes.includes(cleanCode)
            })
        }

        if (profitFilter === 'minus') return list.filter(s => toNum(s['평가손익금액']) < 0)
        if (profitFilter === 'plus') return list.filter(s => toNum(s['평가손익금액']) > 0)
        return list
    }, [rawStocks, profitFilter, filterCodes])

    const totalMaeip = useMemo(() =>
        rawStocks.reduce((sum, s) => sum + toNum(s['매입금액']), 0), [rawStocks])

    const 예수금 = toNum(summary['예수금총금액'])
    const 평가금액 = toNum(summary['총평가금액'])
    const 손익 = toNum(summary['평가손익합계금액'])

    const sumMaeip = useMemo(() => filteredStocks.reduce((s, r) => s + toNum(r['매입금액']), 0), [filteredStocks])
    const sumPyeong = useMemo(() => filteredStocks.reduce((s, r) => s + toNum(r['평가금액']), 0), [filteredStocks])
    const sumSonik = useMemo(() => filteredStocks.reduce((s, r) => s + toNum(r['평가손익금액']), 0), [filteredStocks])

    const gridData = useMemo(() => [
        ...filteredStocks,
        { 
            상품명: '합계', 
            매입금액: sumMaeip, 
            평가금액: sumPyeong, 
            평가손익금액: sumSonik, 
            평가손익율: sumMaeip !== 0 ? (sumSonik / sumMaeip) * 100 : 0,
            _isSummary: true 
        },
    ], [filteredStocks, sumMaeip, sumPyeong, sumSonik])

    const colDefs = useMemo<ColDef[]>(() => {
        const allCols: (ColDef & { simple?: boolean })[] = [
            {
                headerName: '종목코드', width: 100, pinned: 'left', simple: true,
                valueGetter: (p) => {
                    if (p.data?._isSummary) return ''
                    const code = String(p.data?.상품번호 ?? '')
                    return code.startsWith('A') ? code.slice(1) : code
                },
                cellRenderer: CodeCell,
                comparator: (a: string, b: string) => a.localeCompare(b),
            },
            { field: '상품명', headerName: '종목명', width: 150, pinned: 'left', simple: true },
            {
                field: '전일대비', headerName: '전일대비', width: 130, simple: true,
                cellRenderer: (p: CustomCellRendererProps) => p.data?._isSummary ? '' : <PrevDayCell value={toNum(p.value)} rate={toNum(p.data?.전일대비율)} />,
                comparator: numComparator,
                simple: true,
            },
            {
                field: '매입평균가격', headerName: '매입평단', width: 100, type: 'numericColumn',
                valueFormatter: ({ value, data }) => (data?._isSummary && toNum(value) === 0) ? '' : fmt(Math.round(toNum(value))), 
                comparator: numComparator,
            },
            {
                field: '현재가', headerName: '현재가', width: 100, type: 'numericColumn', simple: true,
                valueFormatter: ({ value, data }) => (data?._isSummary && toNum(value) === 0) ? '' : fmt(toNum(value)),
                comparator: numComparator,
            },
            {
                field: '1주당', headerName: '1주당', width: 100, type: 'numericColumn',
                cellRenderer: (p: CustomCellRendererProps) => (p.data?._isSummary && toNum(p.value) === 0) ? '' : <ProfitCell {...p} />,
                comparator: numComparator,
                simple: true,
            },
            {
                field: '보유수량', headerName: '수량', width: 70, type: 'numericColumn',
                valueFormatter: ({ value, data }) => (data?._isSummary && toNum(value) === 0) ? '' : fmt(toNum(value)),
                comparator: numComparator,
                simple: true,
            },
            {
                headerName: '비중(%)', width: 85, type: 'numericColumn',
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
                field: '평가금액', headerName: '평가금액', width: 120, type: 'numericColumn',
                valueFormatter: ({ value, data }) => (data?._isSummary && toNum(value) === 0) ? '' : fmt(toNum(value)),
                comparator: numComparator,
                simple: true,
            },
            {
                field: '평가손익금액', headerName: '손익금액', width: 120, type: 'numericColumn',
                cellRenderer: (p: CustomCellRendererProps) => (p.data?._isSummary && toNum(p.value) === 0) ? '' : <ProfitCell {...p} />,
                comparator: numComparator,
                simple: true,
            },
            {
                field: '평가손익율', headerName: '손익율(%)', width: 95, type: 'numericColumn',
                cellRenderer: (p: CustomCellRendererProps) => (p.data?._isSummary && toNum(p.value) === 0) ? '' : <RateCell {...p} />,
                comparator: numComparator,
                simple: true,
            },
            { 
                field: '가격추세', headerName: '추세', width: 106, sortable: false,
                cellRenderer: (p: CustomCellRendererProps) => p.data?._isSummary ? '' : <TrendBadge trend={p.data?.가격추세} />,
            },
            {
                headerName: '', width: 145, sortable: false, resizable: false,
                cellRenderer: (p: CustomCellRendererProps) => p.data?._isSummary ? null : (
                    <ActionCell 
                        onBuy={() => openOrderModal({
                            stk_cd: String(p.data?.상품번호 ?? '').replace(/^A/, ''),
                            stk_nm: p.data?.상품명,
                            price: toNum(p.data?.현재가),
                            qty: 1,
                            broker: 'kis',
                            order_type: 'buy'
                        })}
                        onSell={() => openOrderModal({
                            stk_cd: String(p.data?.상품번호 ?? '').replace(/^A/, ''),
                            stk_nm: p.data?.상품명,
                            price: toNum(p.data?.현재가),
                            qty: toNum(p.data?.보유수량),
                            broker: 'kis',
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
        const code = String(p.data?.상품번호 ?? '').replace(/^A/, '')
        const name = p.data?.상품명
        setStock(code, name)
        openByScreenNo('1201', menus || [])
    }

    if (isLoading) {
        return <Loading message="KIS 계좌 정보를 불러오는 중..." />
    }

    if (error || !data) {
        return <LoadingFail message="KIS 계좌 정보를 불러오는데 실패했습니다." />
    }

    return (
        <div className="flex flex-col h-full text-base">
            <AccountHeader
                title="KIS 계좌현황" screenNo="2101" count={filteredStocks.length}
                예수금={예수금} 평가금액={평가금액} 손익={손익}
                onCsv={() => exportCsv(gridRef, 'KIS_계좌현황.csv')}
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
