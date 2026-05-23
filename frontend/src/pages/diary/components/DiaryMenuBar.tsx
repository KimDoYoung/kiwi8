import { useRef, useState } from 'react'
import { type useEditor } from '@tiptap/react'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/shared/components/ui/popover'

const TEXT_COLORS = [
  { label: '기본', value: '' },
  { label: '빨강', value: '#ef4444' },
  { label: '주황', value: '#f97316' },
  { label: '노랑', value: '#eab308' },
  { label: '초록', value: '#22c55e' },
  { label: '파랑', value: '#3b82f6' },
  { label: '보라', value: '#8b5cf6' },
  { label: '회색', value: '#6b7280' },
]

interface DiaryMenuBarProps {
  editor: ReturnType<typeof useEditor> | null
  onImageUpload: (file: File) => Promise<string>
  headingLevels?: (1 | 2 | 3)[]
}

export default function DiaryMenuBar({
  editor,
  onImageUpload,
  headingLevels = [1, 2, 3],
}: DiaryMenuBarProps) {
  const [showColors, setShowColors] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  if (!editor) return null

  const btn = (
    label: string,
    action: () => boolean,
    active?: boolean,
    key?: string | number,
  ) => (
    <button
      key={key}
      type="button"
      onClick={() => action()}
      className={`px-2 py-1 text-sm rounded transition-colors ${
        active
          ? 'bg-blue-100 text-blue-700 font-semibold'
          : 'text-gray-600 hover:bg-gray-100'
      }`}
    >
      {label}
    </button>
  )

  const handleImageFile = async (file: File) => {
    try {
      const url = await onImageUpload(file)
      editor.chain().focus().setImage({ src: url }).run()
    } catch (err) {
      console.error('[DiaryMenuBar] image upload failed:', err)
    }
  }

  const currentColor = editor.getAttributes('textStyle').color || ''

  return (
    <div className="flex flex-wrap gap-1 px-3 py-2 border-b border-gray-200 bg-gray-50 rounded-t-lg">
      {btn('B', () => editor.chain().focus().toggleBold().run(), editor.isActive('bold'))}
      {btn('I', () => editor.chain().focus().toggleItalic().run(), editor.isActive('italic'))}
      {btn('S', () => editor.chain().focus().toggleStrike().run(), editor.isActive('strike'))}
      <span className="w-px bg-gray-200 mx-1" />

      {headingLevels.map((level) =>
        btn(
          `H${level}`,
          () => editor.chain().focus().toggleHeading({ level }).run(),
          editor.isActive('heading', { level }),
          `h${level}`,
        ),
      )}
      <span className="w-px bg-gray-200 mx-1" />

      {btn('• 목록', () => editor.chain().focus().toggleBulletList().run(), editor.isActive('bulletList'))}
      {btn('1. 목록', () => editor.chain().focus().toggleOrderedList().run(), editor.isActive('orderedList'))}
      <span className="w-px bg-gray-200 mx-1" />

      {btn('인용', () => editor.chain().focus().toggleBlockquote().run(), editor.isActive('blockquote'))}
      <span className="w-px bg-gray-200 mx-1" />

      <Popover open={showColors} onOpenChange={setShowColors}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="flex items-center gap-1 px-2 py-1 text-sm rounded text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <span
              className="inline-block w-4 h-4 rounded-sm border border-gray-300"
              style={{ backgroundColor: currentColor || '#000000' }}
            />
            <span>색상</span>
            <span className="text-xs opacity-50">▾</span>
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-44 p-2" align="start">
          <div className="flex flex-wrap gap-1">
            {TEXT_COLORS.map((c) => (
              <button
                key={c.value || 'default'}
                type="button"
                title={c.label}
                onClick={() => {
                  if (c.value) {
                    editor.chain().focus().setColor(c.value).run()
                  } else {
                    editor.chain().focus().unsetColor().run()
                  }
                  setShowColors(false)
                }}
                className="flex items-center gap-1.5 w-full px-2 py-1 text-xs rounded hover:bg-gray-50 text-left"
              >
                <span
                  className="inline-block w-4 h-4 rounded-sm border border-gray-300 flex-shrink-0"
                  style={{ backgroundColor: c.value || '#000000' }}
                />
                {c.label}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>

      <span className="w-px bg-gray-200 mx-1" />

      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        className="px-2 py-1 text-sm rounded text-gray-600 hover:bg-gray-100 transition-colors"
      >
        🖼 이미지
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) handleImageFile(file)
          e.target.value = ''
        }}
      />
    </div>
  )
}
