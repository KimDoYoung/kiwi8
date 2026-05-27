import { useEffect, useState } from 'react'
import { useWsStore } from '@/store/wsStore'
import { useLayoutStore } from '@/store/layoutStore'

/* ── 관심종목 placeholder ── */
const WATCHLIST = [
  { code: '005930', name: '삼성전자' },
  { code: '000660', name: 'SK하이닉스' },
  { code: '035420', name: 'NAVER' },
  { code: '005380', name: '현대차' },
  { code: '051910', name: 'LG화학' },
  { code: '068270', name: '셀트리온' },
]

const Card = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <div className={`bg-white border border-slate-200 rounded-2xl shadow-sm ${className}`}>
    {children}
  </div>
)


/* ── 관심종목 카드 ── */
function WatchlistSection() {
  const REFRESH_SEC = 300
  const [lastRefresh, setLastRefresh] = useState(new Date())
  const [remaining, setRemaining] = useState(REFRESH_SEC)

  useEffect(() => {
    const tick = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          setLastRefresh(new Date())
          return REFRESH_SEC
        }
        return r - 1
      })
    }, 1000)
    return () => clearInterval(tick)
  }, [])

  const mm = String(Math.floor(remaining / 60)).padStart(2, '0')
  const ss = String(remaining % 60).padStart(2, '0')

  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        <span className="w-1 h-4 rounded-full bg-indigo-400" />
        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest">관심종목 현재가</h2>
        <span className="ml-auto text-[11px] text-slate-400 font-mono">
          갱신 {lastRefresh.toLocaleTimeString('ko-KR', { hour12: false })} · 다음 {mm}:{ss}
        </span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {WATCHLIST.map((s) => (
          <Card key={s.code} className="px-3 py-3">
            <div className="text-[10px] text-slate-400 font-mono mb-1">{s.code}</div>
            <div className="text-sm font-bold text-slate-700 truncate mb-2">{s.name}</div>
            <div className="text-lg font-mono font-black text-slate-300">—</div>
            <div className="text-[11px] font-mono text-slate-300 mt-0.5">—%</div>
          </Card>
        ))}
      </div>
    </section>
  )
}

/* ── 메인 ── */
const DashboardPage = () => {
  const { connected, newsItems } = useWsStore()
  const openTab = useLayoutStore((s) => s.openTab)
  const openNewsTab = () => openTab({
    id: 0, parent_id: null, level: 0, screen_no: '1206',
    title: '증권 뉴스', url: null, component: null, icon: null,
    sort_order: 0, is_active: 1, children: [],
  })

  return (
    <div className="min-h-screen bg-slate-50 p-6 space-y-5">

      {/* 헤더 */}
      <div className="flex items-center justify-between pb-1">
        <div>
          <h1 className="text-xl font-bold text-slate-800 tracking-tight">대시보드</h1>
          <p className="text-xs text-slate-400 mt-0.5">키움 · KIS · LS 실시간 데이터</p>
        </div>
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm font-medium
          ${connected
            ? 'bg-emerald-50 border-emerald-300 text-emerald-600'
            : 'bg-red-50 border-red-300 text-red-500'}`}>
          <span className={`w-2 h-2 rounded-full ${connected ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`} />
          {connected ? 'LIVE' : 'OFFLINE'}
        </div>
      </div>

      {/* 뉴스 */}
      <section>
        <div className="flex items-center gap-2 mb-1">
          <span className="w-1 h-4 rounded-full bg-violet-400" />
          <button
            onClick={openNewsTab}
            className="text-xs font-semibold text-slate-500 uppercase tracking-widest hover:text-violet-600 transition-colors cursor-pointer"
          >
            증권 뉴스
          </button>
          <span className="ml-auto text-[11px] text-slate-400 font-mono">{newsItems.length}건</span>
        </div>
        <Card className="divide-y divide-slate-100">
          {newsItems.length === 0 ? (
            <div className="py-2 text-center text-slate-400 text-sm">수신 대기 중...</div>
          ) : (
            newsItems.slice(0, 7).map((n) => (
              <div key={n.news_id} className="px-3 py-0.5 hover:bg-slate-50 transition-colors flex items-center gap-3">
                <span className="text-xs font-mono text-slate-400 whitespace-nowrap shrink-0 leading-6">
                  {n.time?.replace(/(\d{2})(\d{2})(\d{2})/, '$1:$2:$3') ?? ''}
                </span>
                <p className="text-sm font-medium text-slate-700 truncate flex-1 leading-6">{n.title}</p>
              </div>
            ))
          )}
        </Card>
      </section>

      {/* 관심종목 현재가 */}
      <WatchlistSection />

    </div>
  )
}

export default DashboardPage
