import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/shared/components/ui/dialog'
import { Input } from '@/shared/components/ui/input'
import { Button } from '@/shared/components/ui/button'
import { Textarea } from '@/shared/components/ui/textarea'
import { Label } from '@/shared/components/ui/label'
import { BookOpen, Search, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react'
import { useModalStore } from '@/store/modalStore'
import api from '@/shared/lib/api'

export default function DiaryEditModal() {
  const { isDiaryEditModalOpen, closeDiaryEditModal, diaryInitialData } = useModalStore()
  
  const [ymd, setYmd] = useState('')
  const [stkCd, setStkCd] = useState('')
  const [stkNm, setStkNm] = useState('')
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(false)
  const [searching, setSearching] = useState(false)
  const [message, setMessage] = useState<{ text: string; type: 'error' | 'success' } | null>(null)

  // 모달 데이터 초기화
  useEffect(() => {
    if (isDiaryEditModalOpen) {
      if (diaryInitialData) {
        setYmd(diaryInitialData.ymd || new Date().toISOString().split('T')[0])
        setStkCd(diaryInitialData.stk_cd || '')
        setStkNm(diaryInitialData.stk_nm || '')
        setNote(diaryInitialData.note || '')
      } else {
        setYmd(new Date().toISOString().split('T')[0])
        setStkCd('')
        setStkNm('')
        setNote('')
      }
      setMessage(null)
    }
  }, [isDiaryEditModalOpen, diaryInitialData])

  const showMessage = (text: string, type: 'error' | 'success') => {
    setMessage({ text, type })
    setTimeout(() => setMessage(null), 3000)
  }

  const handleSearchStock = async () => {
    if (!stkCd || stkCd.length !== 6) return
    
    setSearching(true)
    try {
      const res = await api.get(`/api/v1/stock/info/${stkCd}`)
      if (res.data && res.data.success && res.data.data) {
        // 백엔드에서 한글 키('종목명')로 반환하므로 이를 처리
        const name = res.data.data['종목명'] || res.data.data.name || res.data.data.stk_nm
        setStkNm(name || '종목명 없음')
      } else {
        setStkNm('')
        showMessage('종목 정보를 찾을 수 없습니다.', 'error')
      }
    } catch (error: any) {
      setStkNm('')
      showMessage('종목 검색 오류: ' + error.message, 'error')
    } finally {
      setSearching(false)
    }
  }

  const handleSave = async () => {
    if (!ymd || !note.trim()) {
      showMessage('날짜와 내용은 필수 입력 사항입니다.', 'error')
      return
    }

    setLoading(true)
    try {
      const payload = {
        ymd: ymd.replace(/-/g, ''),
        stk_cd: stkCd || null,
        note: note.trim()
      }

      let res
      if (diaryInitialData?.id) {
        // 수정
        res = await api.put(`/api/v1/diary/${diaryInitialData.id}`, {
          api_id: 'diary_update',
          payload: { id: diaryInitialData.id, ...payload }
        })
      } else {
        // 신규 저장
        res = await api.post('/api/v1/diary', {
          api_id: 'diary_create',
          payload
        })
      }

      if (res.data && res.data.success) {
        showMessage('주식 일지가 저장되었습니다.', 'success')
        window.dispatchEvent(new CustomEvent('diary-updated'))
        setTimeout(closeDiaryEditModal, 1500)
      } else {
        console.error('Save diary failed:', res.data)
        showMessage(res.data?.error_message || '저장 실패', 'error')
      }
    } catch (error: any) {
      console.error('Save diary error:', error)
      showMessage('저장 오류: ' + (error.response?.data?.error_message || error.message), 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={isDiaryEditModalOpen} onOpenChange={(open) => !open && closeDiaryEditModal()}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-success" />
            {diaryInitialData?.id ? '주식 일지 수정' : '주식 일지 작성'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="date">날짜</Label>
              <Input
                id="date"
                type="date"
                value={ymd}
                onChange={(e) => setYmd(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="stk_cd">종목코드 (선택)</Label>
              <div className="flex gap-2">
                <Input
                  id="stk_cd"
                  placeholder="6자리 코드"
                  value={stkCd}
                  onChange={(e) => setStkCd(e.target.value)}
                  maxLength={6}
                />
                <Button 
                  variant="outline" 
                  size="icon" 
                  onClick={handleSearchStock}
                  disabled={searching || stkCd.length !== 6}
                >
                  {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
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
            <Label htmlFor="note">일지 내용</Label>
            <Textarea
              id="note"
              placeholder="오늘의 매매 복기나 시장 분석을 입력하세요..."
              className="h-40"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          {message && (
            <div className={`flex items-center gap-2 p-2 rounded-md text-sm ${
              message.type === 'success' ? 'bg-green-500/10 text-green-600' : 'bg-destructive/10 text-destructive'
            }`}>
              {message.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
              <span>{message.text}</span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={closeDiaryEditModal}>취소</Button>
          <Button onClick={handleSave} disabled={loading || !note.trim()}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {diaryInitialData?.id ? '수정' : '저장'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
