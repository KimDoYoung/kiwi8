import { useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AgGridReact, type CustomCellRendererProps } from 'ag-grid-react'
import type { ColDef } from 'ag-grid-community'
import { AllCommunityModule, ModuleRegistry } from 'ag-grid-community'
import { useStockDetailStore } from '@/store/stockDetailStore'
import { useLayoutStore } from '@/store/layoutStore'
import api from '@/lib/api'
import {
    toNum, fmt,
    ProfitCell, RateCell, CodeCell,
    numComparator, exportCsv, AccountHeader,
} from '../brokers/accountUtils'
import { GroupRadioButton } from '@/shared/components/GroupRadioButton'
import Loading from '@/shared/components/Loading'
import LoadingFail from '@/shared/components/LoadingFail'
import { TrendBadge } from '@/shared/components/TrendBadge'
import { fetchMenuTree } from '@/services/menuService'
import { Switch } from '@/shared/components/ui/switch'
import { Label } from '@/shared/components/ui/label'
import { StockFilterButton } from '@/shared/components/StockFilterButton'
import { type StockOption } from '@/shared/components/StocksSelectBox'

ModuleRegistry.registerModules([AllCommunityModule])

interface StockItem {
    '종목코드'?: string;
    '종목명'?: string;
    '매입금액'?: number;
    '평가금액'?: number;
    '손익금액'?: number;
    '손익율'?: number;
    '브로커'?: string;
    '전일대비'?: number;
    '평단가'?: number;
    '현재가'?: number;
    '일주당'?: number;
    '수량'?: number;
    '가격추세'?: string;
    _isSummary?: boolean;
}

async function fetchTotalAccount() {
    const res = await api.get('/api/v1/stkcompany/total/account/list')
    return res.data
}

export default function TotalBalancePage() {
    const gridRef = useRef<AgGridReact>(null)
    const setStock = useStockDetailStore((s) => s.setStock)
    const openByScreenNo = useLayoutStore((s) => s.openByScreenNo)
    const [isSimpleView, setIsSimpleView] = useState(false)
    const [profitFilter, setProfitFilter] = useState('all')
    const [isRefreshing, setIsRefreshing] = useState(false)
    const [filterCodes, setFilterCodes] = useState<string[]>([])

    const { data: menus } = useQuery({
        queryKey: ['menus'],
        queryFn: fetchMenuTree,
        staleTime: 1000 * 60 * 10,
    })

    const { data, isLoading, error, refetch } = useQuery({
        queryKey: ['stkcompany', 'total', 'account'],
        queryFn: fetchTotalAccount,
        staleTime: 1000 * 30,
    })

    const allStocks = useMemo<StockItem[]>(() => data?.data?.totalAccountList ?? [], [data])

    const uniqueStocks = useMemo<StockOption[]>(() => {
        const seen = new Set<string>()
        const list: StockOption[] = []
        allStocks.forEach((s: StockItem) => {
            const code = String(s['종목코드'] ?? '')
            const cleanCode = code.startsWith('A') ? code.slice(1) : code
            const name = String(s['종목명'] ?? '')
            if (cleanCode && !seen.has(cleanCode)) {
                seen.add(cleanCode)
                list.push({ stk_cd: cleanCode, stk_nm: name })
            }
        })
        return list.sort((a, b) => a.stk_nm.localeCompare(b.stk_nm))
    }, [allStocks])

    const filteredStocks = useMemo(() => {
        let list = allStocks

        if (filterCodes.length > 0) {
            list = list.filter(s => {
                const code = String(s['종목코드'] ?? '')
                const cleanCode = code.startsWith('A') ? code.slice(1) : code
                return filterCodes.includes(cleanCode)
            })
        }

        if (profitFilter === 'minus') return list.filter(s => toNum(s['손익금액']) < 0)
        if (profitFilter === 'plus') return list.filter(s => toNum(s['손익금액']) > 0)
        return list
    }, [allStocks, profitFilter, filterCodes])

    const totalEval = useMemo(() =>
        allStocks.reduce((sum, s) => sum + toNum(s['평가금액']), 0), [allStocks])

    const totalProfit = useMemo(() =>
        allStocks.reduce((sum, s) => sum + toNum(s['손익금액']), 0), [allStocks])

    const sumMaeip = useMemo(() => filteredStocks.reduce((s, r) => s + toNum(r['매입금액']), 0), [filteredStocks])
    const sumPyeong = useMemo(() => filteredStocks.reduce((s, r) => s + toNum(r['평가금액']), 0), [filteredStocks])
    const sumSonik = useMemo(() => filteredStocks.reduce((s, r) => s + toNum(r['손익금액']), 0), [filteredStocks])

    const gridData = useMemo(() => [
        ...filteredStocks,
        { 
            종목명: '합계', 
            매입금액: sumMaeip, 
            평가금액: sumPyeong, 
            손익금액: sumSonik, 
            손익율: sumMaeip !== 0 ? (sumSonik / sumMaeip) * 100 : 0,
            _isSummary: true 
        },
    ], [filteredStocks, sumMaeip, sumPyeong, sumSonik])

    const colDefs = useMemo<ColDef[]>(() => {
        const allCols: (ColDef & { simple?: boolean })[] = [
            {
                field: '브로커', headerName: '증권사', width: 80, pinned: 'left', simple: true,
                cellRenderer: (p: CustomCellRendererProps) => p.data?._isSummary ? '' : p.value,
            },
            {
                headerName: '종목코드', field: '종목코드', width: 90, pinned: 'left', simple: true,
                cellRenderer: (p: CustomCellRendererProps) => p.data?._isSummary ? '' : <CodeCell value={p.data?.종목코드} />,
                comparator: (a: string, b: string) => a.localeCompare(b),
            },
            { field: '종목명', headerName: '종목명', width: 140, pinned: 'left', simple: true },
            {
                field: '전일대비', headerName: '전일대비', width: 90, type: 'numericColumn',
                cellRenderer: (p: CustomCellRendererProps) => (p.data?._isSummary && toNum(p.value) === 0) ? '' : <ProfitCell {...p} />,
                comparator: numComparator,
                simple: true,
            },
            {
                field: '평단가', headerName: '매입평단', width: 90, type: 'numericColumn',
                valueFormatter: ({ value, data }) => (data?._isSummary && toNum(value) === 0) ? '' : fmt(Math.round(toNum(value))), 
                comparator: numComparator,
            },
            {
                field: '현재가', headerName: '현재가', width: 110, type: 'numericColumn', simple: true,
                valueFormatter: ({ value, data }) => (data?._isSummary && toNum(value) === 0) ? '' : fmt(toNum(value)),
                comparator: numComparator,
            },
            {
                field: '일주당', headerName: '1주당', width: 110, type: 'numericColumn',
                cellRenderer: (p: CustomCellRendererProps) => (p.data?._isSummary && toNum(p.value) === 0) ? '' : <ProfitCell {...p} />,
                comparator: numComparator,
                simple: true,
            },
            {
                field: '수량', headerName: '수량', width: 70, type: 'numericColumn',
                valueFormatter: ({ value, data }) => (data?._isSummary && toNum(value) === 0) ? '' : fmt(toNum(value)),
                comparator: numComparator,
                simple: true,
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
                field: '손익금액', headerName: '손익금액', width: 120, type: 'numericColumn',
                cellRenderer: (p: CustomCellRendererProps) => (p.data?._isSummary && toNum(p.value) === 0) ? '' : <ProfitCell {...p} />,
                comparator: numComparator,
                simple: true,
            },
            {
                field: '손익율', headerName: '손익율(%)', width: 100, type: 'numericColumn',
                cellRenderer: (p: CustomCellRendererProps) => (p.data?._isSummary && toNum(p.value) === 0) ? '' : <RateCell {...p} value={p.value} />,
                comparator: numComparator,
                simple: true,
            },
            { 
                field: '가격추세', headerName: '추세', width: 125, sortable: false,
                cellRenderer: (p: CustomCellRendererProps) => p.data?._isSummary ? '' : <TrendBadge trend={p.data?.가격추세 as string} />,
            },
        ]

        return isSimpleView ? allCols.filter(col => col.simple) : allCols
    }, [isSimpleView])

    const defaultColDef = useMemo<ColDef>(() => ({
        sortable: true, resizable: true,
    }), [])

    const onRowDoubleClicked = (p: { data: StockItem }) => {
        if (p.data?._isSummary) return
        const code = p.data?.종목코드
        const name = p.data?.종목명
        if (code && name) {
            setStock(code, name)
            openByScreenNo('1201', menus || [])
        }
    }

    if (isLoading) {
        return <Loading message="통합 계좌 정보를 불러오는 중..." />
    }

    if (error || !data) {
        return <LoadingFail message="통합 계좌 정보를 불러오는데 실패했습니다." />
    }

    return (
        <div className="flex flex-col h-full text-base">
            <AccountHeader
                title="통합 계좌 잔고" screenNo="1102" count={filteredStocks.length}
                예수금={0} 평가금액={totalEval} 손익={totalProfit}
                onCsv={() => exportCsv(gridRef, '통합_실시간_잔고.csv')}
                onRefresh={async () => { setIsRefreshing(true); await refetch(); setIsRefreshing(false); }}
                isRefreshing={isRefreshing}
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
                        { label: '-', value: 'minus', className: 'data-[state=on]:bg-blue-100 data-[state=on]:text-blue-700' },
                        { label: '全', value: 'all', className: 'data-[state=on]:bg-gray-200 data-[state=on]:text-gray-800' },
                        { label: '+', value: 'plus', className: 'data-[state=on]:bg-red-100 data-[state=on]:text-red-700' },
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
