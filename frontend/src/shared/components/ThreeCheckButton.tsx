import { cn } from '@/lib/utils'

interface CheckOption {
  label: string
  value: string
  activeClassName?: string
}

interface ThreeCheckButtonProps {
  options: CheckOption[]
  value: string[]
  onValueChange: (v: string[]) => void
  className?: string
  itemClassName?: string
}

export function ThreeCheckButton({
  options,
  value,
  onValueChange,
  className,
  itemClassName,
}: ThreeCheckButtonProps) {
  const toggle = (v: string) => {
    const next = value.includes(v) ? value.filter((x) => x !== v) : [...value, v]
    onValueChange(next)
  }

  return (
    <div className={cn('flex items-center border rounded-md overflow-hidden', className)}>
      {options.map((opt, i) => {
        const active = value.includes(opt.value)
        return (
          <button
            key={opt.value}
            onClick={() => toggle(opt.value)}
            className={cn(
              'px-2 text-xs font-medium transition-colors select-none',
              i > 0 && 'border-l',
              active
                ? opt.activeClassName ?? 'bg-gray-200 text-gray-800'
                : 'bg-white text-gray-400 hover:bg-gray-50',
              itemClassName,
            )}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
