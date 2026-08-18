import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import { TextStyle } from '@tiptap/extension-text-style'
import { Color } from '@tiptap/extension-color'
import { Highlight } from '@tiptap/extension-highlight'
import { Link } from '@tiptap/extension-link'
import { Table } from '@tiptap/extension-table'
import { TableRow } from '@tiptap/extension-table-row'
import { TableHeader } from '@tiptap/extension-table-header'
import { TableCell } from '@tiptap/extension-table-cell'
import api from '@/lib/api'
import ResizableInlineImage from './ResizableInlineImage'
import MediaEmbedExtension from './MediaEmbedExtension'
import { FontSize } from './FontSizeExtension'
import DiaryMenuBar from './DiaryMenuBar'

interface DiaryEditorProps {
  value: string
  onChange: (html: string) => void
  placeholder?: string
  minHeight?: string
  onSave?: () => void
}

export interface DiaryEditorHandle {
  focus: () => void
}

async function uploadImage(file: File): Promise<string> {
  const formData = new FormData()
  formData.append('file', file)
  const res = await api.post('/api/v1/diary/images', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return (res.data as { url: string }).url
}

const DiaryEditor = forwardRef<DiaryEditorHandle, DiaryEditorProps>(
  function DiaryEditor(
    {
      value,
      onChange,
      placeholder = '일지 내용을 입력하세요...',
      minHeight = '300px',
      onSave,
    },
    ref,
  ) {
    const editorRef = useRef<ReturnType<typeof useEditor>>(null)
    const onSaveRef = useRef(onSave)

    useEffect(() => {
      onSaveRef.current = onSave
    }, [onSave])

    const editor = useEditor({
      extensions: [
        StarterKit.configure({ heading: { levels: [1, 2, 3] }, link: false }),
        Placeholder.configure({ placeholder }),
        ResizableInlineImage.configure({ allowBase64: false }),
        MediaEmbedExtension,
        TextStyle,
        Color,
        FontSize,
        Highlight.configure({ multicolor: true }),
        Link.configure({ openOnClick: false, autolink: true }),
        Table.configure({ resizable: true }),
        TableRow,
        TableHeader,
        TableCell,
      ],
      content: value,
      onUpdate({ editor }) {
        onChange(editor.getHTML())
      },
      editorProps: {
        attributes: {
          class: `diary-prose ProseMirror focus:outline-none px-4 py-3`,
          style: `min-height: ${minHeight}`,
        },
        handleKeyDown(_view, event) {
          if ((event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey && event.key.toLowerCase() === 's') {
            event.preventDefault()
            onSaveRef.current?.()
            return true
          }
          return false
        },
        handlePaste(_view, event) {
          const items = event.clipboardData?.items
          if (!items) return false
          for (const item of Array.from(items)) {
            if (item.type.startsWith('image/')) {
              event.preventDefault()
              const file = item.getAsFile()
              if (!file) continue
              uploadImage(file)
                .then((url) => {
                  editorRef.current?.chain().focus().setImage({ src: url }).run()
                })
                .catch((err) => {
                  console.error('[DiaryEditor] image upload failed:', err)
                })
              return true
            }
          }
          return false
        },
      },
    })

    useEffect(() => {
      editorRef.current = editor
    }, [editor])

    useImperativeHandle(ref, () => ({
      focus: () => editorRef.current?.commands.focus(),
    }))

    // 외부에서 value가 처음 로드될 때 한 번만 동기화
    const syncedRef = useRef(false)
    useEffect(() => {
      if (!editor || syncedRef.current) return
      editor.commands.setContent(value ?? '')
      syncedRef.current = true
    }, [editor, value])

    return (
      <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
        <DiaryMenuBar editor={editor} onImageUpload={uploadImage} />
        <EditorContent editor={editor} />
      </div>
    )
  },
)

export default DiaryEditor
