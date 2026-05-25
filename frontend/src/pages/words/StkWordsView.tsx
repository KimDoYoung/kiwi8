import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog'
import { BookOpen, Calendar, Clock } from 'lucide-react'

export interface WordEntry {
  id: number
  word: string
  brief: string
  detail?: string | null
  created_at: string
  updated_at: string
}

interface StkWordsViewProps {
  word: WordEntry | null
  isOpen: boolean
  onClose: () => void
}

export default function StkWordsView({ word, isOpen, onClose }: StkWordsViewProps) {
  if (!word) return null

  // 상세 설명이 비어있거나 HTML 태그 뿐인지 체크
  const hasDetail = word.detail && word.detail.replace(/<[^>]*>/g, '').trim() !== ''

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[700px] max-h-[85vh] overflow-y-auto bg-card text-card-foreground shadow-lg border border-border">
        <DialogHeader className="border-b pb-3">
          <DialogTitle className="flex items-center gap-2 text-xl font-bold text-primary">
            <BookOpen className="w-5 h-5 text-indigo-500" />
            {word.word}
          </DialogTitle>
          <p className="text-sm text-muted-foreground mt-1 font-medium bg-muted/50 p-2 rounded border-l-4 border-indigo-500">
            {word.brief}
          </p>
        </DialogHeader>

        <div className="py-4 space-y-4">
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-muted-foreground flex items-center gap-1.5">
              상세 설명
            </h3>
            {hasDetail ? (
              <div className="bg-white dark:bg-zinc-950 p-5 rounded-lg border border-border shadow-inner max-h-[45vh] overflow-y-auto">
                <div 
                  className="diary-prose ProseMirror text-sm leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: word.detail || '' }}
                />
              </div>
            ) : (
              <div className="text-sm text-muted-foreground italic py-8 text-center bg-muted/20 rounded border border-dashed">
                등록된 상세 설명이 없습니다.
              </div>
            )}
          </div>

          <div className="flex items-center justify-between text-xs text-muted-foreground border-t pt-3 mt-4">
            <div className="flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" />
              <span>등록일: {word.created_at}</span>
            </div>
            <div className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              <span>수정일: {word.updated_at}</span>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
