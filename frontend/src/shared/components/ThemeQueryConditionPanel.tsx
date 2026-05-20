import { useState, useRef, useEffect, type RefObject } from 'react'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/shared/components/ui/radio-group'

export interface ThemeFilterState {
  current_price: { value: number; isOver: boolean }
  market_cap: { value: number; isOver: boolean }
  yesterday_ratio: { value: number; isOver: boolean }
  three_day_sum: { value: number; isOver: boolean }
  per: { value: number; isOver: boolean }
  pbr: { value: number; isOver: boolean }
}

interface FilterRowProps {
  label: string
  field: keyof ThemeFilterState
  filters: ThemeFilterState
  handleChange: (field: keyof ThemeFilterState, value: number) => void
  handleToggle: (field: keyof ThemeFilterState, isOver: boolean) => void
  step?: number
  unit?: string
  inputRef?: RefObject<HTMLInputElement>
}

const FilterRow = ({
  label,
  field,
  filters,
  handleChange,
  handleToggle,
  step = 1,
  unit = "",
  inputRef
}: FilterRowProps) => (
  <div className="grid grid-cols-12 items-center gap-3 py-2 border-b border-gray-100 last:border-0">
    <Label className="col-span-3 text-xs font-semibold text-gray-700">{label}</Label>
    <div className="col-span-5 relative">
      <Input
        ref={inputRef}
        type="number"
        value={filters[field].value}
        onChange={(e) => handleChange(field, parseFloat(e.target.value) || 0)}
        step={step}
        className="h-8 text-xs font-mono pr-6"
      />
      {unit && <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-gray-400 font-bold">{unit}</span>}
    </div>
    <div className="col-span-4">
      <RadioGroup 
        value={filters[field].isOver ? "over" : "below"} 
        onValueChange={(val) => handleToggle(field, val === "over")}
        className="flex gap-3"
      >
        <div className="flex items-center space-x-1">
          <RadioGroupItem value="over" id={`${field}-over`} className="h-3 w-3" />
          <Label htmlFor={`${field}-over`} className="text-[11px] cursor-pointer">이상</Label>
        </div>
        <div className="flex items-center space-x-1">
          <RadioGroupItem value="below" id={`${field}-below`} className="h-3 w-3" />
          <Label htmlFor={`${field}-below`} className="text-[11px] cursor-pointer">이하</Label>
        </div>
      </RadioGroup>
    </div>
  </div>
)

interface Props {
  initialFilters: ThemeFilterState
  onApply: (filters: ThemeFilterState) => void
  onReset: () => void
}

export default function ThemeQueryConditionPanel({ initialFilters, onApply, onReset }: Props) {
  const [filters, setFilters] = useState<ThemeFilterState>(initialFilters)
  const firstInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const timer = setTimeout(() => firstInputRef.current?.focus(), 50)
    return () => clearTimeout(timer)
  }, [])

  const handleChange = (field: keyof ThemeFilterState, value: number) => {
    setFilters((prev) => ({
      ...prev,
      [field]: { ...prev[field], value }
    }))
  }

  const handleToggle = (field: keyof ThemeFilterState, isOver: boolean) => {
    setFilters((prev) => ({
      ...prev,
      [field]: { ...prev[field], isOver }
    }))
  }

  return (
    <div className="w-80 p-4 space-y-4 bg-white shadow-xl rounded-lg border">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-gray-800">상세 검색 조건</h3>
        <Button variant="ghost" size="sm" className="h-7 text-[11px] text-gray-400 hover:text-red-500" onClick={() => {
          onReset();
          setFilters(initialFilters);
        }}>
          조건 초기화
        </Button>
      </div>

      <div className="space-y-1">
        <FilterRow label="현재가" field="current_price" filters={filters} handleChange={handleChange} handleToggle={handleToggle} step={100} inputRef={firstInputRef} />
        <FilterRow label="시가총액" field="market_cap" filters={filters} handleChange={handleChange} handleToggle={handleToggle} step={10} unit="억" />
        <FilterRow label="전일비" field="yesterday_ratio" filters={filters} handleChange={handleChange} handleToggle={handleToggle} step={0.1} unit="%" />
        <FilterRow label="3일합산" field="three_day_sum" filters={filters} handleChange={handleChange} handleToggle={handleToggle} step={0.1} unit="%" />
        <FilterRow label="PER" field="per" filters={filters} handleChange={handleChange} handleToggle={handleToggle} step={0.1} />
        <FilterRow label="PBR" field="pbr" filters={filters} handleChange={handleChange} handleToggle={handleToggle} step={0.1} />
      </div>

      <div className="pt-2 flex gap-2">
        <Button className="flex-1 h-9 text-xs" onClick={() => onApply(filters)}>
          조회 조건 적용
        </Button>
      </div>
    </div>
  )
}
