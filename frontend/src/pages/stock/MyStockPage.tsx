import { useMemo, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { AgGridReact } from 'ag-grid-react'
import type { ColDef } from 'ag-grid-community'
import { AllCommunityModule, ModuleRegistry } from 'ag-grid-community'
import { useStockDetailStore } from '@/store/stockDetailStore'
import { useLayoutStore } from '@/store/layoutStore'
import {
  getMyStocks,
  updateMyStock,
  getCurrentPrices,
  syncHoldings,
  fillAllSpec,
  createMyStock,
} from '@/services/myStockService'
import { findStock, type StockSearchItem } from '@/services/stockService'
import { fetchMenuTree } from '@/services/menuService'
import { toNum, fmt } from '@/lib/utils'
import Loading from '@/shared/components/Loading'
import LoadingFail from '@/shared/components/LoadingFail'
import { RefreshCw, Search, Info, Check, Heart } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { setStatusMessage } from '@/store/statusStore'

ModuleRegistry.registerModules([AllCommunityModule])

export default function MyStockPage() {
  const gridRef = useRef<AgGridReact>(null)
  const queryClient = useQueryClient()
  const setStockDetail = useStockDetailStore((s) => s.setStock)
  const openByScreenNo = useLayoutStore((s) => s.openByScreenNo)

  const { data: menus } = useQuery({
    queryKey: ['menus'],
    queryFn: fetchMenuTree,
    staleTime: 1000 * 60 * 10,
  })

  const [keyword, setKeyword] = useState('')
  const [searchResults, setSearchResults] = useState<StockSearchItem[]>([])
  const [showSearchResults, setShowSearchResults] = useState(false)

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
      queryClient.setQueryData(['myStocks'], (old: any) =>
        old?.map((item: any) => item.stk_cd === stk_cd ? { ...item, is_watch } : item) ?? old
      )
    },
  })

  const toggleAllWatchMutation = useMutation({
    mutationFn: (is_watch: number) =>
      Promise.all((data ?? []).map(s => updateMyStock(s.stk_cd, { is_watch }))),
    onMutate: (is_watch) => {
      queryClient.setQueryData(['myStocks'], (old: any) =>
        old?.map((item: any) => ({ ...item, is_watch })) ?? old
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
    onError: (err: any) => setStatusMessage(`Spec 갱신 실패: ${err.message}`, 'error')
  })

  const addMutation = useMutation({
    mutationFn: (item: StockSearchItem) => createMyStock({
      stk_cd: item.stk_cd,
      stk_nm: item.stk_nm,
      is_watch: 1
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['myStocks'] })
      setStatusMessage('추가되었습니다.', 'success')
      setKeyword('')
      setShowSearchResults(false)
    },
    onError: (err: any) => setStatusMessage(`추가 실패: ${err.message}`, 'error')
  })

  const handleSearch = async () => {
    if (!keyword.trim()) return
    try {
      const results = await findStock(keyword)
      setSearchResults(results)
      setShowSearchResults(true)
    } catch (err) {
      console.error(err)
    }
  }

  const columnDefs = useMemo<ColDef[]>(() => [
    {
      headerName: '종목명(종목코드)',
      width: 160,
      pinned: 'left',
      cellRenderer: (params: any) => (
        <div className="flex items-center gap-1 h-full">
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
      ),
    },
    {
      headerName: '',
      width: 70,
      sortable: false,
      cellRenderer: (params: any) => (
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
      headerName: '현재가',
      width: 100,
      cellClass: 'text-right',
      valueGetter: (p) => currentPrices?.[p.data.stk_cd] ?? 0,
      valueFormatter: (p) => p.value ? fmt(p.value) : '',
      cellStyle: (p) => {
        const cur = p.value
        const base = p.data?.base_price
        if (!cur || !base) return {}
        return { color: cur > base ? '#ef4444' : cur < base ? '#2563eb' : undefined }
      },
    },
    {
      headerName: '기준가 (매도|매수)',
      width: 170,
      cellRenderer: (params: any) => {
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
      headerName: '상장일',
      width: 90,
      cellClass: 'text-right',
      valueGetter: (p) => p.data.spec_data?.['상장일'],
      valueFormatter: (p) => {
        if (!p.value) return ''
        const v = String(p.value).replace(/[^0-9]/g, '')
        return v.length >= 6 ? `${v.slice(0, 4)}-${v.slice(4, 6)}` : p.value
      },
    },
    {
      headerName: '시총(억)',
      width: 110,
      cellClass: 'text-right',
      valueGetter: (p) => p.data.spec_data?.['시가총액'],
      valueFormatter: (p) => p.value ? fmt(Math.floor(toNum(p.value))) : '',
    },
    {
      headerName: 'PER',
      width: 80,
      cellClass: 'text-right',
      valueGetter: (p) => p.data.spec_data?.['PER'],
    },
    {
      headerName: 'PBR',
      width: 80,
      cellClass: 'text-right',
      valueGetter: (p) => p.data.spec_data?.['PBR'],
    },
    {
      headerName: '외인(%)',
      width: 90,
      cellClass: 'text-right',
      valueGetter: (p) => p.data.spec_data?.['외인소진율'],
    },
    {
      headerName: '매출액',
      width: 110,
      cellClass: 'text-right',
      valueGetter: (p) => p.data.spec_data?.['매출액'],
      valueFormatter: (p) => p.value ? fmt(toNum(p.value)) : '',
    },
    {
      headerName: '영업이익',
      width: 110,
      cellClass: 'text-right',
      valueGetter: (p) => p.data.spec_data?.['영업이익'],
      valueFormatter: (p) => p.value ? fmt(toNum(p.value)) : '',
    },
    {
      headerName: 'NXT',
      width: 60,
      cellClass: 'text-center',
      valueGetter: (p) => p.data.spec_data?.['NTX'],
      cellRenderer: (p: any) => {
        const v = p.value
        if (!v) return null
        return (
          <span style={{ fontSize: 10, padding: '1px 4px', borderRadius: 3,
            background: v === 'Y' ? '#dcfce7' : '#fee2e2',
            color: v === 'Y' ? '#16a34a' : '#dc2626' }}>
            {v}
          </span>
        )
      },
    },
  ], [setStockDetail, openByScreenNo, menus, toggleWatchMutation, toggleAllWatchMutation, data, currentPrices])

  if (isLoading) return <Loading />
  if (error) return <LoadingFail error={error} refetch={refetch} />

  return (
    <div className="flex flex-col h-full bg-gray-50 p-4">
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-bold text-gray-800">나의 종목 관리 (1203)</h1>
          <div className="relative">
            <div className="flex gap-1">
              <Input 
                placeholder="종목명 또는 코드" 
                className="w-48 h-9 text-sm" 
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              />
              <Button size="sm" variant="outline" className="h-9 px-2" onClick={handleSearch}>
                <Search className="w-4 h-4" />
              </Button>
            </div>
            {showSearchResults && searchResults.length > 0 && (
              <div className="absolute z-50 w-64 mt-1 bg-white border rounded shadow-lg max-h-60 overflow-auto">
                {searchResults.map(s => (
                  <div 
                    key={s.stk_cd} 
                    className="p-2 hover:bg-gray-100 cursor-pointer flex justify-between items-center border-b last:border-0"
                    onClick={() => addMutation.mutate(s)}
                  >
                    <div>
                      <div className="text-sm font-bold">{s.stk_nm}</div>
                      <div className="text-[10px] text-gray-500">{s.market_name} | {s.up_name}</div>
                    </div>
                    <span className="text-xs text-blue-600 font-mono">{s.stk_cd}</span>
                  </div>
                ))}
              </div>
            )}
            {showSearchResults && searchResults.length === 0 && (
              <div className="absolute z-50 w-64 mt-1 bg-white border p-4 text-center text-sm text-gray-500 rounded shadow-lg">
                검색 결과가 없습니다.
              </div>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => fillAllSpecMutation.mutate()} disabled={fillAllSpecMutation.isPending}>
            <Info className={`w-4 h-4 mr-2 ${fillAllSpecMutation.isPending ? 'animate-pulse' : ''}`} />
            전체 Spec 갱신
          </Button>
          <Button variant="outline" size="sm" onClick={() => syncMutation.mutate()} disabled={syncMutation.isPending}>
            <RefreshCw className={`w-4 h-4 mr-2 ${syncMutation.isPending ? 'animate-spin' : ''}`} />
            보유 종목 동기화
          </Button>
          <Button variant="outline" size="sm" onClick={() => { refetch(); refetchPrices() }} disabled={isFetching}>
            <RefreshCw className={`w-4 h-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} />
            {isFetching ? '로딩중...' : '새로고침'}
          </Button>
        </div>
      </div>

      <div className="flex-1 bg-white rounded-lg shadow-sm border overflow-hidden ag-theme-alpine">
        <AgGridReact
          ref={gridRef}
          rowData={data ?? []}
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
