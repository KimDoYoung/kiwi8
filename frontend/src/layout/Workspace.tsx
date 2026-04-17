import { useEffect } from 'react'
import { Actions, Layout, TabNode, TabSetNode } from 'flexlayout-react'
import 'flexlayout-react/style/light.css'
import { useLayoutStore } from '@/store/layoutStore'
import registry from './registry'
import PlaceholderPage from '@/pages/PlaceholderPage'

export default function Workspace() {
  const modelVersion = useLayoutStore((s) => s.modelVersion)
  const getModel = useLayoutStore((s) => s.getModel)
  const onModelChange = useLayoutStore((s) => s.onModelChange)

  void modelVersion
  const model = getModel()

  // F4: 활성 TabSet 최대화/복귀 토글
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'F4') return
      e.preventDefault()

      const m = getModel()

      // 활성(isActive) TabSet 찾기
      let tabsetId: string | null = null
      m.visitNodes((node) => {
        if (node.getType() === 'tabset' && (node as TabSetNode).isActive()) {
          tabsetId = node.getId()
        }
      })
      // 없으면 첫 번째 TabSet
      if (!tabsetId) {
        m.visitNodes((node) => {
          if (!tabsetId && node.getType() === 'tabset') tabsetId = node.getId()
        })
      }

      if (tabsetId) {
        m.doAction(Actions.maximizeToggle(tabsetId))
        // modelVersion 증가로 re-render 유도
        useLayoutStore.setState((s) => ({ modelVersion: s.modelVersion + 1 }))
      }
    }

    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [getModel])

  const factory = (node: TabNode) => {
    const screenNo = node.getComponent() ?? ''
    const Component = registry[screenNo] ?? PlaceholderPage
    return <Component screenNo={screenNo} title={node.getName()} />
  }

  return (
    <div className="flex-1 overflow-hidden relative">
      <Layout
        model={model}
        factory={factory}
        onModelChange={onModelChange}
        realtimeResize
      />
    </div>
  )
}
