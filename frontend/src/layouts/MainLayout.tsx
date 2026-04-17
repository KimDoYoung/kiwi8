import { useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import TopBar from '@/components/layout/TopBar'
import Sidebar from '@/components/layout/Sidebar'
import StatusBar from '@/components/layout/StatusBar'
import Workspace from '@/components/workspace/Workspace'
import { fetchMenuTree } from '@/services/menuService'
import { useLayoutStore } from '@/store/layoutStore'

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
