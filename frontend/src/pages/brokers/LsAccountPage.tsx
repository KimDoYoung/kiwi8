import { useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AgGridReact } from 'ag-grid-react'
import type { ColDef } from 'ag-grid-community'
import { AllCommunityModule, ModuleRegistry } from 'ag-grid-community'
import { useModalStore } from '@/store/modalStore'
import { useStockDetailStore } from '@/store/stockDetailStore'
import { useLayoutStore } from '@/store/layoutStore'
import api from '@/shared/lib/api'
import {
    toNum, fmt,
    ProfitCell, RateCell, WeightCell, CodeCell, ActionCell,
    numComparator, exportCsv, AccountHeader,
} from './accountUtils'
import { GroupRadioButton } from '@/shared/components/GroupRadioButton'
import Loading from '@/shared/components/Loading'
import LoadingFail from '@/shared/components/LoadingFail'
import { fetchMenuTree } from '@/services/menuService'

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

    const { data, isLoading, error, refetch } = useQuery({
        queryKey: ['stkcompany', 'ls', 'account'],
        queryFn: fetchLsAccount,
        staleTime: 1000 * 30,
    })

    const [profitFilter, setProfitFilter] = useState('all')

    const accountData = data?.data ?? {}
    const rawStocks: Record<string, unknown>[] =
        (accountData as any)?.t0424OutBlock1 ??
        (accountData as any)?.t0424OutBlock_1 ??
        (accountData as any)?.output1 ??
        []

    const stocks = useMemo(() => {
        const list: Record<string, unknown>[] = rawStocks.map((s) => {
            const code = String(s['종목번호'] ?? s['종목코드'] ?? '')
            return {
                ...s,
                종목번호: code.startsWith('A') ? code.slice(1) : code,
            }
        })

        if (profitFilter === 'minus') return list.filter(s => toNum(s['평가손익']) < 0)
        if (profitFilter === 'plus') return list.filter(s => toNum(s['평가손익']) > 0)
        return list
    }, [rawStocks, profitFilter])

    const summary =
        (accountData as any)?.t0424OutBlock ??
        (accountData as any)?.output2?.[0] ??
        {}

    const totalMaeip = useMemo(() =>
        stocks.reduce((sum, s) => sum + toNum(s['매입금액']), 0), [stocks])

    const 예수금 = toNum(summary['추정D2예수금'])
    const 잔고평가 = toNum(summary['평가금액'])
    const 손익 = toNum(summary['평가손익'])

    const sumMaeip = useMemo(() => stocks.reduce((s, r) => s + toNum(r['매입금액']), 0), [stocks])
    const sumPyeong = useMemo(() => stocks.reduce((s, r) => s + toNum(r['평가금액']), 0), [stocks])
    const sumSonik = useMemo(() => stocks.reduce((s, r) => s + toNum(r['평가손익']), 0), [stocks])

    const gridData = useMemo(() => [
        ...stocks,
        { 종목명: '합계', 매입금액: sumMaeip, 평가금액: sumPyeong, 평가손익: sumSonik, _isSummary: true },
    ], [stocks, sumMaeip, sumPyeong, sumSonik])

    const colDefs = useMemo<ColDef[]>(() => [
        {
            headerName: '종목코드', width: 100, pinned: 'left',
            valueGetter: (p) => p.data?._isSummary ? '' : (p.data?.종목번호 ?? p.data?.종목코드 ?? ''),
            cellRenderer: CodeCell,
            comparator: (a: string, b: string) => a.localeCompare(b),
        },
        { field: '종목명', headerName: '종목명', width: 150, pinned: 'left' },
        {
            field: '전일대비', headerName: '전일대비', width: 100, type: 'numericColumn',
            cellRenderer: (p: any) => (p.data?._isSummary && toNum(p.value) === 0) ? '' : <ProfitCell {...p} />,
            comparator: numComparator,
        },
        {
            field: '평균단가', headerName: '매입평단', width: 110, type: 'numericColumn',
            valueFormatter: ({ value, data }) => (data?._isSummary || toNum(value) === 0) ? '' : fmt(toNum(value)),
            comparator: numComparator,
        },
        {
            field: '현재가', headerName: '현재가', width: 110, type: 'numericColumn',
            valueFormatter: ({ value, data }) => (data?._isSummary || toNum(value) === 0) ? '' : fmt(toNum(value)),
            comparator: numComparator,
        },
        {
            field: '1주당', headerName: '1주당', width: 100, type: 'numericColumn',
            cellRenderer: (p: any) => (p.data?._isSummary && toNum(p.value) === 0) ? '' : <ProfitCell {...p} />,
            comparator: numComparator,
        },
        {
            field: '잔고수량', headerName: '수량', width: 80, type: 'numericColumn',
            valueFormatter: ({ value, data }) => (data?._isSummary || toNum(value) === 0) ? '' : fmt(toNum(value)),
            comparator: numComparator,
        },
        {
            headerName: '비중(%)', width: 85, type: 'numericColumn',
            valueGetter: (p) => {
                if (p.data?._isSummary) return (sumMaeip > 0 ? sumMaeip / totalMaeip * 100 : 0)
                return totalMaeip > 0 ? toNum(p.data?.매입금액) / totalMaeip * 100 : 0
            },
            cellRenderer: (p: any) => (p.data?._isSummary && p.value === 0) ? '' : <WeightCell {...p} />,
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
        },
        {
            field: '평가손익', headerName: '손익금액', width: 120, type: 'numericColumn',
            cellRenderer: (params: any) => (params.data?._isSummary && toNum(params.value) === 0) ? '' : <ProfitCell {...params} />,
            comparator: numComparator,
        },
        {
            field: '수익율', headerName: '손익율(%)', width: 95, type: 'numericColumn',
            cellRenderer: (params: any) => (params.data?._isSummary && toNum(params.value) === 0) ? '' : <RateCell {...params} />,
            comparator: numComparator,
        },
        { 
            field: '가격추세', headerName: '추세', width: 100, sortable: false,
            valueGetter: (p) => p.data?._isSummary ? '' : (p.data?.가격추세 ?? '')
        },
        {
            headerName: '', width: 145, sortable: false, resizable: false,
            cellRenderer: (p: any) => p.data?._isSummary ? null : (
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
    ], [totalMaeip, sumMaeip, openOrderModal])

    const defaultColDef = useMemo<ColDef>(() => ({
        sortable: true, resizable: true,
    }), [])

    const onRowDoubleClicked = (p: any) => {
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
            >
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
                            className: 'data-[state=on]:bg-gray-200 data-[state=on]:text-gray-800 data-[state=on]:border-gray-400'
                        },
                        {
                            label: '+',
                            value: 'plus',
                            className: 'data-[state=on]:bg-red-100 data-[state=on]:text-red-700 data-[state=on]:border-red-300'
                        },
                    ]}
                    value={profitFilter}
                    onValueChange={setProfitFilter}
                    className="h-[26px] bg-white"
                    itemClassName="h-[24px] text-xs px-3"
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
