import { useState, useMemo, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AgGridReact } from 'ag-grid-react'
import type { ColDef } from 'ag-grid-community'
import { AllCommunityModule, ModuleRegistry } from 'ag-grid-community'
import { Search, RefreshCw, ChevronRight, X, Filter, Settings2 } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Switch } from '@/shared/components/ui/switch'
import { Label } from '@/shared/components/ui/label'
import { Popover, PopoverTrigger, PopoverContent } from '@/shared/components/ui/popover'
import { fetchThemes, fetchThemeNames, type JudalTheme, type ThemeParams } from '@/services/stockService'
import { fetchMenuTree } from '@/services/menuService'
import { fmt, numComparator } from '@/lib/utils'
import Loading from '@/shared/components/Loading'
import LoadingFail from '@/shared/components/LoadingFail'
import ThemeQueryConditionPanel, { type ThemeFilterState } from '@/shared/components/ThemeQueryConditionPanel'
import { useStockDetailStore } from '@/store/stockDetailStore'
import { useLayoutStore } from '@/store/layoutStore'
import { cn } from '@/lib/utils'

ModuleRegistry.registerModules([AllCommunityModule])

const INITIAL_FILTERS: ThemeFilterState = {
  current_price: { value: 0, isOver: true },
  market_cap: { value: 0, isOver: true },
  yesterday_ratio: { value: 0, isOver: true },
  three_day_sum: { value: 0, isOver: true },
  per: { value: 0, isOver: true },
  pbr: { value: 0, isOver: true },
}

export default function ThemePage() {
  const gridRef = useRef<AgGridReact>(null)
  const setStockDetail = useStockDetailStore((s) => s.setStock)
  const openByScreenNo = useLayoutStore((s) => s.openByScreenNo)

  // 메뉴 정보 가져오기 (화면 이동용)
  const { data: menus } = useQuery({
    queryKey: ['menus'],
    queryFn: fetchMenuTree,
    staleTime: 1000 * 60 * 10,
  })

  const [themeMode, setThemeMode] = useState(false) // 테마별 보기 스위치
  
  // 스위치 변경 핸들러
  const handleThemeModeChange = (val: boolean) => {
    setThemeMode(val)
    if (!val) {
      setThemeFilter('')
    }
  }

  const [selectedTheme, setSelectedTheme] = useState<string | null>(null)
  
  const [keyword, setKeyword] = useState('') // 상단 전역 검색용
  const [themeFilter, setThemeFilter] = useState('') // 왼쪽 테마 리스트 필터 전용
  
  const [numFilters, setNumFilters] = useState<ThemeFilterState>(INITIAL_FILTERS)
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false)
  const [filterSummary, setFilterSummary] = useState('')

  const [searchParams, setSearchParams] = useState<ThemeParams>({ limit: 100, deduplicate: true })

  // 필터 요약 문자열 생성
  const getFilterSummary = (filters: ThemeFilterState) => {
    const summary: string[] = []
    if (filters.current_price.value > 0) summary.push(`현재가 ${filters.current_price.value}${filters.current_price.isOver ? '↑' : '↓'}`)
    if (filters.market_cap.value > 0) summary.push(`시총 ${filters.market_cap.value}${filters.market_cap.isOver ? '↑' : '↓'}`)
    if (filters.yesterday_ratio.value !== 0) summary.push(`전일비 ${filters.yesterday_ratio.value}%${filters.yesterday_ratio.isOver ? '↑' : '↓'}`)
    if (filters.three_day_sum.value !== 0) summary.push(`3일합 ${filters.three_day_sum.value}%${filters.three_day_sum.isOver ? '↑' : '↓'}`)
    if (filters.per.value > 0) summary.push(`PER ${filters.per.value}${filters.per.isOver ? '↑' : '↓'}`)
    if (filters.pbr.value > 0) summary.push(`PBR ${filters.pbr.value}${filters.pbr.isOver ? '↑' : '↓'}`)
    return summary.join(', ')
  }

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
  const handleSearch = (customFilters?: ThemeFilterState) => {
    setSelectedTheme(null)
    setThemeFilter('') 
    
    const targetFilters = customFilters || numFilters
    const hasNumericFilter = Object.values(targetFilters).some(f => f.value !== 0)
    
    const params: ThemeParams = {
      theme_name_like: keyword.trim() || undefined,
      deduplicate: true, // 항상 중복 제거
      limit: (keyword.trim() || hasNumericFilter) ? 1000 : 100
    }

    // 수치 필터 적용
    if (targetFilters.current_price.value > 0) {
      if (targetFilters.current_price.isOver) params.current_price_min = targetFilters.current_price.value
      else params.current_price_max = targetFilters.current_price.value
    }
    if (targetFilters.market_cap.value > 0) {
      if (targetFilters.market_cap.isOver) params.market_cap_min = targetFilters.market_cap.value
      else params.market_cap_max = targetFilters.market_cap.value
    }
    if (targetFilters.yesterday_ratio.value !== 0) {
      if (targetFilters.yesterday_ratio.isOver) params.yesterday_ratio_min = targetFilters.yesterday_ratio.value
      else params.yesterday_ratio_max = targetFilters.yesterday_ratio.value
    }
    if (targetFilters.three_day_sum.value !== 0) {
      if (targetFilters.three_day_sum.isOver) params.three_day_sum_min = targetFilters.three_day_sum.value
      else params.three_day_sum_max = targetFilters.three_day_sum.value
    }
    if (targetFilters.per.value > 0) {
      if (targetFilters.per.isOver) params.per_min = targetFilters.per.value
      else params.per_max = targetFilters.per.value
    }
    if (targetFilters.pbr.value > 0) {
      if (targetFilters.pbr.isOver) params.pbr_min = targetFilters.pbr.value
      else params.pbr_max = targetFilters.pbr.value
    }

    setSearchParams(params)
    setIsFilterPanelOpen(false)
    setFilterSummary(getFilterSummary(targetFilters))
  }

  // 필터 초기화
  const handleResetFilters = () => {
    setNumFilters(INITIAL_FILTERS)
    setKeyword('')
    setSelectedTheme(null)
    setSearchParams({ limit: 100, deduplicate: true })
    setFilterSummary('')
  }

  // 테마 선택 핸들러
  const handleThemeSelect = (themeName: string) => {
    setSelectedTheme(themeName)
    setKeyword(themeName) 
    setSearchParams({
      theme_name: themeName,
      deduplicate: true,
      limit: 0
    })
  }

  const columnDefs = useMemo<ColDef<JudalTheme>[]>(() => [
    { 
      headerName: '테마명', 
      field: 'theme_name', 
      width: 150, 
      pinned: 'left',
      hide: !!selectedTheme
    },
    { 
      headerName: '종목코드', 
      field: 'stock_code', 
      width: 90,
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
             setStockDetail(params.data.stock_code, params.data.stock_name)
             openByScreenNo('1201', menus || [])
          }}
        >
          {params.value}
        </span>
      )
    },
    { 
      headerName: '현재가', 
      field: 'current_price', 
      width: 110,
      valueFormatter: (p) => fmt(p.value),
      cellClass: 'text-right font-mono',
      comparator: numComparator
    },
    { 
      headerName: '전일비(%)', 
      field: 'yesterday_ratio', 
      width: 100,
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
      width: 100,
      valueFormatter: (p) => p.value != null ? `${p.value.toFixed(2)}%` : '',
      cellClassRules: {
        'text-red-500': (p: any) => p.value > 0,
        'text-blue-500': (p: any) => p.value < 0,
      },
      cellClass: 'text-right font-mono',
      comparator: numComparator
    },
    { 
      headerName: '시가총액(억)', 
      field: 'market_cap', 
      width: 120,
      valueFormatter: (p) => fmt(p.value),
      cellClass: 'text-right font-mono',
      comparator: numComparator
    },
    { 
      headerName: 'PER', 
      field: 'per', 
      width: 100,
      valueFormatter: (p) => p.value != null ? p.value.toFixed(2) : '',
      cellClass: 'text-right font-mono',
      comparator: numComparator
    },
    { 
      headerName: 'PBR', 
      field: 'pbr', 
      width: 100,
      valueFormatter: (p) => p.value != null ? p.value.toFixed(2) : '',
      cellClass: 'text-right font-mono',
      comparator: numComparator
    },
    { 
      headerName: '거래지수(일)', 
      field: 'volume_index_today', 
      width: 120,
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
  ], [selectedTheme, menus, setStockDetail, openByScreenNo])

  const onRowDoubleClicked = (p: any) => {
    if (!p.data) return
    setStockDetail(p.data.stock_code, p.data.stock_name)
    openByScreenNo('1201', menus || [])
  }

  if (error) return <LoadingFail message="테마 데이터를 불러오지 못했습니다." onRetry={() => refetch()} />

  return (
    <div className="flex flex-col h-full bg-white">
      {/* 상단 툴바 */}
      <div className="flex items-center p-2 border-b bg-gray-50/50 gap-4 overflow-x-auto no-scrollbar">
        {/* 테마별 보기 */}
        <div className="flex items-center space-x-2 shrink-0">
          <Switch id="theme-mode" checked={themeMode} onCheckedChange={handleThemeModeChange} />
          <Label htmlFor="theme-mode" className="text-xs font-medium cursor-pointer whitespace-nowrap">테마별 보기</Label>
        </div>

        {/* 검색창 */}
        <div className="flex items-center gap-1 shrink-0">
          <div className="relative group">
            <Input
              placeholder="종목/테마 검색..."
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="w-48 h-8 pr-7 text-xs"
            />
            {keyword && (
              <button 
                onClick={() => { setKeyword(''); setSelectedTheme(null); }}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X size={12} />
              </button>
            )}
          </div>
        </div>

        {/* 상세 검색 조건 패널 */}
        <div className="flex items-center gap-2">
          <Popover open={isFilterPanelOpen} onOpenChange={setIsFilterPanelOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs font-medium border-gray-300">
                <Settings2 size={14} />
                검색 조건
              </Button>
            </PopoverTrigger>
            <PopoverContent className="p-0 w-auto" align="start">
              <ThemeQueryConditionPanel 
                initialFilters={numFilters} 
                onApply={(f) => {
                  setNumFilters(f);
                  setFilterSummary(getFilterSummary(f));
                  setIsFilterPanelOpen(false);
                }}
                onReset={handleResetFilters}
              />
            </PopoverContent>
          </Popover>

          {filterSummary && (
            <span className="text-[11px] text-blue-600 font-medium bg-blue-50 px-2 py-1 rounded border border-blue-100 animate-in fade-in slide-in-from-left-2 duration-300">
              {filterSummary}
            </span>
          )}

          <Button size="sm" className="h-8 px-3" onClick={() => handleSearch()} disabled={isFetching}>
            <Search size={14} className="mr-1.5" />
            조회
          </Button>
          <Button size="sm" variant="outline" className="h-8 px-3 gap-1.5 border-gray-300" onClick={handleResetFilters}>
            <RefreshCw size={14} className={cn(isFetching && "animate-spin")} />
            초기화
          </Button>
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
          {isLoading && <Loading />}
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
              onRowDoubleClicked={onRowDoubleClicked}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
