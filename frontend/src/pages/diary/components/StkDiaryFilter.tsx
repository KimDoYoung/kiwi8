import { Search, RefreshCw, FileText, SearchCode, RotateCcw } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Card, CardContent } from '@/shared/components/ui/card'
import { DateRangePicker } from '@/shared/components/DateRangePicker'
import { useModalStore } from '@/store/modalStore'

interface StkDiaryFilterProps {
  startDate: string
  endDate: string
  stkCd: string
  keyword: string
  loading: boolean
  onStartDateChange: (value: string) => void
  onEndDateChange: (value: string) => void
  onStkCdChange: (value: string) => void
  onKeywordChange: (value: string) => void
  onSearch: () => void
  onReset: () => void
}

export default function StkDiaryFilter({
  startDate,
  endDate,
  stkCd,
  keyword,
  loading,
  onStartDateChange,
  onEndDateChange,
  onStkCdChange,
  onKeywordChange,
  onSearch,
  onReset,
}: StkDiaryFilterProps) {
  const openStockFindModal = useModalStore((s) => s.openStockFindModal)

  return (
    <Card className="shrink-0 py-5">
      <CardContent className="px-4">
        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-1.5">
            <label className="text-[12px] font-bold uppercase text-muted-foreground">조회기간</label>
            <DateRangePicker
              returnFormat="yyyy-MM-dd"
              startDate={startDate}
              endDate={endDate}
              onChange={(s, e) => {
                onStartDateChange(s)
                onEndDateChange(e)
              }}
            />
          </div>
          <div className="space-y-1.5 flex-1 min-w-[140px]">
            <label className="text-[12px] font-bold uppercase text-muted-foreground">종목코드</label>
            <div className="flex gap-1.5">
              <div className="relative flex-1">
                <SearchCode className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="코드 6자리"
                  value={stkCd}
                  onChange={(e) => onStkCdChange(e.target.value)}
                  className="pl-9 h-9 font-mono"
                  maxLength={6}
                />
              </div>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-9 w-9 shrink-0"
                onClick={() => openStockFindModal((selectedStkCd) => onStkCdChange(selectedStkCd))}
                aria-label="종목 찾기"
              >
                <Search className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="space-y-1.5 flex-1 min-w-[200px]">
            <label className="text-[12px] font-bold uppercase text-muted-foreground">내용 검색</label>
            <div className="relative">
              <FileText className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="검색어 입력"
                value={keyword}
                onChange={(e) => onKeywordChange(e.target.value)}
                className="pl-9 h-9"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={onSearch} disabled={loading} className="h-9 flex-1">
              {loading ? (
                <RefreshCw className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Search className="w-4 h-4 mr-2" />
              )}
              조회
            </Button>
            <Button onClick={onReset} disabled={loading} variant="outline" className="h-9">
              <RotateCcw className="w-4 h-4 mr-2" />
              초기화
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
