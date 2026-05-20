import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { AgGridReact } from 'ag-grid-react'
import type { ColDef, ICellRendererParams } from 'ag-grid-community'
import { AllCommunityModule, ModuleRegistry } from 'ag-grid-community'
import { useStockDetailStore } from '@/store/stockDetailStore'
import { useLayoutStore } from '@/store/layoutStore'
import { useModalStore } from '@/store/modalStore'
import {
  getMyStocks,
  updateMyStock,
  getCurrentPrices,
  syncHoldings,
  fillAllSpec,
  type MyStock,
} from '@/services/myStockService'
import { fetchMenuTree } from '@/services/menuService'
import { toNum, fmt, numComparator } from '@/lib/utils'
import Loading from '@/shared/components/Loading'
import LoadingFail from '@/shared/components/LoadingFail'
import { GroupRadioButton } from '@/shared/components/GroupRadioButton'
import { ThreeCheckButton } from '@/shared/components/ThreeCheckButton'
import { StockFilterButton } from '@/shared/components/StockFilterButton'
import type { StockOption } from '@/shared/components/StocksSelectBox'
import { PricePositionBar } from '@/shared/components/PricePositionBar'
import { MarketBadge, CompanySizeBadge, NXTBadge } from '@/shared/components/StockBadges'
import { RefreshCw, Search, Info, Check, Heart } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { setStatusMessage } from '@/store/statusStore'

ModuleRegistry.registerModules([AllCommunityModule])

export default function MyStockPage() {
  const gridRef = useRef<AgGridReact>(null)
  const queryClient = useQueryClient()
  const setStockDetail = useStockDetailStore((s) => s.setStock)
  const openByScreenNo = useLayoutStore((s) => s.openByScreenNo)
  const openStockFindModal = useModalStore((s) => s.openStockFindModal)

  const { data: menus } = useQuery({
    queryKey: ['menus'],
    queryFn: fetchMenuTree,
    staleTime: 1000 * 60 * 10,
  })

  const [stockFilter, setStockFilter] = useState<'hold' | 'all' | 'watch'>('all')
  const [marketFilter, setMarketFilter] = useState<'ALL' | 'KOSPI' | 'KOSDAQ'>('ALL')
  const [sizeFilter, setSizeFilter] = useState<string[]>([])
  const [filterCodes, setFilterCodes] = useState<string[]>([])

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['myStocks'],
    queryFn: () => getMyStocks(),
  })

  const { data: currentPrices, refetch: refetchPrices } = useQuery({
    queryKey: ['myStockPrices'],
    queryFn: getCurrentPrices,
    staleTime: 30000,
    enabled: !!data && data.length > 0,
  })

  const toggleWatchMutation = useMutation({
    mutationFn: ({ stk_cd, is_watch }: { stk_cd: string; is_watch: number }) =>
      updateMyStock(stk_cd, { is_watch }),
    onMutate: ({ stk_cd, is_watch }) => {
      queryClient.setQueryData(['myStocks'], (old: MyStock[] | undefined) =>
        old?.map((item: MyStock) => item.stk_cd === stk_cd ? { ...item, is_watch } : item) ?? old
      )
    },
  })

  const toggleAllWatchMutation = useMutation({
    mutationFn: (is_watch: number) =>
      Promise.all((data ?? []).map(s => updateMyStock(s.stk_cd, { is_watch }))),
    onMutate: (is_watch) => {
      queryClient.setQueryData(['myStocks'], (old: MyStock[] | undefined) =>
        old?.map((item: MyStock) => ({ ...item, is_watch })) ?? old
      )
    },
  })

  const syncMutation = useMutation({
    mutationFn: syncHoldings,
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ['myStocks'] })
      setStatusMessage(`${count}개 종목이 동기화되었습니다.`, 'success')
    }
  })

  const fillAllSpecMutation = useMutation({
    mutationFn: fillAllSpec,
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ['myStocks'] })
      setStatusMessage(`${count}개 종목 Spec이 갱신되었습니다.`, 'success')
    },
    onError: (err: Error) => setStatusMessage(`Spec 갱신 실패: ${err.message}`, 'error')
  })

  // StockFindModal에서 종목 추가 시 쿼리 갱신
  useEffect(() => {
    const handler = () => queryClient.invalidateQueries({ queryKey: ['myStocks'] })
    window.addEventListener('mystock-updated', handler)
    return () => window.removeEventListener('mystock-updated', handler)
  }, [queryClient])

  const uniqueStocks = useMemo<StockOption[]>(() =>
    (data ?? []).map(s => ({ stk_cd: s.stk_cd, stk_nm: s.stk_nm }))
      .sort((a, b) => a.stk_nm.localeCompare(b.stk_nm)),
    [data]
  )

  const filteredData = useMemo(() => {
    let list = data ?? []
    if (stockFilter === 'hold') list = list.filter(s => s.is_hold === 1)
    else if (stockFilter === 'watch') list = list.filter(s => s.is_watch === 1)
    
    if (marketFilter === 'KOSPI') list = list.filter(s => s.spec_data?.['시장명'] === '코스피')
    else if (marketFilter === 'KOSDAQ') list = list.filter(s => s.spec_data?.['시장명'] === '코스닥')

    if (sizeFilter.length > 0 && sizeFilter.length < 3) {
      const sizeMap: Record<string, string> = { LARGE: '대형주', MEDIUM: '중형주', SMALL: '소형주' }
      const labels = sizeFilter.map(k => sizeMap[k]).filter(Boolean)
      list = list.filter(s => labels.includes(s.spec_data?.['회사크기분류']))
    }

    if (filterCodes.length > 0) list = list.filter(s => filterCodes.includes(s.stk_cd))
    return list
  }, [data, stockFilter, marketFilter, sizeFilter, filterCodes])

  const columnDefs = useMemo<ColDef[]>(() => [
    {
      headerName: '종목명(종목코드)',
      field: 'stk_nm',
      width: 160,
      pinned: 'left',
      cellRenderer: (params: ICellRendererParams) => {
        const status = params.data.spec_data?.['감리구분']
        const isNotNormal = status && status !== '정상'
        return (
          <div 
            className={`flex items-center gap-1 h-full px-2 -mx-2 ${isNotNormal ? 'bg-red-50 text-red-900' : ''}`}
            title={isNotNormal ? status : undefined}
          >
            <span
              className="text-sm font-medium cursor-pointer hover:text-blue-600"
              onClick={() => {
                setStockDetail(params.data.stk_cd, params.data.stk_nm)
                openByScreenNo('1201', menus || [])
              }}
            >
              {params.data.stk_nm}
            </span>
            <span
              className="text-[10px] text-blue-500 font-mono cursor-pointer hover:underline"
              onClick={() => window.open(`https://finance.naver.com/item/main.naver?code=${params.data.stk_cd}`, '_blank')}
            >
              ({params.data.stk_cd})
            </span>
          </div>
        )
      },
    },
    {
      headerName: '',
      width: 70,
      sortable: false,
      cellRenderer: (params: ICellRendererParams) => (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'center', height: '100%' }}>
          <Check style={{ width: 18, height: 18, color: params.data.is_hold ? '#16a34a' : '#e5e7eb', flexShrink: 0 }} />
          <Heart
            style={{ width: 18, height: 18, color: params.data.is_watch ? '#ef4444' : '#e5e7eb', fill: params.data.is_watch ? '#ef4444' : 'none', flexShrink: 0, cursor: 'pointer' }}
            onClick={() => toggleWatchMutation.mutate({ stk_cd: params.data.stk_cd, is_watch: params.data.is_watch ? 0 : 1 })}
          />
        </div>
      ),
      headerComponent: () => {
        const allWatched = (data ?? []).length > 0 && (data ?? []).every(s => s.is_watch === 1)
        return (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'center', width: '100%' }}>
            <Check style={{ width: 22, height: 22, color: '#16a34a' }} />
            <Heart
              style={{ width: 22, height: 22, color: allWatched ? '#ef4444' : '#e5e7eb', fill: allWatched ? '#ef4444' : 'none', cursor: 'pointer' }}
              onClick={() => toggleAllWatchMutation.mutate(allWatched ? 0 : 1)}
            />
          </div>
        )
      },
    },
    {
      headerName: '구분',
      width: 140,
      sortable: false,
      cellClass: 'text-center',
      cellRenderer: (p: ICellRendererParams) => {
        const spec = p.data.spec_data
        if (!spec) return null
        
        const market = spec['시장명']
        const size = spec['회사크기분류']
        const nxt = spec['NTX']

        return (
          <div className="flex items-center justify-center gap-1 h-full">
            {market && <MarketBadge market={market} />}
            {size && <CompanySizeBadge size={size} />}
            <NXTBadge isPossible={nxt === 'Y' ? 'Y' : 'N'} />
          </div>
        )
      },
    },
    {
      headerName: '현재가',
      width: 100,
      cellClass: 'text-right',
      valueGetter: (p) => currentPrices?.[p.data.stk_cd] ?? 0,
      valueFormatter: (p) => p.value ? fmt(p.value) : '',
      cellStyle: (_p) => {
        return { color: '#f2401c' }
      },
    },
    {
      headerName: '기준가 (매도|매수)',
      width: 170,
      sortable: false,
      cellRenderer: (params: ICellRendererParams) => {
        const base = params.data.base_price
        const sell = params.data.sell_price
        const buy = params.data.buy_price
        if (!base && !sell && !buy) return null
        return (
          <div className="flex items-center justify-end gap-1 h-full text-xs">
            {base && <span className="text-gray-700">{fmt(base)}</span>}
            {(sell || buy) && <span className="text-gray-400">|</span>}
            {sell && <span className="text-blue-600">{fmt(sell)}</span>}
            {sell && buy && <span className="text-gray-300">/</span>}
            {buy && <span className="text-red-500">{fmt(buy)}</span>}
          </div>
        )
      },
    },
    {
      headerName: '250일 범위',
      width: 200,
      sortable: false,
      cellRenderer: (p: ICellRendererParams) => (
        <PricePositionBar
          high={Math.abs(toNum(p.data.spec_data?.['250최고']))}
          low={Math.abs(toNum(p.data.spec_data?.['250최저']))}
          current={Math.abs(currentPrices?.[p.data.stk_cd] || 0)}
        />
      )
    },
    {
      headerName: '상장일',
      width: 110,
      cellRenderer: (p: ICellRendererParams) => {
        const v = String(p.data.spec_data?.['상장일'] ?? '').replace(/[^0-9]/g, '')
        if (!v || v.length < 6) return null
        const years = new Date().getFullYear() - parseInt(v.slice(0, 4))
        return (
          <span>
            <span className="inline-block w-[18px] text-right font-mono">{years}</span>
            <span className="text-[10px] text-gray-400 font-mono">{`(${v.slice(0, 4)}-${v.slice(4, 6)})`}</span>
          </span>
        )
      },
    },
    {
      headerName: '시총(억)',
      width: 110,
      cellClass: 'text-right',
      valueGetter: (p) => p.data.spec_data?.['시가총액'],
      valueFormatter: (p) => p.value ? fmt(Math.floor(toNum(p.value))) : '',
      comparator: numComparator,
    },
    {
      headerName: 'PER',
      width: 80,
      cellClass: 'text-right',
      valueGetter: (p) => p.data.spec_data?.['PER'],
      comparator: numComparator,
    },
    {
      headerName: 'PBR',
      width: 80,
      cellClass: 'text-right',
      valueGetter: (p) => p.data.spec_data?.['PBR'],
      comparator: numComparator,
    },
    {
      headerName: '외인(%)',
      width: 90,
      cellClass: 'text-right',
      valueGetter: (p) => p.data.spec_data?.['외인소진율'],
      comparator: numComparator,
    },
    {
      headerName: '유통(%)',
      width: 85,
      cellClass: 'text-right',
      valueGetter: (p) => p.data.spec_data?.['유통비율'],
      comparator: numComparator,
    },
    {
      headerName: '유통주식',
      width: 110,
      cellClass: 'text-right',
      valueGetter: (p) => p.data.spec_data?.['유통주식'],
      valueFormatter: (p) => p.value ? fmt(toNum(p.value)) : '',
      comparator: numComparator,
    },
    {
      headerName: '매출액',
      width: 110,
      cellClass: 'text-right',
      valueGetter: (p) => p.data.spec_data?.['매출액'],
      valueFormatter: (p) => p.value ? fmt(toNum(p.value)) : '',
      comparator: numComparator,
    },
    {
      headerName: '영업이익',
      width: 110,
      cellClass: 'text-right',
      valueGetter: (p) => p.data.spec_data?.['영업이익'],
      valueFormatter: (p) => p.value ? fmt(toNum(p.value)) : '',
      comparator: numComparator,
    }
  ], [setStockDetail, openByScreenNo, menus, toggleWatchMutation, toggleAllWatchMutation, data, currentPrices])

  if (isLoading) return <Loading />
  if (error) return <LoadingFail message={typeof error === 'string' ? error : error?.message || 'Unknown error'} />

  return (
    <div className="flex flex-col h-full bg-gray-50 p-4">
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">
          <h1 className="text-xl font-bold text-gray-800">관심/보유 종목</h1>
          <Button size="sm" variant="outline" className="h-[26px] px-2" onClick={openStockFindModal}>
            <Search className="w-4 h-4" />
          </Button>
          <StockFilterButton
            uniqueStocks={uniqueStocks}
            filterCodes={filterCodes}
            onFilterChange={setFilterCodes}
          />          
          <GroupRadioButton
            options={[
              {
                label: <Check style={{ width: 13, height: 13 }} />,
                value: 'hold',
                className: 'data-[state=on]:bg-green-100 data-[state=on]:text-green-700 data-[state=on]:border-green-300',
              },
              {
                label: '全',
                value: 'all',
                className: 'data-[state=on]:bg-gray-200 data-[state=on]:text-gray-800 data-[state=on]:border-gray-200',
              },
              {
                label: <Heart style={{ width: 13, height: 13 }} />,
                value: 'watch',
                className: 'data-[state=on]:bg-red-100 data-[state=on]:text-red-600 data-[state=on]:border-red-300',
              },
            ]}
            value={stockFilter}
            onValueChange={(v) => setStockFilter(v as typeof stockFilter)}
            className="h-[26px] bg-white"
            itemClassName="h-[24px] text-xs px-3"
          />
          <GroupRadioButton
            options={[
              { label: '코스닥', value: 'KOSDAQ', className: 'data-[state=on]:bg-pink-100 data-[state=on]:text-pink-700' },
              { label: '全', value: 'ALL', className: 'data-[state=on]:bg-gray-200 data-[state=on]:text-gray-800' },
              { label: '코스피', value: 'KOSPI', className: 'data-[state=on]:bg-orange-100 data-[state=on]:text-orange-700' },              
            ]}
            value={marketFilter}
            onValueChange={(v) => setMarketFilter(v as typeof marketFilter)}
            className="h-[26px] bg-white"
            itemClassName="h-[24px] text-xs px-3"
          />
          <ThreeCheckButton
            options={[
              { label: '대형', value: 'LARGE', activeClassName: 'bg-blue-100 text-blue-700' },
              { label: '중형', value: 'MEDIUM', activeClassName: 'bg-green-100 text-green-700' },
              { label: '소형', value: 'SMALL', activeClassName: 'bg-yellow-100 text-yellow-700' },
            ]}
            value={sizeFilter}
            onValueChange={setSizeFilter}
            className="h-[26px] border-gray-200"
            itemClassName="h-[24px] text-xs px-2"
          />

        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="warning" size="sm" onClick={() => fillAllSpecMutation.mutate()} disabled={fillAllSpecMutation.isPending}>
            <Info className={`w-4 h-4 mr-2 ${fillAllSpecMutation.isPending ? 'animate-pulse' : ''}`} />
            전체 Spec 갱신
          </Button>
          <Button variant="secondary" size="sm" onClick={() => syncMutation.mutate()} disabled={syncMutation.isPending}>
            <RefreshCw className={`w-4 h-4 mr-2 ${syncMutation.isPending ? 'animate-spin' : ''}`} />
            보유 종목 동기화
          </Button>
          <Button variant="secondary" size="sm" onClick={() => { refetch(); refetchPrices() }} disabled={isFetching}>
            <RefreshCw className={`w-4 h-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} />
            {isFetching ? '로딩중...' : '새로고침'}
          </Button>
        </div>
      </div>

      <div className="flex-1 bg-white rounded-lg shadow-sm border overflow-hidden ag-theme-alpine">
        <AgGridReact
          ref={gridRef}
          rowData={filteredData}
          columnDefs={columnDefs}
          defaultColDef={{
            sortable: true,
            filter: false,
            resizable: true,
          }}
          rowHeight={30}
          headerHeight={36}
          animateRows={true}
          getRowId={(params) => params.data.stk_cd}
        />
      </div>
      
    </div>
  )
}
