import { Layout, TabNode } from 'flexlayout-react'
import 'flexlayout-react/style/light.css'
import { useLayoutStore } from '@/store/layoutStore'
import registry from './registry'
import PlaceholderPage from '@/pages/PlaceholderPage'

export default function Workspace() {
  const modelVersion = useLayoutStore((s) => s.modelVersion)
  const getModel = useLayoutStore((s) => s.getModel)
  const onModelChange = useLayoutStore((s) => s.onModelChange)

  // modelVersion을 읽어 re-render 유도 (실제로는 같은 model 인스턴스 사용)
  void modelVersion
  const model = getModel()

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
