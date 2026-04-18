import { useState } from 'react'
import {
  ChevronRight,
  LineChart,
  BarChart2,
  TrendingUp,
  Newspaper,
  Globe,
  DollarSign,
  ExternalLink,
  X,
} from 'lucide-react'

// ── Panel 1: Ticker 데이터 (더미) ──────────────────────────────────────────

const INDICES = [
  { label: 'KOSPI', value: '2,580.45', change: -1.2 },
  { label: 'KOSDAQ', value: '850.12', change: +0.3 },
  { label: 'USD/KRW', value: '1,380', change: +0.1 },
]

const NEWS = [
  { title: '삼성전자, 1분기 영업이익 전망치 상회', body: '삼성전자가 1분기 영업이익 6.5조원을 기록하며 시장 전망치를 크게 상회했다. 반도체 부문의 회복세가 주효했다는 분석이다.' },
  { title: '한국은행, 기준금리 동결 결정', body: '한국은행 금융통화위원회는 기준금리를 3.5%로 동결하기로 결정했다. 물가 안정과 경기 회복의 균형을 고려한 결정이다.' },
  { title: '코스피, 외국인 순매수 전환', body: '외국인 투자자들이 코스피 시장에서 3거래일 만에 순매수로 전환했다. 반도체·2차전지 종목 중심으로 매수세가 유입됐다.' },
  { title: 'SK하이닉스, HBM 공급 확대 발표', body: 'SK하이닉스가 HBM3E 생산 능력을 전년 대비 2배 확대한다고 발표했다. AI 수요 증가에 대응하기 위한 조치다.' },
]

// ── Panel 2: 외부 링크 ────────────────────────────────────────────────────

const LINKS = [
  { icon: LineChart,   label: '키움 OpenAPI',  url: 'https://openapi.kiwoom.com/main/home' },
  { icon: BarChart2,   label: 'KIS API',        url: 'https://apiportal.koreainvestment.com' },
  { icon: TrendingUp,  label: 'LS증권 API',     url: 'https://openapi.ls-sec.co.kr' },
  { icon: Newspaper,   label: '네이버 증권',    url: 'https://finance.naver.com' },
  { icon: Globe,       label: '한국거래소',     url: 'https://www.krx.co.kr' },
  { icon: DollarSign,  label: '환율 정보',      url: 'https://finance.naver.com/marketindex/' },
]

// ── 뉴스 팝업 ────────────────────────────────────────────────────────────

function NewsDialog({ news, onClose }: { news: { title: string; body: string }; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-[480px] max-w-[90vw] p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-3">
          <h3 className="text-sm font-semibold text-gray-800 leading-snug">{news.title}</h3>
          <button
            onClick={onClose}
            className="shrink-0 p-0.5 rounded text-gray-400 hover:text-gray-600"
          >
            <X size={15} />
          </button>
        </div>
        <p className="text-sm text-gray-600 leading-relaxed">{news.body}</p>
      </div>
    </div>
  )
}

// ── Panel 1: TickerPanel ───────────────────────────────────────────────────

function TickerPanel() {
  const [selectedNews, setSelectedNews] = useState<{ title: string; body: string } | null>(null)

  return (
    <div className="flex items-center gap-3 flex-1 overflow-hidden min-w-0">
      {/* 지수 */}
      <div className="flex items-center gap-3 shrink-0">
        {INDICES.map((idx) => (
          <span key={idx.label} className="flex items-center gap-1 text-xs font-mono">
            <span className="text-gray-500 font-sans">{idx.label}</span>
            <span className="text-gray-800">{idx.value}</span>
            <span className={idx.change >= 0 ? 'text-green-600' : 'text-red-500'}>
              {idx.change >= 0 ? '▲' : '▼'}{Math.abs(idx.change)}%
            </span>
          </span>
        ))}
      </div>

      {/* 구분선 */}
      <span className="text-gray-200 shrink-0">|</span>

      {/* 뉴스 marquee */}
      <div className="flex-1 overflow-hidden relative">
        <div className="animate-marquee whitespace-nowrap flex">
          {NEWS.map((n, i) => (
            <button
              key={i}
              onClick={() => setSelectedNews(n)}
              className="text-xs text-gray-500 hover:text-blue-600 transition-colors mr-16 shrink-0"
            >
              {n.title}
            </button>
          ))}
          {/* 루프용 복제 */}
          {NEWS.map((n, i) => (
            <button
              key={`dup-${i}`}
              onClick={() => setSelectedNews(n)}
              className="text-xs text-gray-500 hover:text-blue-600 transition-colors mr-16 shrink-0"
            >
              {n.title}
            </button>
          ))}
        </div>
      </div>

      {selectedNews && (
        <NewsDialog news={selectedNews} onClose={() => setSelectedNews(null)} />
      )}
    </div>
  )
}

// ── Panel 2: IconPanel ─────────────────────────────────────────────────────

function IconPanel() {
  return (
    <div className="flex items-center gap-1 flex-1">
      {LINKS.map(({ icon: Icon, label, url }) => (
        <button
          key={label}
          onClick={() => window.open(url, '_blank', 'noopener,noreferrer')}
          title={label}
          className="flex items-center gap-0.5 px-2 py-1 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors text-xs"
        >
          <Icon size={14} />
          <ExternalLink size={10} className="opacity-50" />
        </button>
      ))}
    </div>
  )
}

// ── TopBarControlPanel ─────────────────────────────────────────────────────

export default function TopBarControlPanel() {
  const [panelIndex, setPanelIndex] = useState(0)

  return (
    <div className="flex items-center gap-1.5 flex-1 overflow-hidden min-w-0 mx-2">
      {/* 패널 전환 버튼 */}
      <button
        onClick={() => setPanelIndex((i) => (i + 1) % 2)}
        title={panelIndex === 0 ? '링크 패널로 전환' : '시세 패널로 전환'}
        className="shrink-0 p-1 rounded text-blue-300 hover:text-blue-600 hover:bg-blue-200 transition-colors"
      >
        <ChevronRight
          size={13}
          className={`transition-transform duration-200 ${panelIndex === 1 ? 'rotate-180' : ''}`}
        />
      </button>

      {panelIndex === 0 ? <TickerPanel /> : <IconPanel />}
    </div>
  )
}
