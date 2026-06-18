import { useState, useEffect, useCallback } from 'react'
import { Plus, BookOpen } from 'lucide-react'
import { format, subDays } from 'date-fns'
import { Button } from '@/shared/components/ui/button'
import { useModalStore, type DiaryInitialData } from '@/store/modalStore'
import api from '@/lib/api'
import StkDiaryEntries, { type DiaryEntry } from './components/StkDiaryEntries'
import StkDiaryFilter from './components/StkDiaryFilter'

export default function StkDiaryList() {
  const { openDiaryEditModal } = useModalStore()

  const [startDate, setStartDate] = useState(format(subDays(new Date(), 30), 'yyyy-MM-dd'))
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [stkCd, setStkCd] = useState('')
  const [keyword, setKeyword] = useState('')

  const [entries, setEntries] = useState<DiaryEntry[]>([])
  const [loading, setLoading] = useState(false)

  const fetchDiaries = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.post('/api/v1/diary/list', {
        api_id: 'diary_list',
        payload: {
          start_ymd: startDate.replace(/-/g, ''),
          end_ymd: endDate.replace(/-/g, ''),
          stk_cd: stkCd || null,
          note_like: keyword || null,
          page: 1,
          limit: 1000,
        },
      })
      if (res.data?.success) {
        setEntries(res.data.data.list || [])
      }
    } catch (error) {
      console.error('Failed to fetch diaries:', error)
    } finally {
      setLoading(false)
    }
  }, [startDate, endDate, stkCd, keyword])

  useEffect(() => {
    fetchDiaries()
    const handleUpdate = () => fetchDiaries()
    window.addEventListener('diary-updated', handleUpdate)
    return () => window.removeEventListener('diary-updated', handleUpdate)
  }, [fetchDiaries])

  const handleDelete = async (id: number) => {
    if (!window.confirm('정말 삭제하시겠습니까?')) return
    try {
      const res = await api.delete(`/api/v1/diary/${id}`)
      if (res.data?.success) {
        fetchDiaries()
      } else {
        alert('삭제 실패: ' + (res.data?.error_message || '알 수 없는 오류'))
      }
    } catch (error: unknown) {
      alert('삭제 중 오류 발생: ' + (error as Error).message)
    }
  }

  const handleEdit = (entry: DiaryEntry) => {
    openDiaryEditModal(entry as unknown as DiaryInitialData)
  }

  return (
    <div className="p-4 space-y-4 h-full flex flex-col overflow-hidden">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-green-100 rounded-lg">
            <BookOpen className="w-5 h-5 text-green-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold">매매 일지</h1>
            <p className="text-xs text-muted-foreground">나만의 투자 기록과 시장 분석</p>
          </div>
        </div>
        <Button onClick={() => openDiaryEditModal()}>
          <Plus className="w-4 h-4 mr-2" />
          새 일지 작성
        </Button>
      </div>

      <StkDiaryFilter
        startDate={startDate}
        endDate={endDate}
        stkCd={stkCd}
        keyword={keyword}
        loading={loading}
        onStartDateChange={setStartDate}
        onEndDateChange={setEndDate}
        onStkCdChange={setStkCd}
        onKeywordChange={setKeyword}
        onSearch={fetchDiaries}
      />

      <div className="flex-1 min-h-0 overflow-y-auto">
        <StkDiaryEntries
          entries={entries}
          loading={loading}
          onEdit={handleEdit}
          onDelete={handleDelete}
        />
      </div>
    </div>
  )
}
