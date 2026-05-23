import { useState } from 'react'
import { Input } from '@/shared/components/ui/input'
import { Button } from '@/shared/components/ui/button'
import { Label } from '@/shared/components/ui/label'
import { Search, Loader2 } from 'lucide-react'
import api from '@/lib/api'
import DiaryEditor from './DiaryEditor'

interface StkDiaryFormProps {
  ymd: string
  onYmdChange: (v: string) => void
  stkCd: string
  onStkCdChange: (v: string) => void
  stkNm: string
  onStkNmChange: (v: string) => void
  note: string
  onNoteChange: (html: string) => void
  editorKey?: string | number
  onError?: (msg: string) => void
}

export default function StkDiaryForm({
  ymd,
  onYmdChange,
  stkCd,
  onStkCdChange,
  stkNm,
  onStkNmChange,
  note,
  onNoteChange,
  editorKey,
  onError,
}: StkDiaryFormProps) {
  const [searching, setSearching] = useState(false)

  const handleSearchStock = async () => {
    if (!stkCd || stkCd.length !== 6) return
    setSearching(true)
    try {
      const res = await api.get(`/api/v1/stock/info/${stkCd}`)
      if (res.data?.success && res.data.data) {
        const name = res.data.data['종목명'] || res.data.data.name || res.data.data.stk_nm
        onStkNmChange(name || '종목명 없음')
      } else {
        onStkNmChange('')
        onError?.('종목 정보를 찾을 수 없습니다.')
      }
    } catch (error: unknown) {
      onStkNmChange('')
      onError?.('종목 검색 오류: ' + (error as Error).message)
    } finally {
      setSearching(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="diary-ymd">날짜</Label>
          <Input
            id="diary-ymd"
            type="date"
            value={ymd}
            onChange={(e) => onYmdChange(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="diary-stk-cd">종목코드 (선택)</Label>
          <div className="flex gap-2">
            <Input
              id="diary-stk-cd"
              placeholder="6자리 코드"
              value={stkCd}
              onChange={(e) => onStkCdChange(e.target.value)}
              maxLength={6}
              onKeyDown={(e) => e.key === 'Enter' && handleSearchStock()}
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={handleSearchStock}
              disabled={searching || stkCd.length !== 6}
            >
              {searching ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </div>

      {stkNm && (
        <div className="space-y-2">
          <Label>종목명</Label>
          <Input value={stkNm} readOnly className="bg-muted" />
        </div>
      )}

      <div className="space-y-2">
        <Label>일지 내용</Label>
        <DiaryEditor
          key={editorKey}
          value={note}
          onChange={onNoteChange}
          placeholder="오늘의 매매 복기나 시장 분석을 입력하세요..."
          minHeight="280px"
        />
      </div>
    </div>
  )
}
