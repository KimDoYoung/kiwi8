import { useState, useMemo, useRef, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AgGridReact } from 'ag-grid-react'
import type { ColDef, RowClickedEvent } from 'ag-grid-community'
import { AllCommunityModule, ModuleRegistry } from 'ag-grid-community'
import { RefreshCw, ExternalLink } from 'lucide-react'
import api from '@/lib/api'
import { Button } from '@/shared/components/ui/button'
import { GroupRadioButton } from '@/shared/components/GroupRadioButton'

ModuleRegistry.registerModules([AllCommunityModule])

// ── 타입 ──────────────────────────────────────────────────────────
interface IpoRow {
    track_id: string
    stock_name: string
    status: string
    market_type: string
    stock_code: string
    industry: string
    ceo: string
    business_type: string
    headquarters_location: string
    website: string
    phone_number: string
    major_shareholder: string
    revenue: string
    pre_tax_continuing_operations_profit: string
    net_profit: string
    capital: string
    total_ipo_shares: string
    face_value: string
    desired_ipo_price: string
    subscription_competition_rate: string
    final_ipo_price: string
    ipo_proceeds: string
    lead_manager: string
    demand_forecast_date: string
    ipo_subscription_date: string
    payment_date: string
    refund_date: string
    listing_date: string
    ir_data: string
}

async function fetchIpoList(status: string): Promise<IpoRow[]> {
    const res = await api.get('/api/v1/ipo/list', { params: status ? { status } : {} })
    return res.data?.data ?? []
}

// ── 상태 뱃지 ────────────────────────────────────────────────────
const STATUS_STYLE: Record<string, string> = {
    '진행':     'bg-green-100 text-green-800 border border-green-300',
    '상장':     'bg-sky-100   text-sky-800   border border-sky-300',
    '공모철회': 'bg-gray-100  text-gray-600  border border-gray-300',
}

function StatusBadge({ status }: { status: string }) {
    const cls = STATUS_STYLE[status] ?? 'bg-gray-100 text-gray-600 border border-gray-300'
    return <span className={`px-1.5 py-0.5 rounded text-[11px] font-medium ${cls}`}>{status}</span>
}

// ── 마켓 뱃지 ────────────────────────────────────────────────────
const MARKET_STYLE: Record<string, string> = {
    '코스닥':  'bg-blue-50  text-blue-700',
    '유가증권':'bg-red-50   text-red-700',
    '코넥스':  'bg-gray-50  text-gray-600',
}

function MarketBadge({ market }: { market: string }) {
    const cls = MARKET_STYLE[market] ?? 'bg-gray-50 text-gray-600'
    return <span className={`px-1 py-0.5 rounded text-[10px] font-semibold ${cls}`}>{market}</span>
}

// ── 상세 행 컴포넌트 ─────────────────────────────────────────────
function DetailRow({ label, value }: { label: string; value?: string }) {
    if (!value) return null
    return (
        <div className="flex py-1.5 border-b border-gray-100 last:border-0 gap-2">
            <span className="text-xs text-gray-500 w-28 flex-shrink-0">{label}</span>
            <span className="text-xs text-gray-900 break-all">{value}</span>
        </div>
    )
}

// ── 메인 컴포넌트 ────────────────────────────────────────────────
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
        { headerName: '업종', field: 'industry', width: 160, tooltipField: 'industry' },
        { headerName: '희망공모가', field: 'desired_ipo_price', width: 140 },
        { headerName: '확정공모가', field: 'final_ipo_price', width: 110 },
        { headerName: '청약경쟁률', field: 'subscription_competition_rate', width: 110 },
        { headerName: '공모청약일', field: 'ipo_subscription_date', width: 150 },
        { headerName: '상장일', field: 'listing_date', width: 110 },
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
            <div className="flex-1 overflow-hidden flex flex-col">
                {selected ? (
                    <>
                        {/* 상세 헤더 */}
                        <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex-shrink-0">
                            <div className="flex items-start justify-between gap-2">
                                <div>
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="text-base font-bold text-gray-900">{selected.stock_name}</span>
                                        <StatusBadge status={selected.status} />
                                        <MarketBadge market={selected.market_type} />
                                    </div>
                                    <div className="flex items-center gap-3 text-xs text-gray-500">
                                        {selected.stock_code && <span>종목코드: <b className="text-gray-700">{selected.stock_code}</b></span>}
                                        {selected.industry && <span>{selected.industry}</span>}
                                    </div>
                                </div>
                                {selected.website && (
                                    <a href={selected.website} target="_blank" rel="noreferrer"
                                        className="flex items-center gap-1 text-xs text-blue-600 hover:underline flex-shrink-0">
                                        <ExternalLink className="w-3 h-3" />홈페이지
                                    </a>
                                )}
                            </div>
                        </div>

                        {/* 상세 내용 */}
                        <div className="flex-1 overflow-y-auto px-4 py-2">
                            {/* 일정 */}
                            <div className="mb-3">
                                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-1">일정</p>
                                <div className="bg-white border border-gray-100 rounded-lg px-3 divide-y divide-gray-50">
                                    <DetailRow label="수요예측일"  value={selected.demand_forecast_date} />
                                    <DetailRow label="공모청약일"  value={selected.ipo_subscription_date} />
                                    <DetailRow label="납입일"      value={selected.payment_date} />
                                    <DetailRow label="환불일"      value={selected.refund_date} />
                                    <DetailRow label="상장일"      value={selected.listing_date} />
                                    {selected.ir_data && <DetailRow label="IR 일정" value={selected.ir_data} />}
                                </div>
                            </div>

                            {/* 공모 정보 */}
                            <div className="mb-3">
                                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-1">공모 정보</p>
                                <div className="bg-white border border-gray-100 rounded-lg px-3 divide-y divide-gray-50">
                                    <DetailRow label="총공모주식수"  value={selected.total_ipo_shares} />
                                    <DetailRow label="액면가"        value={selected.face_value} />
                                    <DetailRow label="희망공모가격"  value={selected.desired_ipo_price} />
                                    <DetailRow label="확정공모가격"  value={selected.final_ipo_price} />
                                    <DetailRow label="공모금액"      value={selected.ipo_proceeds} />
                                    <DetailRow label="청약경쟁률"    value={selected.subscription_competition_rate} />
                                    <DetailRow label="주간사"        value={selected.lead_manager} />
                                </div>
                            </div>

                            {/* 회사 정보 */}
                            <div className="mb-3">
                                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-1">회사 정보</p>
                                <div className="bg-white border border-gray-100 rounded-lg px-3 divide-y divide-gray-50">
                                    <DetailRow label="대표이사"     value={selected.ceo} />
                                    <DetailRow label="기업구분"     value={selected.business_type} />
                                    <DetailRow label="본점소재지"   value={selected.headquarters_location} />
                                    <DetailRow label="대표전화"     value={selected.phone_number} />
                                    <DetailRow label="최대주주"     value={selected.major_shareholder} />
                                </div>
                            </div>

                            {/* 재무 정보 */}
                            <div className="mb-3">
                                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-1">재무 정보</p>
                                <div className="bg-white border border-gray-100 rounded-lg px-3 divide-y divide-gray-50">
                                    <DetailRow label="매출액"            value={selected.revenue} />
                                    <DetailRow label="법인세차감전순이익" value={selected.pre_tax_continuing_operations_profit} />
                                    <DetailRow label="순이익"            value={selected.net_profit} />
                                    <DetailRow label="자기자본"          value={selected.capital} />
                                </div>
                            </div>
                        </div>
                    </>
                ) : (
                    <div className="flex-1 flex items-center justify-center text-sm text-gray-400">
                        왼쪽 목록에서 종목을 클릭하세요
                    </div>
                )}
            </div>
        </div>
    )
}
