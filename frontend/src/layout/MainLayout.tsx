import TopBar from '@/layout/TopBar'
import Workspace from '@/layout/Workspace'
import Sidebar from '@/layout/Sidebar'
import StatusBar from '@/layout/StatusBar'
import { fetchMenuTree } from '@/services/menuService'
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '@/store/authStore'

export default function MainLayout() {
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn)

  // menus 쿼리만 유지 (데이터 캐싱용)
  useQuery({
    queryKey: ['menus'],
    queryFn: fetchMenuTree,
    staleTime: 1000 * 60 * 10,
    enabled: isLoggedIn, // 로그아웃 상태면 호출 방지
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
