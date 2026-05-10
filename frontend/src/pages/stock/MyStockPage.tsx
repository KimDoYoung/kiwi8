import { useMemo, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { AgGridReact } from 'ag-grid-react'
import type { ColDef } from 'ag-grid-community'
import { AllCommunityModule, ModuleRegistry } from 'ag-grid-community'
import { useStockDetailStore } from '@/store/stockDetailStore'
import { 
  getMyStocks, 
  updateMyStock, 
  deleteMyStock, 
  fillSpec, 
  syncHoldings,
  createMyStock,
  type MyStock 
} from '@/services/myStockService'
import { findStock, type StockSearchItem } from '@/services/stockService'
import { toNum, fmt } from '@/lib/utils'
import Loading from '@/shared/components/Loading'
import LoadingFail from '@/shared/components/LoadingFail'
import { RefreshCw, Search, Trash2, Info, Check, X, Plus } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { setStatusMessage } from '@/store/statusStore'

ModuleRegistry.registerModules([AllCommunityModule])

export default function MyStockPage() {
  const gridRef = useRef<AgGridReact>(null)
  const queryClient = useQueryClient()
  const setStockDetail = useStockDetailStore((s) => s.setStock)
  
  const [keyword, setKeyword] = useState('')
  const [searchResults, setSearchResults] = useState<StockSearchItem[]>([])
  const [showSearchResults, setShowSearchResults] = useState(false)

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['myStocks'],
    queryFn: () => getMyStocks(),
  })

  const updateMutation = useMutation({
    mutationFn: ({ stk_cd, data }: { stk_cd: string; data: any }) => updateMyStock(stk_cd, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['myStocks'] })
      setStatusMessage('수정되었습니다.', 'success')
    },
    onError: (err: any) => setStatusMessage(`수정 실패: ${err.message}`, 'error')
  })

  const deleteMutation = useMutation({
    mutationFn: (stk_cd: string) => deleteMyStock(stk_cd),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['myStocks'] })
      setStatusMessage('삭제되었습니다.', 'success')
    }
  })

  const syncMutation = useMutation({
    mutationFn: syncHoldings,
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ['myStocks'] })
      setStatusMessage(`${count}개 종목이 동기화되었습니다.`, 'success')
    }
  })

  const fillSpecMutation = useMutation({
    mutationFn: (stk_cd: string) => fillSpec(stk_cd),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['myStocks'] })
      setStatusMessage('상세 정보가 갱신되었습니다.', 'success')
    }
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
      field: 'stk_cd', 
      headerName: '코드', 
      width: 100, 
      cellClass: 'font-mono text-blue-600 font-bold',
      onCellClicked: (params) => setStockDetail(params.data.stk_cd, params.data.stk_nm)
    },
    { field: 'stk_nm', headerName: '종목명', width: 150, pinned: 'left' },
    { 
      field: 'is_hold', 
      headerName: '보유', 
      width: 80,
      cellRenderer: (params: any) => params.value ? <Check className="w-4 h-4 text-green-600" /> : <X className="w-4 h-4 text-gray-300" />,
      cellClass: 'flex items-center justify-center'
    },
    { 
      field: 'is_watch', 
      headerName: '관심', 
      width: 80,
      cellRenderer: (params: any) => (
        <Button 
          variant="ghost" 
          size="sm" 
          className="h-6 w-6 p-0"
          onClick={() => updateMutation.mutate({ stk_cd: params.data.stk_cd, data: { is_watch: params.value ? 0 : 1 }})}
        >
          {params.value ? <Check className="w-4 h-4 text-blue-600" /> : <X className="w-4 h-4 text-gray-300" />}
        </Button>
      ),
      cellClass: 'flex items-center justify-center'
    },
    { 
      field: 'base_price', 
      headerName: '기준가', 
      width: 110, 
      editable: true,
      valueFormatter: (p) => fmt(p.value),
      onCellValueChanged: (p) => updateMutation.mutate({ stk_cd: p.data.stk_cd, data: { base_price: toNum(p.newValue) }})
    },
    { 
      field: 'sell_rate', 
      headerName: '매도%', 
      width: 90, 
      editable: true,
      valueFormatter: (p) => p.value ? `${p.value}%` : '',
      onCellValueChanged: (p) => updateMutation.mutate({ stk_cd: p.data.stk_cd, data: { sell_rate: parseFloat(p.newValue) }})
    },
    { 
      field: 'sell_price', 
      headerName: '매도목표가', 
      width: 110, 
      editable: true,
      valueFormatter: (p) => fmt(p.value),
      onCellValueChanged: (p) => updateMutation.mutate({ stk_cd: p.data.stk_cd, data: { sell_price: toNum(p.newValue) }})
    },
    { 
      field: 'buy_rate', 
      headerName: '매수%', 
      width: 90, 
      editable: true,
      valueFormatter: (p) => p.value ? `${p.value}%` : '',
      onCellValueChanged: (p) => updateMutation.mutate({ stk_cd: p.data.stk_cd, data: { buy_rate: parseFloat(p.newValue) }})
    },
    { 
      field: 'buy_price', 
      headerName: '매수목표가', 
      width: 110, 
      editable: true,
      valueFormatter: (p) => fmt(p.value),
      onCellValueChanged: (p) => updateMutation.mutate({ stk_cd: p.data.stk_cd, data: { buy_price: toNum(p.newValue) }})
    },
    { field: 'sector', headerName: '섹터', width: 120, editable: true, onCellValueChanged: (p) => updateMutation.mutate({ stk_cd: p.data.stk_cd, data: { sector: p.newValue }}) },
    { 
      headerName: '액션', 
      width: 120, 
      pinned: 'right',
      cellRenderer: (params: any) => (
        <div className="flex gap-1 items-center h-full">
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="상세정보 갱신" onClick={() => fillSpecMutation.mutate(params.data.stk_cd)}>
            <Info className="w-4 h-4 text-blue-500" />
          </Button>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="삭제" onClick={() => { if(confirm('삭제하시겠습니까?')) deleteMutation.mutate(params.data.stk_cd) }}>
            <Trash2 className="w-4 h-4 text-red-500" />
          </Button>
        </div>
      )
    }
  ], [updateMutation, deleteMutation, fillSpecMutation, setStockDetail])

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
          <Button variant="outline" size="sm" onClick={() => syncMutation.mutate()} disabled={syncMutation.isPending}>
            <RefreshCw className={`w-4 h-4 mr-2 ${syncMutation.isPending ? 'animate-spin' : ''}`} />
            보유 종목 동기화
          </Button>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="w-4 h-4 mr-2" />
            새로고침
          </Button>
        </div>
      </div>

      <div className="flex-1 bg-white rounded-lg shadow-sm border overflow-hidden ag-theme-alpine">
        <AgGridReact
          ref={gridRef}
          rowData={data ?? []}
          columnDefs={columnDefs}
          defaultColDef={{
            sortable: false,
            filter: false,
            resizable: true,
          }}
          rowSelection={{ mode: 'multiRow' }}
          animateRows={true}
          getRowId={(params) => params.data.stk_cd}
        />
      </div>
      
      {/* Spec 정보 요약 (선택된 행이 있을 때 표시하거나, AG Grid의 Detail 셀 활용 가능) */}
      <div className="mt-4 text-[11px] text-gray-500 flex gap-4">
        <span>* 기준가 수정 시 목표가가 자동 계산됩니다 (비율 유지).</span>
        <span>* 비율 수정 시 목표가가 자동 계산됩니다.</span>
        <span>* 목표가 수정 시 비율이 자동 계산됩니다.</span>
      </div>
    </div>
  )
}
