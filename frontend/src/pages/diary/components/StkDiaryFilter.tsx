import { Search, Calendar, RefreshCw, FileText, SearchCode } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Card, CardContent } from '@/shared/components/ui/card'

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
}: StkDiaryFilterProps) {
  return (
    <Card className="shrink-0">
      <CardContent className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase text-muted-foreground">시작일</label>
            <div className="relative">
              <Calendar className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="date"
                value={startDate}
                onChange={(e) => onStartDateChange(e.target.value)}
                className="pl-9 h-9"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase text-muted-foreground">종료일</label>
            <div className="relative">
              <Calendar className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="date"
                value={endDate}
                onChange={(e) => onEndDateChange(e.target.value)}
                className="pl-9 h-9"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase text-muted-foreground">종목코드</label>
            <div className="relative">
              <SearchCode className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="코드 6자리"
                value={stkCd}
                onChange={(e) => onStkCdChange(e.target.value)}
                className="pl-9 h-9 font-mono"
                maxLength={6}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase text-muted-foreground">내용 검색</label>
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
          <Button onClick={onSearch} disabled={loading} className="h-9">
            {loading ? (
              <RefreshCw className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <Search className="w-4 h-4 mr-2" />
            )}
            조회
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
