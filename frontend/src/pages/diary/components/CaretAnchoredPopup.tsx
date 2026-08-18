/**
 * 캐럿(커서) 좌표에 뜨는 고정 위치 팝업. document.body에 포탈로 렌더링해서
 * Dialog(모달)의 transform(translate) 컨테이닝 블록 영향을 받지 않고
 * 뷰포트 기준 좌표 그대로 위치한다.
 * (Dialog 안에서 position:fixed 자식은 Dialog의 translate 때문에 뷰포트가 아닌
 *  Dialog 기준으로 배치되어버리는 문제가 있어 포탈로 escape 시킴)
 */
import { createPortal } from 'react-dom'
import { useEffect, useRef, useState, type ReactNode } from 'react'

interface Props {
  position: { x: number; y: number }
  onClose: () => void
  className?: string
  children: ReactNode
}

export default function CaretAnchoredPopup({ position, onClose, className, children }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [adjusted, setAdjusted] = useState(position)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    let x = position.x
    let y = position.y
    if (x + rect.width > window.innerWidth) x = Math.max(8, window.innerWidth - rect.width - 8)
    if (y + rect.height > window.innerHeight) y = Math.max(8, window.innerHeight - rect.height - 8)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAdjusted({ x, y })
  }, [position])

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) onClose()
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        onClose()
      }
    }
    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('keydown', onKeyDown, true)
    }
  }, [onClose])

  return createPortal(
    <div
      ref={containerRef}
      style={{ position: 'fixed', left: adjusted.x, top: adjusted.y, zIndex: 50 }}
      className={className}
    >
      {children}
    </div>,
    document.body,
  )
}
