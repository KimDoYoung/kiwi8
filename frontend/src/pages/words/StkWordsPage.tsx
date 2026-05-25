import { useState } from 'react'
import { BookOpen } from 'lucide-react'
import StkWordsList from './components/StkWordsList'
import StkWordsForm from './components/StkWordsForm'
import StkWordsView, { type WordEntry } from './StkWordsView'

export default function StkWordsPage() {
  const [selectedWord, setSelectedWord] = useState<WordEntry | null>(null)
  const [viewWord, setViewWord] = useState<WordEntry | null>(null)
  const [isViewOpen, setIsViewOpen] = useState(false)
  const [refreshTrigger, setRefreshTrigger] = useState(0)

  const handleSaveSuccess = () => {
    // 저장 성공 시 리스트 갱신 유도
    setRefreshTrigger((prev) => prev + 1)
    setSelectedWord(null) // 수정 모드 해제
  }

  const handleDeleteSuccess = () => {
    // 삭제 성공 시 리스트 갱신 유도 및 선택된 것이 삭제되었다면 선택 해제
    setRefreshTrigger((prev) => prev + 1)
    setSelectedWord(null)
  }

  const handleSelectWord = (word: WordEntry) => {
    setSelectedWord(word)
  }

  const handleViewWord = (word: WordEntry) => {
    setViewWord(word)
    setIsViewOpen(true)
  }

  const handleCancelEdit = () => {
    setSelectedWord(null)
  }

  return (
    <div className="p-4 space-y-4 h-full flex flex-col overflow-hidden bg-background">
      {/* 헤더 영역 */}
      <div className="flex justify-between items-center shrink-0">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-indigo-100 dark:bg-indigo-900/50 rounded-lg">
            <BookOpen className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">경제 용어 매니저</h1>
            <p className="text-xs text-muted-foreground">나만의 금융 경제 사전 및 투자 단어 관리</p>
          </div>
        </div>
      </div>

      {/* 컨텐츠 분할 영역 (좌: 리스트, 우: 등록/수정 폼) */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-4 overflow-hidden">
        {/* 좌측 리스트 (45% 영역) */}
        <div className="lg:col-span-5 flex flex-col overflow-hidden h-full">
          <StkWordsList
            onSelectWord={handleSelectWord}
            onViewWord={handleViewWord}
            selectedWordId={selectedWord ? selectedWord.id : null}
            refreshTrigger={refreshTrigger}
            onDeleteSuccess={handleDeleteSuccess}
          />
        </div>

        {/* 우측 폼 (55% 영역) */}
        <div className="lg:col-span-7 overflow-hidden h-full">
          <StkWordsForm
            selectedWord={selectedWord}
            onSaveSuccess={handleSaveSuccess}
            onCancelEdit={handleCancelEdit}
          />
        </div>
      </div>

      {/* 상세 보기 팝업 모달 */}
      <StkWordsView
        word={viewWord}
        isOpen={isViewOpen}
        onClose={() => {
          setIsViewOpen(false)
          setViewWord(null)
        }}
      />
    </div>
  )
}
