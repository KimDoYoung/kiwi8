import { useState, useEffect, useCallback, useRef } from 'react'
import { Search, FileText, ChevronRight, X, ArrowLeftRight } from 'lucide-react'
import api from '@/lib/api'

interface NewsItem {
  news_id: string
  news_code: string
  stock_codes: string
  title: string
  content: string | null
  news_time: string
  news_date: string
  category_id: string
  created_at: string
}

interface ContentPanel {
  news_id: string
  title: string
  content: string | null
  loading: boolean
}

function formatTime(date: string, time: string): string {
  if (!date || !time) return ''
  const d = `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`
  const t = `${time.slice(0, 2)}:${time.slice(2, 4)}:${time.slice(4, 6)}`
  return `${d} ${t}`
}

const MIN_PCT = 20
const MAX_PCT = 80
const DEFAULT_PCT = 45

export default function StockNewsPage() {
  const [keyword, setKeyword] = useState('')
  const [inputVal, setInputVal] = useState('')
  const [news, setNews] = useState<NewsItem[]>([])
  const [loading, setLoading] = useState(false)
  const [panel, setPanel] = useState<ContentPanel | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  // 드래그 분할 바
  const [splitPct, setSplitPct] = useState(DEFAULT_PCT)
  const [swapped, setSwapped] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)

  const fetchNews = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get('/api/v1/news', { params: { q: keyword, limit: 100 } })
      if (res.data?.success) {
        setNews(res.data.data)
        setLastUpdated(new Date())
      }
    } catch (e) {
      console.error('[StockNews] fetch error', e)
    } finally {
      setLoading(false)
    }
  }, [keyword])

  // 최초 + keyword 변경 시 조회
  useEffect(() => { fetchNews() }, [fetchNews])

  // 30초 자동 새로고침 + 창 포커스 시 새로고침
  useEffect(() => {
    const interval = setInterval(fetchNews, 30_000)
    window.addEventListener('focus', fetchNews)
    return () => {
      clearInterval(interval)
      window.removeEventListener('focus', fetchNews)
    }
  }, [fetchNews])

  // 드래그 이벤트
  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!dragging.current || !containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const pct = ((e.clientX - rect.left) / rect.width) * 100
      setSplitPct(Math.min(MAX_PCT, Math.max(MIN_PCT, pct)))
    }
    const onMouseUp = () => { dragging.current = false }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [])

  const clearSearch = useCallback(() => {
    setInputVal('')
    setKeyword('')
  }, [])

  // Delete 키 → 검색 초기화 (input 포커스 상태 제외)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (e.key === 'Delete' && tag !== 'INPUT' && tag !== 'TEXTAREA') {
        clearSearch()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [clearSearch])

  const handleSearch = () => setKeyword(inputVal.trim())

  const openContent = async (item: NewsItem) => {
    setPanel({ news_id: item.news_id, title: item.title, content: null, loading: true })
    try {
      const res = await api.get(`/api/v1/news/${item.news_id}/content`)
      if (res.data?.success) {
        setPanel({ news_id: item.news_id, title: res.data.data.title, content: res.data.data.content, loading: false })
      } else {
        setPanel(p => p ? { ...p, content: res.data?.error || '조회 실패', loading: false } : null)
      }
    } catch {
      setPanel(p => p ? { ...p, content: '오류 발생', loading: false } : null)
    }
  }

  const listPct = panel ? (swapped ? 100 - splitPct : splitPct) : 100
  const contentPct = panel ? (swapped ? splitPct : 100 - splitPct) : 0
  const listStyle = { width: `${listPct}%` }
  const contentStyle = { width: `${contentPct}%` }

  const listPanel = (
    <div className="flex flex-col shrink-0 border-slate-200 overflow-hidden" style={listStyle}>
      {/* 헤더 */}
      <div className="px-4 pt-4 pb-3 bg-white border-b border-slate-200 shrink-0">
        <div className="flex items-center gap-2 mb-3">
          <div className="p-1.5 bg-violet-100 rounded-lg">
            <FileText className="w-4 h-4 text-violet-600" />
          </div>
          <h1 className="text-base font-bold text-slate-800">종목 뉴스</h1>
          <span className="ml-auto text-xs text-slate-400 font-mono">{news.length}건</span>
          {lastUpdated && (
            <span className="text-[10px] text-slate-300 font-mono">
              {lastUpdated.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          )}
          {panel && (
            <button
              onClick={() => setSwapped(s => !s)}
              className="p-1 hover:bg-slate-100 rounded"
              title="좌우 전환"
            >
              <ArrowLeftRight className="w-3.5 h-3.5 text-slate-400" />
            </button>
          )}
        </div>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
            <input
              className="w-full pl-8 pr-8 py-1.5 text-sm border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:ring-1 focus:ring-violet-400"
              placeholder="제목 또는 종목코드 검색"
              value={inputVal}
              onChange={e => setInputVal(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleSearch()
                if (e.key === 'Delete' && inputVal === '') clearSearch()
              }}
            />
            {inputVal && (
              <button
                onClick={clearSearch}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 hover:bg-slate-200 rounded-full"
                tabIndex={-1}
              >
                <X className="w-3 h-3 text-slate-400" />
              </button>
            )}
          </div>
          <button
            onClick={handleSearch}
            className="px-3 py-1.5 bg-violet-500 text-white text-sm rounded-lg hover:bg-violet-600 transition-colors"
          >
            검색
          </button>
        </div>
      </div>

      {/* 목록 */}
      <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
        {loading ? (
          <div className="p-8 text-center text-slate-400 text-sm">로딩 중...</div>
        ) : news.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-sm">뉴스가 없습니다.</div>
        ) : (
          news.map(item => (
            <button
              key={item.news_id}
              onClick={() => openContent(item)}
              className={`w-full text-left px-4 py-3 hover:bg-violet-50 transition-colors flex items-start gap-3
                ${panel?.news_id === item.news_id ? 'bg-violet-50 border-l-2 border-violet-400' : ''}`}
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm text-slate-700 leading-snug font-medium line-clamp-2">{item.title}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[10px] font-mono text-slate-400">
                    {formatTime(item.news_date, item.news_time)}
                  </span>
                  {item.stock_codes && (
                    <span className="text-[10px] font-mono bg-violet-100 text-violet-600 px-1.5 py-0.5 rounded">
                      {item.stock_codes.split(',').slice(0, 3).join(' ')}
                    </span>
                  )}
                  {item.content && (
                    <span className="text-[10px] text-emerald-500 font-medium">본문 ✓</span>
                  )}
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-300 shrink-0 mt-0.5" />
            </button>
          ))
        )}
      </div>
    </div>
  )

  const contentPanel = panel ? (
    <div className="flex flex-col bg-white overflow-hidden shrink-0" style={contentStyle}>
      <div className="px-4 py-3 border-b border-slate-200 flex items-start gap-2 shrink-0">
        <p className="flex-1 text-sm font-semibold text-slate-800 leading-snug">{panel.title}</p>
        <button onClick={() => setPanel(null)} className="p-1 hover:bg-slate-100 rounded shrink-0">
          <X className="w-4 h-4 text-slate-400" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        {panel.loading ? (
          <div className="text-center text-slate-400 text-sm py-8">본문 불러오는 중...</div>
        ) : (
          <div className="text-sm text-slate-700 leading-relaxed" dangerouslySetInnerHTML={{ __html: panel.content ?? '' }} />
        )}
      </div>
    </div>
  ) : null

  const divider = panel ? (
    <div
      className="w-1 shrink-0 bg-slate-200 hover:bg-violet-400 cursor-col-resize transition-colors active:bg-violet-500"
      onMouseDown={e => { dragging.current = true; e.preventDefault() }}
    />
  ) : null

  return (
    <div ref={containerRef} className="flex h-full overflow-hidden bg-slate-50 select-none">
      {swapped ? <>{contentPanel}{divider}{listPanel}</> : <>{listPanel}{divider}{contentPanel}</>}
    </div>
  )
}
