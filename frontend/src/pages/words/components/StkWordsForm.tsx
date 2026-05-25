import { useState, useEffect } from 'react'
import { Input } from '@/shared/components/ui/input'
import { Button } from '@/shared/components/ui/button'
import { Label } from '@/shared/components/ui/label'
import { Textarea } from '@/shared/components/ui/textarea'
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/shared/components/ui/card'
import { Loader2, Plus, Save, RotateCcw } from 'lucide-react'
import api from '@/lib/api'
import DiaryEditor from '@/pages/diary/components/DiaryEditor'
import type { WordEntry } from '../StkWordsView'

interface StkWordsFormProps {
  selectedWord: WordEntry | null
  onSaveSuccess: () => void
  onCancelEdit: () => void
}

export default function StkWordsForm({
  selectedWord,
  onSaveSuccess,
  onCancelEdit,
}: StkWordsFormProps) {
  const [word, setWord] = useState('')
  const [brief, setBrief] = useState('')
  const [detail, setDetail] = useState('')
  
  const [editorKey, setEditorKey] = useState<string | number>('new')
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  // selectedWord 변경 시 폼 필드 채우기
  useEffect(() => {
    if (selectedWord) {
      setWord(selectedWord.word)
      setBrief(selectedWord.brief)
      setDetail(selectedWord.detail || '')
      setEditorKey(selectedWord.id)
    } else {
      clearForm()
    }
    setErrorMsg('')
    setSuccessMsg('')
  }, [selectedWord])

  const clearForm = () => {
    setWord('')
    setBrief('')
    setDetail('')
    setEditorKey('new-' + Date.now())
  }

  const isFormInvalid = !word.trim() || !brief.trim()

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isFormInvalid) {
      setErrorMsg('용어와 간단 설명은 필수 입력 항목입니다.')
      return
    }

    setLoading(true)
    setErrorMsg('')
    setSuccessMsg('')

    try {
      const payload = {
        word: word.trim(),
        brief: brief.trim(),
        detail: detail,
      }

      let res
      if (selectedWord) {
        // 수정 모드
        res = await api.put(`/api/v1/words/${selectedWord.id}`, {
          api_id: 'word_update',
          payload: { id: selectedWord.id, ...payload },
        })
      } else {
        // 추가 모드
        res = await api.post('/api/v1/words/', {
          api_id: 'word_create',
          payload,
        })
      }

      if (res.data?.success) {
        setSuccessMsg(selectedWord ? '성공적으로 수정되었습니다!' : '새 용어가 등록되었습니다!')
        if (!selectedWord) {
          clearForm()
        }
        onSaveSuccess()
        setTimeout(() => setSuccessMsg(''), 3000)
      } else {
        setErrorMsg(res.data?.error_message || '저장에 실패했습니다.')
      }
    } catch (err: unknown) {
      const errorObj = err as { response?: { data?: { error_message?: string } }; message?: string }
      setErrorMsg(
        '저장 오류: ' + (errorObj.response?.data?.error_message || errorObj.message || '알 수 없는 에러'),
      )
    } finally {
      setLoading(false)
    }
  }

  const handleReset = () => {
    if (selectedWord) {
      onCancelEdit()
    } else {
      clearForm()
    }
    setErrorMsg('')
    setSuccessMsg('')
  }

  return (
    <Card className="h-full flex flex-col shadow-md border-border bg-card">
      <CardHeader className="border-b bg-muted/40 py-4 shrink-0">
        <CardTitle className="text-lg font-bold flex items-center gap-2">
          {selectedWord ? (
            <>
              <Save className="w-5 h-5 text-indigo-500" />
              경제 용어 수정
            </>
          ) : (
            <>
              <Plus className="w-5 h-5 text-indigo-500" />
              새 경제 용어 추가
            </>
          )}
        </CardTitle>
      </CardHeader>

      <form onSubmit={handleSave} className="flex-1 flex flex-col overflow-hidden">
        <CardContent className="p-4 space-y-4 flex-1 overflow-y-auto">
          {errorMsg && (
            <div className="p-3 text-sm bg-destructive/10 text-destructive border border-destructive/20 rounded-md">
              {errorMsg}
            </div>
          )}
          {successMsg && (
            <div className="p-3 text-sm bg-green-500/10 text-green-600 border border-green-500/20 rounded-md">
              {successMsg}
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="word-input" className="font-semibold text-sm">
              용어명 (단어) <span className="text-destructive">*</span>
            </Label>
            <Input
              id="word-input"
              placeholder="예: 인플레이션, PBR, 공매도 등"
              value={word}
              onChange={(e) => setWord(e.target.value)}
              maxLength={100}
              className="bg-background border-input"
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="brief-input" className="font-semibold text-sm">
              간단 설명 <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="brief-input"
              placeholder="용어의 핵심 요약을 적어주세요 (1~2줄 내외)"
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              maxLength={300}
              rows={2}
              className="resize-none bg-background border-input"
              required
            />
          </div>

          <div className="space-y-1.5 flex-1 flex flex-col">
            <Label className="font-semibold text-sm">상세 설명</Label>
            <div className="flex-1 min-h-[220px]">
              <DiaryEditor
                key={editorKey}
                value={detail}
                onChange={setDetail}
                placeholder="해당 경제 용어에 대한 유익하고 풍부한 상세 지식을 남겨주세요... 이미지 붙여넣기(Ctrl+V) 지원"
                minHeight="200px"
              />
            </div>
          </div>
        </CardContent>

        <CardFooter className="border-t bg-muted/20 py-3 px-4 shrink-0 flex justify-between gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={handleReset}
            disabled={loading}
            className="flex items-center gap-1.5"
          >
            <RotateCcw className="w-4 h-4" />
            {selectedWord ? '수정 취소' : '초기화'}
          </Button>

          <Button
            type="submit"
            disabled={loading || isFormInvalid}
            className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            {selectedWord ? '수정 완료' : '용어 저장'}
          </Button>
        </CardFooter>
      </form>
    </Card>
  )
}
