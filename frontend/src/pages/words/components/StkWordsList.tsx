import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent } from '@/shared/components/ui/card'
import { Input } from '@/shared/components/ui/input'
import { Button } from '@/shared/components/ui/button'
import { Search, Edit2, Trash2, Eye, RefreshCw, BookOpen } from 'lucide-react'
import api from '@/lib/api'
import type { WordEntry } from '../StkWordsView'

interface StkWordsListProps {
  onSelectWord: (word: WordEntry) => void
  onViewWord: (word: WordEntry) => void
  selectedWordId: number | null
  refreshTrigger: number
  onDeleteSuccess: () => void
}

export default function StkWordsList({
  onSelectWord,
  onViewWord,
  selectedWordId,
  refreshTrigger,
  onDeleteSuccess,
}: StkWordsListProps) {
  const [keyword, setKeyword] = useState('')
  const [words, setWords] = useState<WordEntry[]>([])
  const [loading, setLoading] = useState(false)

  const fetchWords = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.post('/api/v1/words/list', {
        api_id: 'word_list',
        payload: {
          word_like: keyword || null,
          page: 1,
          limit: 1000,
        },
      })
      if (res.data?.success) {
        setWords(res.data.data.list || [])
      }
    } catch (error) {
      console.error('[StkWordsList] Failed to fetch economic words:', error)
    } finally {
      setLoading(false)
    }
  }, [keyword])

  // 최초 로드 & 외부 리프레시 트리거 발생 시 실행
  useEffect(() => {
    fetchWords()
  }, [fetchWords, refreshTrigger])

  const handleDelete = async (e: React.MouseEvent, id: number, name: string) => {
    e.stopPropagation()
    if (!window.confirm(`'${name}' 용어를 정말 삭제하시겠습니까?`)) return
    
    try {
      const res = await api.delete(`/api/v1/words/${id}`)
      if (res.data?.success) {
        onDeleteSuccess()
        fetchWords()
      } else {
        alert('삭제 실패: ' + (res.data?.error_message || '알 수 없는 오류'))
      }
    } catch (err: unknown) {
      const errorObj = err as { response?: { data?: { error_message?: string } }; message?: string }
      alert('삭제 오류: ' + (errorObj.response?.data?.error_message || errorObj.message || '오류 발생'))
    }
  }

  return (
    <div className="h-full flex flex-col space-y-3 overflow-hidden">
      {/* 검색 바 영역 */}
      <div className="flex gap-2 shrink-0">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="단어 또는 초성 검색..."
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && fetchWords()}
            className="pl-9 bg-background border-input"
          />
        </div>
        <Button 
          variant="outline" 
          onClick={fetchWords} 
          disabled={loading}
          className="flex items-center gap-1"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          조회
        </Button>
      </div>

      {/* 리스트 카드 영역 */}
      <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
        {loading && words.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="w-6 h-6 animate-spin text-indigo-500" />
            <span className="text-sm text-muted-foreground ml-2">용어 불러오는 중...</span>
          </div>
        ) : words.length === 0 ? (
          <div className="text-center py-16 bg-muted/20 border border-dashed rounded-lg">
            <BookOpen className="w-10 h-10 text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">등록된 경제 용어가 없습니다.</p>
            {keyword && <p className="text-xs text-muted-foreground/60 mt-1">검색어를 확인해 주세요.</p>}
          </div>
        ) : (
          words.map((item) => {
            const isSelected = item.id === selectedWordId
            return (
              <Card
                key={item.id}
                onClick={() => onViewWord(item)}
                className={`py-3 transition-all duration-200 cursor-pointer border hover:border-indigo-300 hover:shadow-sm ${
                  isSelected
                    ? 'border-indigo-500 bg-indigo-500/5 ring-1 ring-indigo-500'
                    : 'border-border bg-card'
                }`}
              >
                <CardContent className="px-3.5 py-2 flex items-start justify-between gap-4">
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-base truncate text-card-foreground">
                        {item.word}
                      </h3>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                      {item.brief}
                    </p>
                  </div>
                  
                  {/* 버튼 그룹 */}
                  <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                    <Button
                      variant="ghost"
                      size="icon"
                      title="상세 보기"
                      className="h-8 w-8 text-muted-foreground hover:text-indigo-600 hover:bg-indigo-500/10"
                      onClick={() => onViewWord(item)}
                    >
                      <Eye className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      title="수정하기"
                      className={`h-8 w-8 ${
                        isSelected 
                          ? 'text-indigo-600 bg-indigo-500/10' 
                          : 'text-muted-foreground hover:text-indigo-600 hover:bg-indigo-500/10'
                      }`}
                      onClick={() => onSelectWord(item)}
                    >
                      <Edit2 className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      title="삭제하기"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                      onClick={(e) => handleDelete(e, item.id, item.word)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })
        )}
      </div>
    </div>
  )
}
