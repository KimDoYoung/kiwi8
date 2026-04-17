import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  LayoutDashboard,
  Building2,
  Settings,
  ChevronDown,
  ChevronRight,
  ChevronsDown,
  ChevronsUp,
  Pin,
  PinOff,
  type LucideIcon,
  Menu,
} from 'lucide-react'
import { fetchMenuTree, type MenuItem } from '@/services/menuService'
import { useLayoutStore } from '@/store/layoutStore'
import { useAuthStore } from '@/store/authStore'

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

// Level 3 메뉴 아이템
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

// Level 2 아코디언 아이템 — open 상태를 부모(MenuPanel)에서 제어
function GroupItem({
  menu,
  open,
  onToggle,
  onSelect,
}: {
  menu: MenuItem
  open: boolean
  onToggle: () => void
  onSelect: () => void
}) {
  return (
    <div>
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-3 py-2 text-sm font-semibold text-gray-500 hover:text-gray-700 uppercase tracking-wide rounded-md hover:bg-gray-100 transition-colors"
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
function MenuPanel({
  menu,
  pinned,
  onTogglePin,
  onClose,
}: {
  menu: MenuItem
  pinned: boolean
  onTogglePin: () => void
  onClose: () => void
}) {
  const handleSelect = pinned ? () => {} : onClose

  // level 2 그룹 목록
  const groups = menu.children.filter((c) => c.level === 2)
  const groupIds = groups.map((g) => g.id)

  // 열린 그룹 ID 집합
  const [openIds, setOpenIds] = useState<Set<number>>(() => new Set(groupIds))

  const toggleGroup = (id: number) =>
    setOpenIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })

  const expandAll = () => setOpenIds(new Set(groupIds))
  const collapseAll = () => setOpenIds(new Set())

  return (
    <div className="w-52 bg-white border-r border-gray-200 flex flex-col overflow-hidden">
      {/* 패널 헤더 */}
      <div className="h-10 flex items-center justify-between px-3 bg-gray-50 border-b border-gray-200 shrink-0">
        <span className="text-sm font-bold text-gray-700 truncate">{menu.title}</span>
        <div className="flex items-center gap-0.5 shrink-0 ml-1">
          <button
            onClick={expandAll}
            title="모두 펼치기"
            className="p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-200 transition-colors"
          >
            <ChevronsDown size={13} />
          </button>
          <button
            onClick={collapseAll}
            title="모두 접기"
            className="p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-200 transition-colors"
          >
            <ChevronsUp size={13} />
          </button>
          <button
            onClick={onTogglePin}
            title={pinned ? '고정 해제' : '사이드바 고정'}
            className={`p-1 rounded transition-colors
              ${pinned
                ? 'text-green-600 hover:text-green-800 hover:bg-green-100'
                : 'text-gray-400 hover:text-gray-600 hover:bg-gray-200'
              }`}
          >
            {pinned ? <Pin size={13} /> : <PinOff size={13} />}
          </button>
        </div>
      </div>
      {/* 메뉴 목록 */}
      <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-1">
        {menu.children.map((child) =>
          child.level === 2 ? (
            <GroupItem
              key={child.id}
              menu={child}
              open={openIds.has(child.id)}
              onToggle={() => toggleGroup(child.id)}
              onSelect={handleSelect}
            />
          ) : (
            <LeafItem key={child.id} menu={child} onSelect={handleSelect} />
          )
        )}
      </div>
    </div>
  )
}

export default function Sidebar() {
  const [activeId, setActiveId] = useState<number | null>(null)
  const [pinned, setPinned] = useState(false)

  const isLoggedIn = useAuthStore((s) => s.isLoggedIn)
  const { data: menus = [] } = useQuery({
    queryKey: ['menus'],
    queryFn: fetchMenuTree,
    staleTime: 1000 * 60 * 10,
    enabled: isLoggedIn,
  })

  const activeMenu = menus.find((m) => m.id === activeId) ?? null

  const handleIconClick = (menu: MenuItem) => {
    if (pinned && activeId === menu.id) return  // 핀 고정 시 같은 아이콘 클릭 무시
    setActiveId((prev) => (prev === menu.id ? null : menu.id))
  }

  const handleTogglePin = () => {
    setPinned((p) => {
      // 핀 해제 시 패널 닫기
      if (p) setActiveId(null)
      return !p
    })
  }

  const handleClose = () => {
    if (!pinned) setActiveId(null)
  }

  return (
    <div className="flex h-full shrink-0">
      {/* 아이콘 레일 */}
      <div className="w-12 flex flex-col items-center py-2 gap-1" style={{ background: 'linear-gradient(180deg, #1e3a5f 0%, #1e40af 50%, #1d4ed8 100%)' }}>
        {menus.map((menu) => {
          const Icon = getIcon(menu.icon)
          const isActive = activeId === menu.id
          return (
            <button
              key={menu.id}
              onClick={() => handleIconClick(menu)}
              title={menu.title}
              className={`w-10 h-10 flex flex-col items-center justify-center rounded-lg transition-colors
                ${isActive
                  ? 'bg-green-600 text-white'
                  : 'text-gray-400 hover:bg-gray-700 hover:text-white'
                }`}
            >
              <Icon size={18} />
              {/* 핀 고정 표시 */}
              {pinned && isActive && (
                <span className="w-1 h-1 rounded-full bg-green-300 mt-0.5" />
              )}
            </button>
          )
        })}
      </div>

      {/* 메뉴 패널 */}
      {activeMenu && (
        <MenuPanel
          menu={activeMenu}
          pinned={pinned}
          onTogglePin={handleTogglePin}
          onClose={handleClose}
        />
      )}
    </div>
  )
}
