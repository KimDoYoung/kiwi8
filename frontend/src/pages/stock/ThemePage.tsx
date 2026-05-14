import { useState, useMemo, useRef, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AgGridReact } from 'ag-grid-react'
import type { ColDef } from 'ag-grid-community'
import { AllCommunityModule, ModuleRegistry } from 'ag-grid-community'
import { Search, RefreshCw, ChevronRight, X, Filter } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Switch } from '@/shared/components/ui/switch'
import { Label } from '@/shared/components/ui/label'
import { fetchThemes, fetchThemeNames, type JudalTheme } from '@/services/stockService'
import { fmt, numComparator } from '@/lib/utils'
import Loading from '@/shared/components/Loading'
import LoadingFail from '@/shared/components/LoadingFail'
import { useStockDetailStore } from '@/store/stockDetailStore'
import { useLayoutStore } from '@/store/layoutStore'
import { cn } from '@/lib/utils'

ModuleRegistry.registerModules([AllCommunityModule])

export default function ThemePage() {
  const gridRef = useRef<AgGridReact>(null)
  const setStockDetail = useStockDetailStore((s) => s.setStock)
  const openByScreenNo = useLayoutStore((s) => s.openByScreenNo)

  const [themeMode, setThemeMode] = useState(false) // 테마별 보기 스위치
  const [selectedTheme, setSelectedTheme] = useState<string | null>(null)
  
  const [keyword, setKeyword] = useState('') // 상단 전역 검색용
  const [themeFilter, setThemeFilter] = useState('') // 왼쪽 테마 리스트 필터 전용
  
  const [searchParams, setSearchParams] = useState<{
    theme_name?: string
    theme_name_like?: string
    limit?: number
  }>({ limit: 100 })

  // 테마명 목록 (왼쪽 사이드바용)
  const { data: themeNames, isLoading: isThemeNamesLoading } = useQuery({
    queryKey: ['themeNames'],
    queryFn: fetchThemeNames,
    staleTime: 1000 * 60 * 30,
    enabled: themeMode,
  })

  // 테마 목록 필터링 (사이드바 내의 검색어 적용)
  const filteredThemeNames = useMemo(() => {
    if (!themeNames) return []
    if (!themeFilter.trim()) return themeNames
    const k = themeFilter.toLowerCase()
    return themeNames.filter(t => t.name.toLowerCase().includes(k))
  }, [themeNames, themeFilter])

  // 테마 데이터 조회 (그리드용)
  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['themes', searchParams],
    queryFn: () => fetchThemes(searchParams),
  })

  // 상단 검색 핸들러
  const handleSearch = () => {
    setSelectedTheme(null)
    setThemeFilter('') 
    setSearchParams({
      theme_name_like: keyword.trim() || undefined,
      limit: keyword.trim() ? 1000 : 100
    })
  }

  // 테마 선택 핸들러
  const handleThemeSelect = (themeName: string) => {
    setSelectedTheme(themeName)
    setKeyword(themeName) 
    setSearchParams({
      theme_name: themeName,
      limit: 0
    })
  }

  // 스위치 변경 시 초기화
  useEffect(() => {
    if (!themeMode) {
      setSelectedTheme(null)
      setThemeFilter('')
      setSearchParams({ limit: 100 })
    }
  }, [themeMode])

  const columnDefs = useMemo<ColDef<JudalTheme>[]>(() => [
    { 
      headerName: '테마명', 
      field: 'theme_name', 
      width: 150, 
      pinned: 'left',
      hide: !!selectedTheme
    },
    { 
      headerName: '코드', 
      field: 'stock_code', 
      width: 80,
      pinned: 'left',
      cellRenderer: (params: any) => (
        <span 
          className="font-mono text-gray-500 cursor-pointer hover:text-green-600 hover:underline"
          onClick={(e) => {
            e.stopPropagation();
            window.open(`https://finance.naver.com/item/main.naver?code=${params.value}`, '_blank');
          }}
          title="네이버 증권 열기"
        >
          {params.value}
        </span>
      )
    },
    { 
      headerName: '종목명', 
      field: 'stock_name', 
      width: 130, 
      pinned: 'left',
      cellRenderer: (params: any) => (
        <span 
          className="text-blue-600 font-medium cursor-pointer hover:underline"
          onClick={() => {
             setStockDetail({ stk_cd: params.data.stock_code, stk_nm: params.data.stock_name })
             openByScreenNo('1201')
          }}
        >
          {params.value}
        </span>
      )
    },
    { 
      headerName: '현재가', 
      field: 'current_price', 
      width: 100,
      valueFormatter: (p) => fmt(p.value),
      cellClass: 'text-right font-mono',
      comparator: numComparator
    },
    { 
      headerName: '전일비(%)', 
      field: 'yesterday_ratio', 
      width: 90,
      valueFormatter: (p) => p.value != null ? `${p.value.toFixed(2)}%` : '',
      cellClassRules: {
        'text-red-500': (p: any) => p.value > 0,
        'text-blue-500': (p: any) => p.value < 0,
      },
      cellClass: 'text-right font-mono',
      comparator: numComparator
    },
    { 
      headerName: '3일합산', 
      field: 'three_day_sum', 
      width: 90,
      valueFormatter: (p) => p.value != null ? `${p.value.toFixed(2)}%` : '',
      cellClassRules: {
        'text-red-500': (p: any) => p.value > 0,
        'text-blue-500': (p: any) => p.value < 0,
      },
      cellClass: 'text-right font-mono',
      comparator: numComparator
    },
    { 
      headerName: '기대수익', 
      field: 'expected_return', 
      width: 90,
      valueFormatter: (p) => p.value != null ? `${p.value.toFixed(2)}%` : '',
      cellClass: 'text-right font-mono',
      comparator: numComparator
    },
    { 
      headerName: '시가총액(억)', 
      field: 'market_cap', 
      width: 110,
      valueFormatter: (p) => fmt(p.value),
      cellClass: 'text-right font-mono',
      comparator: numComparator
    },
    { 
      headerName: 'PER', 
      field: 'per', 
      width: 70,
      valueFormatter: (p) => p.value != null ? p.value.toFixed(2) : '',
      cellClass: 'text-right font-mono',
      comparator: numComparator
    },
    { 
      headerName: 'PBR', 
      field: 'pbr', 
      width: 70,
      valueFormatter: (p) => p.value != null ? p.value.toFixed(2) : '',
      cellClass: 'text-right font-mono',
      comparator: numComparator
    },
    { 
      headerName: '거래지수(일)', 
      field: 'volume_index_today', 
      width: 100,
      valueFormatter: (p) => p.value != null ? p.value.toFixed(2) : '',
      cellClass: 'text-right font-mono',
      comparator: numComparator
    },
    { 
      headerName: '관련테마', 
      field: 'related_themes', 
      width: 250,
      tooltipField: 'related_themes'
    },
  ], [selectedTheme])

  if (error) return <LoadingFail message="테마 데이터를 불러오지 못했습니다." onRetry={() => refetch()} />

  return (
    <div className="flex flex-col h-full bg-white">
      {/* 상단 툴바 */}
      <div className="flex items-center justify-between p-3 border-b bg-gray-50/50 gap-4">
        <div className="flex items-center gap-6">
          <div className="flex items-center space-x-2">
            <Switch 
              id="theme-mode" 
              checked={themeMode} 
              onCheckedChange={setThemeMode} 
            />
            <Label htmlFor="theme-mode" className="text-sm font-medium cursor-pointer">
              테마별 보기
            </Label>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="relative group">
              <Input
                placeholder="종목/테마 검색..."
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                className="w-64 h-9 pr-8"
              />
              {keyword && (
                <button 
                  onClick={() => { setKeyword(''); setSelectedTheme(null); }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X size={14} />
                </button>
              )}
            </div>
            <Button size="sm" onClick={handleSearch} disabled={isFetching}>
              <Search size={16} className="mr-1.5" />
              검색
            </Button>
          </div>

          <div className="flex items-center gap-3 border-l pl-4">
             <span className="text-xs text-gray-500 whitespace-nowrap">
               {selectedTheme ? `[${selectedTheme}] ` : ''}{data?.length ?? 0}건 조회됨
             </span>
             <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => refetch()} disabled={isFetching} title="새로고침">
               <RefreshCw size={16} className={isFetching ? 'animate-spin' : ''} />
             </Button>
          </div>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* 왼쪽 테마 사이드바 */}
        {themeMode && (
          <div className="w-64 border-r bg-gray-50/30 flex flex-col">
            <div className="p-2 border-b bg-gray-100/50 space-y-2">
              <div className="flex items-center justify-between px-1">
                <span className="font-semibold text-[11px] text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                  <Filter size={10} />
                  테마 목록 필터
                </span>
                <span className="text-[10px] text-gray-400 font-mono">
                  {filteredThemeNames.length}/{themeNames?.length ?? 0}
                </span>
              </div>
              <div className="relative group">
                <Input
                  placeholder="테마 검색..."
                  value={themeFilter}
                  onChange={(e) => setThemeFilter(e.target.value)}
                  className="h-8 text-xs bg-white pr-7"
                />
                {themeFilter && (
                  <button 
                    onClick={() => setThemeFilter('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto py-1">
              {isThemeNamesLoading ? (
                <div className="p-4 text-center text-xs text-gray-400">로딩 중...</div>
              ) : (
                filteredThemeNames.map((t) => (
                  <div
                    key={t.name}
                    className={cn(
                      "group flex items-center justify-between px-3 py-2 cursor-pointer text-sm transition-colors",
                      selectedTheme === t.name 
                        ? "bg-blue-600 text-white font-semibold shadow-sm" 
                        : "hover:bg-blue-50 text-gray-700"
                    )}
                    onClick={() => handleThemeSelect(t.name)}
                  >
                    <span className="truncate flex-1">{t.name}</span>
                    <ChevronRight size={14} className={cn(
                      "opacity-0 group-hover:opacity-100 transition-opacity",
                      selectedTheme === t.name && "opacity-100"
                    )} />
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* 오른쪽 데이터 그리드 */}
        <div className="flex-1 relative overflow-hidden">
          {isLoading && <Loading overlay />}
          <div className="ag-theme-alpine w-full h-full">
            <AgGridReact
              ref={gridRef}
              rowData={data}
              columnDefs={columnDefs}
              defaultColDef={{
                sortable: true,
                filter: false,
                resizable: true,
              }}
              animateRows={true}
              headerHeight={34}
              rowHeight={32}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
