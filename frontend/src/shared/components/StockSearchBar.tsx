import { useState, useRef, useEffect } from 'react'
import { useStockDetailStore } from '@/store/stockDetailStore'
import { findStock, type StockSearchItem } from '@/services/stockService'
import { InputWithIcon } from '@/shared/components/InputWithIcon'

interface StockSearchBarProps {
  className?: string
  placeholder?: string
  inputClassName?: string
}

export default function StockSearchBar({
  className,
  placeholder = '종목명 또는 코드 입력',
  inputClassName = 'h-8 text-xs bg-white',
}: StockSearchBarProps) {
  const [keyword, setKeyword] = useState('')
  const [results, setResults] = useState<StockSearchItem[]>([])
  const [showResults, setShowResults] = useState(false)
  const setStock = useStockDetailStore((s) => s.setStock)
  const containerRef = useRef<HTMLDivElement>(null)

  const handleSearch = async () => {
    if (!keyword.trim()) return
    if (/^\d{6}$/.test(keyword.trim())) {
      setStock(keyword.trim())
      setKeyword('')
      setResults([])
      setShowResults(false)
      return
    }
    try {
      const data = await findStock(keyword)
      setResults(data)
      setShowResults(true)
    } catch (err) {
      console.error('Stock search failed:', err)
    }
  }

  const handleSelect = (item: StockSearchItem) => {
    setStock(item.stk_cd, item.stk_nm)
    setKeyword('')
    setResults([])
    setShowResults(false)
  }

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShowResults(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div className={`relative flex items-center w-72 ${className ?? ''}`} ref={containerRef}>
      <InputWithIcon
        value={keyword}
        onChange={setKeyword}
        onIconClick={handleSearch}
        placeholder={placeholder}
        className={inputClassName}
      />
      {showResults && results.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-auto top-full">
          {results.map((item) => (
            <div
              key={item.stk_cd}
              onClick={() => handleSelect(item)}
              className="flex justify-between items-center px-3 py-2 hover:bg-gray-100 cursor-pointer border-b border-gray-50 last:border-0"
            >
              <div className="flex flex-col text-left">
                <span className="text-sm font-bold text-gray-800">{item.stk_nm}</span>
                <span className="text-[10px] text-gray-500">{item.market_name} | {item.up_name}</span>
              </div>
              <span className="text-xs font-mono text-blue-600 font-bold">{item.stk_cd}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
