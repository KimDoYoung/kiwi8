import { useState, useRef, useEffect } from 'react'
import { LayoutTemplate, Save, Trash2, FolderOpen } from 'lucide-react'
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
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'

export default function LayoutPresetPanel() {
  const [saveDialogOpen, setSaveDialogOpen] = useState(false)
  const [presetName, setPresetName] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const queryClient = useQueryClient()
  const { getModel, loadPreset } = useLayoutStore()

  // 다이얼로그 열릴 때 input 포커스
  useEffect(() => {
    if (saveDialogOpen) {
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [saveDialogOpen])

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
    const json = JSON.stringify(getModel().toJson())
    saveMutation.mutate({ name, json })
  }

  const handleLoad = (preset: LayoutPreset) => {
    loadPreset(preset.layout_json)
  }

  // 이름이 기존 프리셋과 겹치는지 확인 (덮어쓰기 안내용)
  const isDuplicate = presets.some((p) => p.name === presetName.trim())

  return (
    <>
      <Popover>
        <PopoverTrigger
          className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors data-[popup-open]:text-blue-600 data-[popup-open]:bg-blue-50"
          title="레이아웃 프리셋"
        >
          <LayoutTemplate size={15} />
        </PopoverTrigger>

        <PopoverContent align="end" className="w-64 p-0">
          {/* 헤더 */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100">
            <span className="text-xs font-semibold text-gray-600">레이아웃 프리셋</span>
            <button
              onClick={() => setSaveDialogOpen(true)}
              className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 transition-colors"
            >
              <Save size={12} />
              현재 저장
            </button>
          </div>

          {/* 프리셋 목록 */}
          <div className="max-h-64 overflow-y-auto py-1">
            {presets.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-4">저장된 프리셋이 없습니다</p>
            ) : (
              presets.map((preset) => (
                <div
                  key={preset.id}
                  className="flex items-center gap-1 px-3 py-1.5 hover:bg-gray-50 group"
                >
                  <span className="flex-1 text-sm text-gray-700 truncate">{preset.name}</span>
                  <button
                    onClick={() => handleLoad(preset)}
                    title="불러오기"
                    className="p-1 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors opacity-0 group-hover:opacity-100"
                  >
                    <FolderOpen size={13} />
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
        </PopoverContent>
      </Popover>

      {/* 저장 다이얼로그 */}
      <Dialog open={saveDialogOpen} onOpenChange={(o) => { setSaveDialogOpen(o); if (!o) setPresetName('') }}>
        <DialogContent showCloseButton className="sm:max-w-xs">
          <DialogHeader>
            <DialogTitle>레이아웃 저장</DialogTitle>
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
              disabled={!presetName.trim() || saveMutation.isPending}
            >
              {saveMutation.isPending ? '저장 중...' : '저장'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
