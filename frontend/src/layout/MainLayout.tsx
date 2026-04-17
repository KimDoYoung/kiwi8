import TopBar from '@/layout/TopBar'
import Workspace from '@/layout/Workspace'
import Sidebar from '@/layout/Sidebar'
import StatusBar from '@/layout/StatusBar'
import { fetchMenuTree } from '@/services/menuService'
import { useQuery } from '@tanstack/react-query'

export default function MainLayout() {
  // menus 쿼리만 유지 (데이터 캐싱용)
  useQuery({
    queryKey: ['menus'],
    queryFn: fetchMenuTree,
    staleTime: 1000 * 60 * 10,
  })

  return (
    <div className="flex flex-col h-screen bg-gray-100 overflow-hidden">
      <TopBar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <Workspace />
      </div>
      <StatusBar />
    </div>
  )
}
