import { useState, useMemo } from 'react'
import { ChevronRight } from 'lucide-react'
import IndexBadge from '@/shared/components/IndexBadge'
import { useQuery } from '@tanstack/react-query'
import { getMarketJisu } from '@/services/stockService'

// ── Panel 2: 외부 링크 ────────────────────────────────────────────────────

const LINKS = [
    { label: 'KIS API', url: 'https://apiportal.koreainvestment.com/apiservice-apiservice' },
    { label: 'LS증권 API', url: 'https://openapi.ls-sec.co.kr/apiservice' },
    { label: '키움 OpenAPI', url: 'https://openapi.kiwoom.com/guide/apiguide' },
    { label: '네이버 증권', url: 'https://finance.naver.com' },
    { label: '한국거래소', url: 'https://www.krx.co.kr' },
    { label: '넥스트레이드', url: 'https://www.nextrade.co.kr' },
    { label: '환율 정보', url: 'https://finance.naver.com/marketindex/' },
]

const BADGE_COLORS: Record<string, string> = {
  'KIS API': '#80624c',
  'LS증권 API': '#003378',
  '키움 OpenAPI': '#e4007f',
  '한국거래소': '#00b4d5',
  '네이버 증권': '#03c75a',
  '넥스트레이드': '#ad0032',
  '환율 정보': '#6b7280',
}

// ── Panel 1: TickerPanel ───────────────────────────────────────────────────

function TickerPanel() {
  const { data: jisuData } = useQuery({
    queryKey: ['marketJisu'],
    queryFn: getMarketJisu,
    refetchInterval: 1000 * 60 * 5, // 5분마다 갱신
  })

  const indices = useMemo(() => {
    if (!jisuData || !jisuData.updated_at) return [
      { name: 'KOSPI', value: 0, change: 0, percentage: 0 },
      { name: 'KOSDAQ', value: 0, change: 0, percentage: 0 },
      { name: 'KOSPI200', value: 0, change: 0, percentage: 0 },
    ]
    return [
      { name: 'KOSPI', value: jisuData.kospi, change: jisuData.kospi_diff, percentage: jisuData.kospi_rate },
      { name: 'KOSDAQ', value: jisuData.kosdaq, change: jisuData.kosdaq_diff, percentage: jisuData.kosdaq_rate },
      { name: 'KOSPI200', value: jisuData.kospi200, change: jisuData.kospi200_diff, percentage: jisuData.kospi200_rate },
    ]
  }, [jisuData])

  return (
    <div className="flex items-center gap-3">
      {indices.map((idx) => (
        <IndexBadge
          key={idx.name}
          name={idx.name}
          value={idx.value}
          change={idx.change}
          percentage={idx.percentage}
        />
      ))}
    </div>
  )
}

// ── Panel 2: IconPanel ─────────────────────────────────────────────────────

function IconPanel() {
  return (
    <div className="flex items-center gap-1 flex-1 flex-wrap">
      {LINKS.map(({ label, url }) => {
        const badgeColor = BADGE_COLORS[label]

        return (
          <button
            key={label}
            onClick={() => window.open(url, '_blank', 'noopener,noreferrer')}
            title={label}
            className="px-2.5 py-1 rounded-full border text-xs font-semibold transition-all"
            style={
              badgeColor
                ? { backgroundColor: badgeColor, borderColor: badgeColor, color: '#ffffff' }
                : { backgroundColor: '#ffffff', borderColor: '#d1d5db', color: '#4b5563' }
            }
          >
            {label}
          </button>
        )
      })}
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
          size={18}
          className={`transition-transform duration-200 ${panelIndex === 1 ? 'rotate-180' : ''}`}
        />
      </button>

      {panelIndex === 0 ? <TickerPanel /> : <IconPanel />}
    </div>
  )
}
