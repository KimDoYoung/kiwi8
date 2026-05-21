import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { AgGridReact } from 'ag-grid-react'
import type { ColDef, ICellRendererParams } from 'ag-grid-community'
import { AllCommunityModule, ModuleRegistry } from 'ag-grid-community'
import { useStockDetailStore } from '@/store/stockDetailStore'
import { useLayoutStore } from '@/store/layoutStore'
import { fetchMenuTree } from '@/services/menuService'
import { fetchStkInfoList } from '@/services/stockService'
import type { StkInfoItem } from '@/services/stockService'
import { getMyStocks, updateMyStock, createMyStock } from '@/services/myStockService'
import type { MyStock } from '@/services/myStockService'
import { fmt, toNum, numComparator } from '@/lib/utils'
import Loading from '@/shared/components/Loading'
import LoadingFail from '@/shared/components/LoadingFail'
import { GroupRadioButton } from '@/shared/components/GroupRadioButton'
import { ThreeCheckButton } from '@/shared/components/ThreeCheckButton'
import { BizTypeFilterButton } from '@/shared/components/BizTypeFilterButton'
import { MarketBadge, CompanySizeBadge, NXTBadge } from '@/shared/components/StockBadges'
import { RotateCcw, Heart } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'

ModuleRegistry.registerModules([AllCommunityModule])

export default function StockFindPage() {
  const gridRef = useRef<AgGridReact>(null)
  const queryClient = useQueryClient()
  const setStockDetail = useStockDetailStore((s) => s.setStock)
  const openByScreenNo = useLayoutStore((s) => s.openByScreenNo)

  const { data: menus } = useQuery({
    queryKey: ['menus'],
    queryFn: fetchMenuTree,
    staleTime: 1000 * 60 * 10,
  })

  const { data, isLoading, error } = useQuery({
    queryKey: ['stkInfoList'],
    queryFn: fetchStkInfoList,
    staleTime: 1000 * 60 * 30,
  })

  const { data: myStocks } = useQuery({
    queryKey: ['myStocks'],
    queryFn: getMyStocks,
    staleTime: 1000 * 60 * 5,
  })

  const watchMap = useMemo<Record<string, number>>(() => {
    const map: Record<string, number> = {}
    for (const s of myStocks ?? []) map[s.stk_cd] = s.is_watch
    return map
  }, [myStocks])

  const watchMutation = useMutation({
    mutationFn: async ({ stk_cd, stk_nm, inMyStock, is_watch }: { stk_cd: string; stk_nm: string; inMyStock: boolean; is_watch: number }) => {
      if (inMyStock) return updateMyStock(stk_cd, { is_watch })
      return createMyStock({ stk_cd, stk_nm, is_watch: 1 })
    },
    onMutate: ({ stk_cd, inMyStock, is_watch, stk_nm }) => {
      queryClient.setQueryData(['myStocks'], (old: MyStock[] | undefined) => {
        if (!old) return old
        if (inMyStock) return old.map(s => s.stk_cd === stk_cd ? { ...s, is_watch } : s)
        return [...old, { stk_cd, stk_nm, is_watch: 1, is_hold: 0, created_at: '', updated_at: '' } as MyStock]
      })
    },
    onSuccess: () => {
      window.dispatchEvent(new Event('mystock-updated'))
    },
  })

  const [keyword, setKeyword] = useState('')
  const [resetSignal, setResetSignal] = useState(0)
  const [marketFilter, setMarketFilter] = useState<'ALL' | '거래소' | '코스닥'>('ALL')
  const [sizeFilter, setSizeFilter] = useState<string[]>([])
  const [sectorFilters, setSectorFilters] = useState<string[]>([])

  const sectors = useMemo(() => {
    const names = (data ?? [])
      .map(s => s.up_name)
      .filter((n): n is string => !!n && n !== '')
    return Array.from(new Set(names)).sort()
  }, [data])

  const filteredData = useMemo(() => {
    let list = data ?? []
    if (keyword.trim()) {
      const kw = keyword.trim()
      list = list.filter(s =>
        s.stk_nm?.includes(kw) || s.stk_cd.includes(kw) ||
        s.main_products?.includes(kw) || s.representative_name?.includes(kw)
      )
    }
    if (marketFilter !== 'ALL') list = list.filter(s => s.market_name === marketFilter)
    if (sizeFilter.length > 0 && sizeFilter.length < 3)
      list = list.filter(s => sizeFilter.includes(s.up_size_name ?? ''))
    if (sectorFilters.length > 0) list = list.filter(s => s.up_name != null && sectorFilters.includes(s.up_name))
    return list
  }, [data, keyword, marketFilter, sizeFilter, sectorFilters])

  const columnDefs = useMemo<ColDef<StkInfoItem>[]>(() => [
    {
      headerName: '종목명(코드)',
      field: 'stk_nm',
      width: 170,
      pinned: 'left',
      cellRenderer: (params: ICellRendererParams<StkInfoItem>) => (
        <div className="flex items-center gap-1 h-full">
          <span
            className="text-sm font-medium cursor-pointer hover:text-blue-600"
            onClick={() => {
              setStockDetail(params.data!.stk_cd, params.data!.stk_nm ?? '')
              openByScreenNo('1201', menus || [])
            }}
          >
            {params.data!.stk_nm}
          </span>
          <span
            className="text-[10px] text-blue-500 font-mono cursor-pointer hover:underline"
            onClick={() => window.open(`https://finance.naver.com/item/main.naver?code=${params.data!.stk_cd}`, '_blank')}
          >
            ({params.data!.stk_cd})
          </span>
        </div>
      ),
    },
    {
      headerName: '❤️',
      width: 60,
      sortable: false,
      cellRenderer: (p: ICellRendererParams<StkInfoItem>) => {
        const stk_cd = p.data!.stk_cd
        const stk_nm = p.data!.stk_nm ?? ''
        const inMyStock = stk_cd in watchMap
        const isWatched = watchMap[stk_cd] === 1
        return (
          <div className="flex items-center justify-center h-full">
            <Heart
              style={{
                width: 15, height: 15,
                color: isWatched ? '#ef4444' : '#e5e7eb',
                fill: isWatched ? '#ef4444' : 'none',
                cursor: 'pointer',
                flexShrink: 0,
              }}
              onClick={() => watchMutation.mutate({
                stk_cd, stk_nm, inMyStock,
                is_watch: isWatched ? 0 : 1,
              })}
            />
          </div>
        )
      },
    },    
    {
      headerName: '시장',
      field: 'market_name',
      width: 80,
      cellClass: 'text-center',
      cellRenderer: (p: ICellRendererParams<StkInfoItem>) =>
        p.data!.market_name ? (
          <div className="flex items-center justify-center h-full">
            <MarketBadge market={p.data!.market_name as '코스닥' | '코스피'} />
          </div>
        ) : null,
    },
    {
      headerName: '크기',
      field: 'up_size_name',
      width: 72,
      cellClass: 'text-center',
      cellRenderer: (p: ICellRendererParams<StkInfoItem>) =>
        p.data!.up_size_name ? (
          <div className="flex items-center justify-center h-full">
            <CompanySizeBadge size={p.data!.up_size_name as '대형주' | '중형주' | '소형주'} />
          </div>
        ) : null,
    },
    {
      headerName: 'NXT',
      field: 'nxt_enable',
      width: 55,
      cellClass: 'text-center',
      cellRenderer: (p: ICellRendererParams<StkInfoItem>) => (
        <div className="flex items-center justify-center h-full">
          <NXTBadge isPossible={p.data!.nxt_enable === 'Y' ? 'Y' : 'N'} />
        </div>
      ),
    },
    {
      headerName: '감리',
      field: 'audit_info',
      width: 80,
      cellRenderer: (p: ICellRendererParams<StkInfoItem>) => {
        const v = p.data!.audit_info
        const isNormal = !v || v === '정상'
        return <span className={isNormal ? '' : 'text-red-600 font-medium'}>{v}</span>
      },
    },
    {
      headerName: '상장일',
      field: 'reg_day',
      width: 100,
      valueFormatter: (p) => {
        const v = p.value
        if (!v || v.length < 8) return v ?? ''
        return `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}`
      },
    },
    {
      headerName: '전일종가',
      field: 'last_price',
      width: 90,
      cellClass: 'text-right',
      valueGetter: (p) => toNum(p.data!.last_price ?? ''),
      valueFormatter: (p) => p.value ? fmt(p.value) : '',
      comparator: numComparator,
      cellStyle: { color: '#f2401c' },
    },
    {
      headerName: '업종',
      field: 'up_name',
      width: 120,
    },
    {
      headerName: '주요제품',
      field: 'main_products',
      width: 200,
      tooltipField: 'main_products',
    },
    {
      headerName: '지역',
      field: 'location',
      width: 80,
    },
    {
      headerName: '대표자명',
      field: 'representative_name',
      width: 90,
    },
    {
      headerName: '홈페이지',
      field: 'homepage',
      width: 180,
      cellRenderer: (p: ICellRendererParams<StkInfoItem>) => {
        const url = p.data!.homepage
        if (!url) return null
        return (
          <span
            className="text-blue-500 cursor-pointer hover:underline text-xs"
            onClick={() => window.open(url.startsWith('http') ? url : `http://${url}`, '_blank')}
          >
            {url}
          </span>
        )
      },
    }
  ], [setStockDetail, openByScreenNo, menus, watchMap, watchMutation])

  if (isLoading) return <Loading />
  if (error) return <LoadingFail message={error instanceof Error ? error.message : '오류'} />

  return (
    <div className="flex flex-col h-full bg-gray-50 p-4">
      <div className="flex items-center gap-2 flex-wrap mb-3">
          <h1 className="text-xl font-bold text-gray-800">全 종목 탐색</h1>
          <SearchInput onSearch={setKeyword} resetSignal={resetSignal} />
          <GroupRadioButton
            options={[
              { label: '코스닥', value: '코스닥', className: 'data-[state=on]:bg-pink-100 data-[state=on]:text-pink-700' },
              { label: '全', value: 'ALL', className: 'data-[state=on]:bg-gray-200 data-[state=on]:text-gray-800' },
              { label: '코스피', value: '거래소', className: 'data-[state=on]:bg-orange-100 data-[state=on]:text-orange-700' },
            ]}
            value={marketFilter}
            onValueChange={(v) => setMarketFilter(v as typeof marketFilter)}
            className="h-[26px] bg-white"
            itemClassName="h-[24px] text-xs px-3"
          />
          <ThreeCheckButton
            options={[
              { label: '대형', value: '대형주', activeClassName: 'bg-blue-100 text-blue-700' },
              { label: '중형', value: '중형주', activeClassName: 'bg-green-100 text-green-700' },
              { label: '소형', value: '소형주', activeClassName: 'bg-yellow-100 text-yellow-700' },
            ]}
            value={sizeFilter}
            onValueChange={setSizeFilter}
            className="h-[26px] border-gray-200"
            itemClassName="h-[24px] text-xs px-2"
          />
          <BizTypeFilterButton
            sectors={sectors}
            selectedSectors={sectorFilters}
            onFilterChange={setSectorFilters}
          />
          <Button
            variant="warning"
            size="sm"
            onClick={() => { setKeyword(''); setResetSignal(s => s + 1); setMarketFilter('ALL'); setSizeFilter([]); setSectorFilters([]) }}
          >
            <RotateCcw className="w-3 h-3 mr-1" />
            초기화
          </Button>
          <span className="text-xs text-gray-500 font-mono">{filteredData.length.toLocaleString()}개</span>
      </div>

      <div className="flex-1 bg-white rounded-lg shadow-sm border overflow-hidden ag-theme-alpine">
        <AgGridReact
          ref={gridRef}
          rowData={filteredData}
          columnDefs={columnDefs}
          defaultColDef={{ sortable: true, filter: false, resizable: true }}
          rowHeight={30}
          headerHeight={36}
          animateRows={false}
          getRowId={(params) => params.data.stk_cd}
          tooltipShowDelay={300}
        />
      </div>
    </div>
  )
}

function SearchInput({ onSearch, resetSignal }: { onSearch: (kw: string) => void; resetSignal: number }) {
  const [value, setValue] = useState('')
  useEffect(() => { setValue('') }, [resetSignal])
  return (
    <Input
      className="h-[26px] w-44 text-xs"
      placeholder="종목명/코드/주요제품/대표자"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => { if (e.key === 'Enter') onSearch(value) }}
    />
  )
}
