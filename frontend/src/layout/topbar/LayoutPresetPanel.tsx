import { useState, useRef, useEffect, forwardRef, useImperativeHandle } from 'react'
import { LayoutTemplate, Save, Trash2 } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useLayoutStore } from '@/store/layoutStore'
import {
  fetchLayoutPresets,
  upsertLayoutPreset,
  deleteLayoutPreset,
  type LayoutPreset,
} from '@/services/layoutPresetService'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/shared/components/ui/dialog'
import { Button } from '@/shared/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/shared/components/ui/popover'

export interface LayoutPresetPanelHandle {
  openPanel: () => void
}

const LayoutPresetPanel = forwardRef<LayoutPresetPanelHandle>(function LayoutPresetPanel(_, ref) {
  const [popoverOpen, setPopoverOpen] = useState(false)
  const [saveDialogOpen, setSaveDialogOpen] = useState(false)
  const [presetName, setPresetName] = useState('')
  const [selectedIdx, setSelectedIdx] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const queryClient = useQueryClient()
  const { getModel, loadPreset } = useLayoutStore()

  useImperativeHandle(ref, () => ({
    openPanel: () => setPopoverOpen(true),
  }))

  // 다이얼로그 열릴 때 input 포커스
  useEffect(() => {
    if (saveDialogOpen) {
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [saveDialogOpen])

  // Popover 열릴 때 첫 항목 선택 + content 포커스
  useEffect(() => {
    if (popoverOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedIdx(0)
      setTimeout(() => contentRef.current?.focus(), 50)
    }
  }, [popoverOpen])

  const { data: presets = [] } = useQuery({
    queryKey: ['layout-presets'],
    queryFn: fetchLayoutPresets,
  })

  const saveMutation = useMutation({
    mutationFn: ({ name, json }: { name: string; json: string }) =>
      upsertLayoutPreset(name, json),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['layout-presets'] })
      setSaveDialogOpen(false)
      setPresetName('')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: deleteLayoutPreset,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['layout-presets'] })
    },
  })

  const handleSave = () => {
    const name = presetName.trim()
    if (!name) return
    if (!isDuplicate && presets.length >= 10) return
    const json = JSON.stringify(getModel().toJson())
    saveMutation.mutate({ name, json })
  }

  const handleLoad = (preset: LayoutPreset) => {
    loadPreset(preset.layout_json)
    setPopoverOpen(false)
  }

  const handleContentKeyDown = (e: React.KeyboardEvent) => {
    if (presets.length === 0) return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIdx(i => Math.min(i + 1, presets.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIdx(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (selectedIdx >= 0 && selectedIdx < presets.length) {
        handleLoad(presets[selectedIdx])
      }
    } else if (e.key === 'Escape') {
      setPopoverOpen(false)
    } else {
      const num = e.key === '0' ? 9 : parseInt(e.key) - 1
      if (!isNaN(num) && num >= 0 && num < presets.length) {
        e.preventDefault()
        handleLoad(presets[num])
      }
    }
  }

  const isDuplicate = presets.some((p) => p.name === presetName.trim())
  const atLimit = !isDuplicate && presets.length >= 10

  return (
    <>
      <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
        <PopoverTrigger
          className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors data-[popup-open]:text-blue-600 data-[popup-open]:bg-blue-50"
          title="화면 배치 (F9)"
        >
          <LayoutTemplate size={15} />
        </PopoverTrigger>

        <PopoverContent
          ref={contentRef}
          tabIndex={-1}
          onKeyDown={handleContentKeyDown}
          align="end"
          className="w-64 p-0 focus:outline-none"
        >
          {/* 헤더 */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100">
            <span className="text-xs font-semibold text-gray-600">화면 배치 레이아웃</span>
            <button
              onClick={() => setSaveDialogOpen(true)}
              className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 transition-colors"
            >
              <Save size={12} />
              현재 배치 저장
            </button>
          </div>

          {/* 프리셋 목록 */}
          <div className="max-h-64 overflow-y-auto py-1">
            {presets.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-4">저장된 화면배치 레이아웃 없습니다</p>
            ) : (
              presets.map((preset, i) => (
                <div
                  key={preset.id}
                  className={`flex items-center gap-1 px-3 py-1.5 group cursor-pointer
                    ${i === selectedIdx ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                  onMouseEnter={() => setSelectedIdx(i)}
                >
                  <span className="text-[10px] text-gray-400 font-mono w-4 shrink-0 select-none">
                    {i < 9 ? i + 1 : '0'}
                  </span>
                  <button
                    onClick={() => handleLoad(preset)}
                    title="클릭하여 적용"
                    className="flex-1 text-left text-sm text-gray-700 truncate hover:text-blue-600 transition-colors"
                  >
                    {preset.name}
                  </button>
                  <button
                    onClick={() => deleteMutation.mutate(preset.id)}
                    title="삭제"
                    className="p-1 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))
            )}
          </div>

          {/* 단축키 안내 */}
          <div className="px-3 py-1.5 border-t border-gray-100">
            <p className="text-[10px] text-gray-400">↑↓ 이동 · Enter 적용 · 1-9,0 직접 선택</p>
          </div>
        </PopoverContent>
      </Popover>

      {/* 저장 다이얼로그 */}
      <Dialog open={saveDialogOpen} onOpenChange={(o) => { setSaveDialogOpen(o); if (!o) setPresetName('') }}>
        <DialogContent showCloseButton className="sm:max-w-xs">
          <DialogHeader>
            <DialogTitle>화면배치 레이아웃 저장</DialogTitle>
          </DialogHeader>

          <div>
            <input
              ref={inputRef}
              type="text"
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSave()}
              placeholder="예: 계좌 함께보기"
              maxLength={50}
              className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
            {isDuplicate && presetName.trim() && (
              <p className="text-xs text-orange-500 mt-1">
                같은 이름이 존재합니다. 저장하면 덮어씁니다.
              </p>
            )}
            {atLimit && (
              <p className="text-xs text-red-500 mt-1">
                최대 10개까지 저장 가능합니다.
              </p>
            )}
          </div>

          <DialogFooter showCloseButton={false}>
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setSaveDialogOpen(false); setPresetName('') }}
            >
              취소
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={!presetName.trim() || saveMutation.isPending || atLimit}
            >
              {saveMutation.isPending ? '저장 중...' : '저장'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
})

export default LayoutPresetPanel
