import { useState, useMemo, useRef, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AgGridReact } from 'ag-grid-react'
import type { ColDef, RowClickedEvent } from 'ag-grid-community'
import { AllCommunityModule, ModuleRegistry } from 'ag-grid-community'
import { RefreshCw } from 'lucide-react'
import api from '@/lib/api'
import { Button } from '@/shared/components/ui/button'
import { GroupRadioButton } from '@/shared/components/GroupRadioButton'
import type { IpoRow } from './types'
import { StatusBadge } from './components/StatusBadge'
import { MarketBadge } from './components/MarketBadge'
import { IpoDetail } from './components/IpoDetail'

ModuleRegistry.registerModules([AllCommunityModule])

async function fetchIpoList(status: string): Promise<IpoRow[]> {
    const res = await api.get('/api/v1/ipo/list', { params: status ? { status } : {} })
    return res.data?.data ?? []
}

export default function IpoListPage() {
    const gridRef = useRef<AgGridReact>(null)
    const [statusFilter, setStatusFilter] = useState('진행')
    const [selected, setSelected] = useState<IpoRow | null>(null)

    const { data = [], isFetching, refetch } = useQuery<IpoRow[]>({
        queryKey: ['ipo-list', statusFilter],
        queryFn: () => fetchIpoList(statusFilter === '전체' ? '' : statusFilter),
        staleTime: 1000 * 60 * 5,
    })

    const colDefs = useMemo<ColDef<IpoRow>[]>(() => [
        {
            headerName: '종목명', field: 'stock_name', width: 130, pinned: 'left',
            cellRenderer: ({ value }: { value: string }) => (
                <span className="font-medium text-gray-900">{value}</span>
            ),
        },
        {
            headerName: '상태', field: 'status', width: 80,
            cellRenderer: ({ value }: { value: string }) => <StatusBadge status={value} />,
        },
        {
            headerName: '시장', field: 'market_type', width: 80,
            cellRenderer: ({ value }: { value: string }) => <MarketBadge market={value} />,
        },
        { headerName: '업종',      field: 'industry',                    width: 160, tooltipField: 'industry' },
        { headerName: '희망공모가', field: 'desired_ipo_price',           width: 140 },
        { headerName: '확정공모가', field: 'final_ipo_price',             width: 110 },
        { headerName: '청약경쟁률', field: 'subscription_competition_rate', width: 110 },
        { headerName: '공모청약일', field: 'ipo_subscription_date',       width: 150 },
        { headerName: '상장일',    field: 'listing_date',                 width: 110 },
    ], [])

    const defaultColDef = useMemo<ColDef>(() => ({
        sortable: true, resizable: true, suppressMovable: false,
    }), [])

    const onRowClicked = useCallback((e: RowClickedEvent<IpoRow>) => {
        if (e.data) setSelected(e.data)
    }, [])

    const getRowClass = useCallback(({ data }: { data?: IpoRow }) =>
        data?.track_id === selected?.track_id ? 'ag-row-selected' : '', [selected])

    return (
        <div className="flex h-full overflow-hidden">
            {/* ── 좌측: 리스트 ── */}
            <div className="flex flex-col w-[55%] min-w-[420px] border-r border-gray-200 overflow-hidden">
                {/* 툴바 */}
                <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border-b border-gray-200 flex-shrink-0">
                    <span className="text-sm font-semibold text-gray-700 mr-1">공모주 목록</span>
                    <GroupRadioButton
                        options={[
                            { label: '진행',     value: '진행',     className: 'data-[state=on]:bg-green-100 data-[state=on]:text-green-800 data-[state=on]:border-green-300' },
                            { label: '상장',     value: '상장',     className: 'data-[state=on]:bg-sky-100   data-[state=on]:text-sky-800   data-[state=on]:border-sky-300'   },
                            { label: '공모철회', value: '공모철회', className: 'data-[state=on]:bg-gray-200  data-[state=on]:text-gray-700  data-[state=on]:border-gray-300'  },
                            { label: '전체',     value: '전체',     className: 'data-[state=on]:bg-indigo-100 data-[state=on]:text-indigo-800 data-[state=on]:border-indigo-300' },
                        ]}
                        value={statusFilter}
                        onValueChange={setStatusFilter}
                        className="h-[26px] bg-white"
                        itemClassName="h-[24px] text-xs px-2"
                    />
                    <span className="ml-auto text-xs text-gray-400">{data.length}건</span>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => refetch()} disabled={isFetching}>
                        <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} />
                    </Button>
                </div>

                {/* AG Grid */}
                <div className="flex-1 ag-theme-alpine overflow-hidden">
                    <AgGridReact<IpoRow>
                        ref={gridRef}
                        rowData={data}
                        columnDefs={colDefs}
                        defaultColDef={defaultColDef}
                        domLayout="normal"
                        headerHeight={34}
                        rowHeight={30}
                        onRowClicked={onRowClicked}
                        getRowClass={getRowClass}
                        tooltipShowDelay={300}
                    />
                </div>
            </div>

            {/* ── 우측: 상세 ── */}
            <div className="flex-1 overflow-hidden">
                {selected
                    ? <IpoDetail row={selected} />
                    : (
                        <div className="flex h-full items-center justify-center text-sm text-gray-400">
                            왼쪽 목록에서 종목을 클릭하세요
                        </div>
                    )
                }
            </div>
        </div>
    )
}
