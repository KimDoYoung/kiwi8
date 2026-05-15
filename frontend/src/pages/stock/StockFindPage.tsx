import { useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AgGridReact } from 'ag-grid-react'
import type { ColDef, ICellRendererParams } from 'ag-grid-community'
import { AllCommunityModule, ModuleRegistry } from 'ag-grid-community'
import { useStockDetailStore } from '@/store/stockDetailStore'
import { useLayoutStore } from '@/store/layoutStore'
import { fetchMenuTree } from '@/services/menuService'
import { fetchStkInfoList } from '@/services/stockService'
import type { StkInfoItem } from '@/services/stockService'
import { fmt, toNum, numComparator } from '@/lib/utils'
import Loading from '@/shared/components/Loading'
import LoadingFail from '@/shared/components/LoadingFail'
import { GroupRadioButton } from '@/shared/components/GroupRadioButton'
import { MarketBadge, CompanySizeBadge, NXTBadge } from '@/shared/components/StockBadges'
import { RefreshCw, RotateCcw } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'

ModuleRegistry.registerModules([AllCommunityModule])

export default function StockFindPage() {
  const gridRef = useRef<AgGridReact>(null)
  const setStockDetail = useStockDetailStore((s) => s.setStock)
  const openByScreenNo = useLayoutStore((s) => s.openByScreenNo)

  const { data: menus } = useQuery({
    queryKey: ['menus'],
    queryFn: fetchMenuTree,
    staleTime: 1000 * 60 * 10,
  })

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['stkInfoList'],
    queryFn: fetchStkInfoList,
    staleTime: 1000 * 60 * 30,
  })

  const [keyword, setKeyword] = useState('')
  const [marketFilter, setMarketFilter] = useState<'ALL' | '거래소' | '코스닥'>('ALL')
  const [sizeFilter, setSizeFilter] = useState<'ALL' | '대형주' | '중형주' | '소형주'>('ALL')
  const [sectorFilter, setSectorFilter] = useState('ALL')

  const sectors = useMemo(() => {
    const names = (data ?? [])
      .map(s => s.up_name)
      .filter((n): n is string => !!n && n !== '')
    return ['ALL', ...Array.from(new Set(names)).sort()]
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
    if (sizeFilter !== 'ALL') list = list.filter(s => s.up_size_name === sizeFilter)
    if (sectorFilter !== 'ALL') list = list.filter(s => s.up_name === sectorFilter)
    return list
  }, [data, keyword, marketFilter, sizeFilter, sectorFilter])

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
    },
  ], [setStockDetail, openByScreenNo, menus])

  if (isLoading) return <Loading />
  if (error) return <LoadingFail message={error instanceof Error ? error.message : '오류'} />

  return (
    <div className="flex flex-col h-full bg-gray-50 p-4">
      <div className="flex justify-between items-center mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="text-xl font-bold text-gray-800">全 종목 탐색</h1>
          <Input
            className="h-[26px] w-44 text-xs"
            placeholder="종목명/코드/주요제품/대표자"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
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
          <GroupRadioButton
            options={[
              { label: '소형', value: '소형주', className: 'data-[state=on]:bg-yellow-100 data-[state=on]:text-yellow-700' },
              { label: '全', value: 'ALL', className: 'data-[state=on]:bg-gray-200 data-[state=on]:text-gray-800' },
              { label: '대형', value: '대형주', className: 'data-[state=on]:bg-blue-100 data-[state=on]:text-blue-700' },
            ]}
            value={sizeFilter}
            onValueChange={(v) => setSizeFilter(v as typeof sizeFilter)}
            className="h-[26px] bg-white"
            itemClassName="h-[24px] text-xs px-3"
          />
          <select
            className="h-[26px] text-xs border rounded px-2 bg-white"
            value={sectorFilter}
            onChange={(e) => setSectorFilter(e.target.value)}
          >
            {sectors.map(s => (
              <option key={s} value={s}>{s === 'ALL' ? '업종 전체' : s}</option>
            ))}
          </select>
          <Button
            variant="ghost"
            size="sm"
            className="h-[26px] px-2 text-xs text-gray-500 hover:text-gray-800"
            onClick={() => { setKeyword(''); setMarketFilter('ALL'); setSizeFilter('ALL'); setSectorFilter('ALL') }}
          >
            <RotateCcw className="w-3 h-3 mr-1" />
            초기화
          </Button>
          <span className="text-xs text-gray-500 font-mono">{filteredData.length.toLocaleString()}개</span>
        </div>
        <Button variant="secondary" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`w-4 h-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} />
          {isFetching ? '로딩중...' : '새로고침'}
        </Button>
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
