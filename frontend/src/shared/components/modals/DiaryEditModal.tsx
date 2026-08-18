import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/shared/components/ui/dialog'
import { Button } from '@/shared/components/ui/button'
import { BookOpen, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react'
import { useModalStore } from '@/store/modalStore'
import api from '@/lib/api'
import StkDiaryForm from '@/pages/diary/components/StkDiaryForm'

export default function DiaryEditModal() {
  const { isDiaryEditModalOpen, closeDiaryEditModal, diaryInitialData } = useModalStore()

  const [ymd, setYmd] = useState('')
  const [stkCd, setStkCd] = useState('')
  const [stkNm, setStkNm] = useState('')
  const [note, setNote] = useState('')
  const [editorKey, setEditorKey] = useState<string | number>('new')
  const [currentId, setCurrentId] = useState<string | undefined>(undefined)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ text: string; type: 'error' | 'success' } | null>(null)

  useEffect(() => {
    if (isDiaryEditModalOpen) {
      if (diaryInitialData) {
        setYmd(diaryInitialData.ymd || new Date().toISOString().split('T')[0])
        setStkCd(diaryInitialData.stk_cd || '')
        setStkNm(diaryInitialData.stk_nm || '')
        setNote(diaryInitialData.note || '')
        setEditorKey(diaryInitialData.id ?? 'new')
        setCurrentId(diaryInitialData.id)
      } else {
        setYmd(new Date().toISOString().split('T')[0])
        setStkCd('')
        setStkNm('')
        setNote('')
        setEditorKey('new-' + Date.now())
        setCurrentId(undefined)
      }
      setMessage(null)
    }
  }, [isDiaryEditModalOpen, diaryInitialData])

  const showMessage = (text: string, type: 'error' | 'success') => {
    setMessage({ text, type })
    setTimeout(() => setMessage(null), 3000)
  }

  const isNoteEmpty = !note || note.replace(/<[^>]*>/g, '').trim() === ''

  const handleSave = async (keepOpen = false) => {
    if (!ymd || isNoteEmpty) {
      showMessage('날짜와 내용은 필수 입력 사항입니다.', 'error')
      return
    }

    setLoading(true)
    try {
      const payload = {
        ymd: ymd.replace(/-/g, ''),
        stk_cd: stkCd || null,
        note,
      }

      let res
      if (currentId) {
        res = await api.put(`/api/v1/diary/${currentId}`, {
          api_id: 'diary_update',
          payload: { id: currentId, ...payload },
        })
      } else {
        res = await api.post('/api/v1/diary/', {
          api_id: 'diary_create',
          payload,
        })
      }

      if (res.data?.success) {
        showMessage('주식 일지가 저장되었습니다.', 'success')
        window.dispatchEvent(new CustomEvent('diary-updated'))
        if (!currentId && res.data.data?.id) {
          setCurrentId(String(res.data.data.id))
        }
        if (!keepOpen) {
          setTimeout(closeDiaryEditModal, 1500)
        }
      } else {
        showMessage(res.data?.error_message || '저장 실패', 'error')
      }
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error_message?: string } }; message?: string }
      showMessage(
        '저장 오류: ' + (err.response?.data?.error_message || err.message || '알 수 없는 오류'),
        'error',
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={isDiaryEditModalOpen} onOpenChange={(open) => !open && closeDiaryEditModal()}>
      <DialogContent className="sm:max-w-[800px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-success" />
            {currentId ? '주식 일지 수정' : '주식 일지 작성'}
          </DialogTitle>
        </DialogHeader>

        <div className="py-4">
          <StkDiaryForm
            ymd={ymd}
            onYmdChange={setYmd}
            stkCd={stkCd}
            onStkCdChange={setStkCd}
            stkNm={stkNm}
            onStkNmChange={setStkNm}
            note={note}
            onNoteChange={setNote}
            editorKey={editorKey}
            onError={(msg) => showMessage(msg, 'error')}
            onSave={() => handleSave(true)}
          />

          {message?.type === 'error' && (
            <div className="flex items-center gap-2 p-2 rounded-md text-sm mt-4 bg-destructive/10 text-destructive">
              <AlertCircle className="w-4 h-4" />
              <span>{message.text}</span>
            </div>
          )}
        </div>

        <DialogFooter>
          {message?.type === 'success' && (
            <span className="flex items-center gap-1 text-sm text-green-600 sm:mr-auto">
              <CheckCircle2 className="w-4 h-4" />
              {message.text}
            </span>
          )}
          <Button variant="outline" onClick={closeDiaryEditModal}>
            취소
          </Button>
          <Button onClick={() => handleSave()} disabled={loading || isNoteEmpty}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {currentId ? '수정' : '저장'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
