import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  LayoutDashboard,
  Building2,
  Settings,
  ChevronDown,
  ChevronRight,
  type LucideIcon,
  Menu,
} from 'lucide-react'
import { fetchMenuTree, type MenuItem } from '@/services/menuService'
import { useLayoutStore } from '@/store/layoutStore'

// Lucide 아이콘 매핑 (DDL의 icon 필드 kebab-case → 컴포넌트)
const ICON_MAP: Record<string, LucideIcon> = {
  'layout-dashboard': LayoutDashboard,
  'building-2': Building2,
  settings: Settings,
}

function getIcon(iconName: string | null): LucideIcon {
  if (!iconName) return Menu
  return ICON_MAP[iconName] ?? Menu
}

// Level 3 메뉴 아이템 (클릭 시 탭 열기)
function LeafItem({ menu, onSelect }: { menu: MenuItem; onSelect: () => void }) {
  const openTab = useLayoutStore((s) => s.openTab)

  const handleClick = () => {
    openTab(menu)
    onSelect()
  }

  return (
    <button
      onClick={handleClick}
      className="w-full text-left px-4 py-1.5 text-sm text-gray-600 hover:bg-green-50 hover:text-green-700 rounded-md transition-colors truncate"
    >
      {menu.title}
    </button>
  )
}

// Level 2 아코디언 아이템
function GroupItem({ menu, onSelect }: { menu: MenuItem; onSelect: () => void }) {
  const [open, setOpen] = useState(false)

  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-gray-500 hover:text-gray-700 uppercase tracking-wide rounded-md hover:bg-gray-100 transition-colors"
      >
        <span>{menu.title}</span>
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
      </button>
      {open && (
        <div className="ml-1 flex flex-col gap-0.5 mb-1">
          {menu.children.map((child) => (
            <LeafItem key={child.id} menu={child} onSelect={onSelect} />
          ))}
        </div>
      )}
    </div>
  )
}

// 사이드 패널 (Level 2/3 메뉴)
function MenuPanel({ menu, onClose }: { menu: MenuItem; onClose: () => void }) {
  return (
    <div className="w-52 bg-white border-r border-gray-200 flex flex-col overflow-hidden">
      {/* 패널 헤더 */}
      <div className="h-10 flex items-center px-3 bg-gray-50 border-b border-gray-200 shrink-0">
        <span className="text-sm font-bold text-gray-700">{menu.title}</span>
      </div>
      {/* 메뉴 목록 */}
      <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-1">
        {menu.children.map((child) =>
          child.level === 2 ? (
            <GroupItem key={child.id} menu={child} onSelect={onClose} />
          ) : (
            <LeafItem key={child.id} menu={child} onSelect={onClose} />
          )
        )}
      </div>
    </div>
  )
}

export default function Sidebar() {
  const [activeId, setActiveId] = useState<number | null>(null)
  const { data: menus = [] } = useQuery({
    queryKey: ['menus'],
    queryFn: fetchMenuTree,
    staleTime: 1000 * 60 * 10, // 10분 캐시
  })

  const activeMenu = menus.find((m) => m.id === activeId) ?? null

  const handleIconClick = (menu: MenuItem) => {
    setActiveId((prev) => (prev === menu.id ? null : menu.id))
  }

  return (
    <div className="flex h-full shrink-0">
      {/* 아이콘 레일 */}
      <div className="w-12 bg-gray-900 flex flex-col items-center py-2 gap-1">
        {menus.map((menu) => {
          const Icon = getIcon(menu.icon)
          const isActive = activeId === menu.id
          return (
            <button
              key={menu.id}
              onClick={() => handleIconClick(menu)}
              title={menu.title}
              className={`w-10 h-10 flex flex-col items-center justify-center rounded-lg transition-colors text-xs gap-0.5
                ${isActive ? 'bg-green-600 text-white' : 'text-gray-400 hover:bg-gray-700 hover:text-white'}`}
            >
              <Icon size={18} />
            </button>
          )
        })}
      </div>

      {/* 메뉴 패널 (아이콘 선택 시 표시) */}
      {activeMenu && (
        <MenuPanel menu={activeMenu} onClose={() => setActiveId(null)} />
      )}
    </div>
  )
}
