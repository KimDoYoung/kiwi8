/**
 * 유튜브 링크 삽입 팝오버. URL만 받아 영상 ID를 추출해 mediaEmbed 노드로 삽입한다.
 */
import { useState } from 'react'
import { AlertCircle, Video } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/components/ui/popover'
import { Input } from '@/shared/components/ui/input'

function extractYouTubeId(url: string): string | null {
  const match = url.match(
    /(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{11})/,
  )
  return match ? match[1] : null
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  onInsert: (ytId: string, title: string) => void
}

export default function YoutubeEmbedPopover({ open, onOpenChange, onInsert }: Props) {
  const [url, setUrl] = useState('')
  const [title, setTitle] = useState('')

  const ytId = extractYouTubeId(url)

  function handleInsert() {
    if (!ytId) return
    onInsert(ytId, title.trim() || '유튜브 동영상')
    setUrl('')
    setTitle('')
    onOpenChange(false)
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger
        type="button"
        title="유튜브 삽입"
        className="flex items-center justify-center p-1.5 rounded text-gray-600 hover:bg-gray-100 transition-colors"
      >
        <Video className="w-4 h-4" />
      </PopoverTrigger>
      <PopoverContent className="w-72 p-2" align="start">
        <div className="flex flex-col gap-2">
          <Input
            placeholder="YouTube URL (watch, youtu.be, shorts 지원)"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            autoFocus
          />
          <Input
            placeholder="제목 (비워두면 '유튜브 동영상')"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleInsert()}
          />
          {url.trim() && !ytId && (
            <div className="flex items-center gap-1.5 text-[11px] text-red-500">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              유효한 YouTube 링크가 아닙니다.
            </div>
          )}
          <div className="flex justify-end">
            <button
              type="button"
              disabled={!ytId}
              onClick={handleInsert}
              className="px-2 py-1 text-xs rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 transition-colors"
            >
              삽입
            </button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
