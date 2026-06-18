import { Edit2, Trash2, BookOpen } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Badge } from '@/shared/components/ui/badge'
import { formatDate } from '@/lib/utils'

export interface DiaryEntry {
  id: number
  ymd: string
  stk_cd: string | null
  note: string
  created_at: string
  updated_at: string
}

interface StkDiaryEntriesProps {
  entries: DiaryEntry[]
  loading: boolean
  onEdit: (entry: DiaryEntry) => void
  onDelete: (id: number) => void
}

export default function StkDiaryEntries({
  entries,
  loading,
  onEdit,
  onDelete,
}: StkDiaryEntriesProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">
        불러오는 중...
      </div>
    )
  }

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-2 text-muted-foreground">
        <BookOpen className="w-8 h-8 opacity-30" />
        <span className="text-sm">작성된 일지가 없습니다.</span>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {entries.map((entry) => (
        <div
          key={entry.id}
          className="border border-gray-200 rounded-lg bg-white overflow-hidden shadow-sm"
        >
          <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-gray-700">
                {formatDate(entry.ymd)}
              </span>
              {entry.stk_cd && (
                <Badge variant="secondary" className="font-mono text-xs">
                  {entry.stk_cd}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-blue-600 hover:text-blue-700"
                onClick={() => onEdit(entry)}
              >
                <Edit2 className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-destructive hover:text-destructive"
                onClick={() => onDelete(entry.id)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          <div
            className="px-4 py-3 diary-prose text-sm overflow-hidden"
            style={{
              display: '-webkit-box',
              WebkitLineClamp: 6,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
            dangerouslySetInnerHTML={{ __html: entry.note }}
          />
        </div>
      ))}
    </div>
  )
}
