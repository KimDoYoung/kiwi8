import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useStockDetailStore } from '@/store/stockDetailStore'
import api from '@/lib/api'
import { fmt, toNum } from '@/lib/utils'
import Loading from '@/shared/components/Loading'
import StockSearchBar from '@/shared/components/StockSearchBar'
import {
  Search, Building2, BarChart3, MessageSquare, ChevronDown, ChevronRight,
  TrendingUp, TrendingDown, Minus, ExternalLink, RefreshCw,
} from 'lucide-react'

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────
interface StkInfo {
  stk_cd: string
  stk_nm: string | null
  market_name: string | null
  up_name: string | null
  up_size_name: string | null
  list_count: string | null
  reg_day: string | null
  last_price: string | null
  state: string | null
  audit_info: string | null
  nxt_enable: string | null
  order_warning: string | null
  main_products: string | null
  representative_name: string | null
  homepage: string | null
  location: string | null
}

interface JudalTheme {
  theme_name: string
  stock_name: string
  stock_code: string
  current_price: number
  price_change: number
  yesterday_ratio: number
  three_day_sum: number
  expected_return: number
  pbr: number
  per: number
  eps: number
  market_cap: number
  buffett_choice: number
  high_52w: number
  low_52w: number
  change_rate_low_52w: number
  change_rate_high_52w: number
  alienation_index_52w: number
  alienation_index_3y: number
  related_themes: string
  updated_at: string
}

interface StkOption {
  id: number
  stk_cd: string
  date: string
  options: string
  created_at: string
}

// ──────────────────────────────────────────────
// Fetch helpers
// ──────────────────────────────────────────────
const fetchStkInfo = async (stk_cd: string): Promise<StkInfo | null> => {
  const r = await api.get(`/api/v1/stock/stk-info/${stk_cd}`)
  return r.data?.data ?? null
}

const fetchJudalThemes = async (stk_cd: string): Promise<JudalTheme[]> => {
  const r = await api.get('/api/v1/stock/theme', { params: { stock_code: stk_cd, limit: 50 } })
  return r.data?.data ?? []
}

const fetchOptions = async (stk_cd: string): Promise<StkOption[]> => {
  const r = await api.get(`/api/v1/stock/options/${stk_cd}`, { params: { limit: 20 } })
  return r.data?.data?.list ?? []
}

// ──────────────────────────────────────────────
// Sub-components
// ──────────────────────────────────────────────
function SectionCard({
  title, icon: Icon, children, badge,
}: {
  title: string
  icon: React.ComponentType<{ size?: number; className?: string }>
  children: React.ReactNode
  badge?: string
}) {
  return (
    <div className="bg-white border border-gray-200 rounded shadow-sm overflow-hidden">
      <div className="px-3 py-2 bg-gray-50 border-b border-gray-200 flex items-center gap-2">
        <Icon size={14} className="text-gray-500" />
        <span className="font-bold text-gray-700 text-[12px]">{title}</span>
        {badge && (
          <span className="ml-auto text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-semibold">
            {badge}
          </span>
        )}
      </div>
      <div className="p-3">{children}</div>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex gap-2 py-0.5 border-b border-gray-50 last:border-0">
      <span className="text-gray-400 w-20 shrink-0 text-[11px]">{label}</span>
      <span className="text-gray-800 font-medium text-[11px] break-all">{value || '-'}</span>
    </div>
  )
}

function RateBadge({ value, unit = '%' }: { value: number; unit?: string }) {
  const color = value > 0 ? 'text-red-600' : value < 0 ? 'text-blue-600' : 'text-gray-500'
  const Icon = value > 0 ? TrendingUp : value < 0 ? TrendingDown : Minus
  return (
    <span className={`flex items-center gap-0.5 font-bold ${color}`}>
      <Icon size={10} />
      {value > 0 ? '+' : ''}{value?.toFixed(2)}{unit}
    </span>
  )
}

// stk_options 날짜 포맷: YYYYMMDD → YYYY-MM-DD
function fmtDate(ymd: string) {
  if (ymd.length === 8) return `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`
  return ymd
}

// ──────────────────────────────────────────────
// Sections
// ──────────────────────────────────────────────
function StkInfoSection({ stk_cd }: { stk_cd: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['evaluation', 'stk-info', stk_cd],
    queryFn: () => fetchStkInfo(stk_cd),
    staleTime: 1000 * 60 * 10,
  })

  if (isLoading) return <Loading message="기본 정보 로딩 중..." />
  if (!data) return (
    <div className="text-gray-400 text-[11px] py-4 text-center">stk_info 데이터 없음 (fill_stk_info 실행 필요)</div>
  )

  return (
    <SectionCard title="기본 정보 (stk_info)" icon={Building2}>
      <div className="grid grid-cols-2 gap-x-6">
        <div>
          <InfoRow label="시장" value={data.market_name} />
          <InfoRow label="업종" value={data.up_name} />
          <InfoRow label="규모" value={data.up_size_name} />
          <InfoRow label="상장일" value={data.reg_day ? `${data.reg_day.slice(0,4)}-${data.reg_day.slice(4,6)}-${data.reg_day.slice(6)}` : null} />
          <InfoRow label="전일종가" value={data.last_price ? fmt(toNum(data.last_price)) + '원' : null} />
          <InfoRow label="상태" value={data.state} />
          <InfoRow label="감리" value={data.audit_info} />
          <InfoRow label="NXT" value={data.nxt_enable} />
        </div>
        <div>
          <InfoRow label="대표자" value={data.representative_name} />
          <InfoRow label="지역" value={data.location} />
          <InfoRow label="상장주식" value={data.list_count ? fmt(toNum(data.list_count)) + '주' : null} />
          <InfoRow label="주요제품" value={data.main_products} />
          <InfoRow label="홈페이지" value={data.homepage} />
        </div>
      </div>
      {data.homepage && (
        <a
          href={data.homepage.startsWith('http') ? data.homepage : `https://${data.homepage}`}
          target="_blank" rel="noopener noreferrer"
          className="mt-2 inline-flex items-center gap-1 text-[11px] text-blue-600 hover:underline"
        >
          <ExternalLink size={11} /> {data.homepage}
        </a>
      )}
    </SectionCard>
  )
}

function JudalSection({ stk_cd }: { stk_cd: string }) {
  const { data: themes = [], isLoading } = useQuery({
    queryKey: ['evaluation', 'judal', stk_cd],
    queryFn: () => fetchJudalThemes(stk_cd),
    staleTime: 1000 * 60 * 10,
  })

  if (isLoading) return <Loading message="주달 데이터 로딩 중..." />
  if (!themes.length) return (
    <div className="text-gray-400 text-[11px] py-4 text-center">주달 데이터 없음 (judal_themes 수집 필요)</div>
  )

  // 테마 중복 제거된 첫 번째 항목 기준으로 지표 표시 (같은 종목이 여러 테마에 걸쳐 있음)
  const t = themes[0]
  const themeNames = [...new Set(themes.map(x => x.theme_name))]

  return (
    <SectionCard title="주달 분석 (judal_themes)" icon={BarChart3} badge={`${themes.length}개 테마`}>
      <div className="grid grid-cols-2 gap-x-6 mb-3">
        <div>
          <div className="flex gap-2 py-0.5 border-b border-gray-50">
            <span className="text-gray-400 w-20 shrink-0 text-[11px]">현재가</span>
            <span className="text-gray-800 font-bold text-[11px]">{fmt(t.current_price)}원</span>
          </div>
          <div className="flex gap-2 py-0.5 border-b border-gray-50">
            <span className="text-gray-400 w-20 shrink-0 text-[11px]">전일비</span>
            <RateBadge value={t.yesterday_ratio} />
          </div>
          <div className="flex gap-2 py-0.5 border-b border-gray-50">
            <span className="text-gray-400 w-20 shrink-0 text-[11px]">3일합산</span>
            <RateBadge value={t.three_day_sum} />
          </div>
          <div className="flex gap-2 py-0.5 border-b border-gray-50">
            <span className="text-gray-400 w-20 shrink-0 text-[11px]">기대수익률</span>
            <RateBadge value={t.expected_return} />
          </div>
          <div className="flex gap-2 py-0.5 border-b border-gray-50">
            <span className="text-gray-400 w-20 shrink-0 text-[11px]">버핏초이스</span>
            <span className="text-gray-800 font-medium text-[11px]">{t.buffett_choice || '-'}</span>
          </div>
        </div>
        <div>
          <div className="flex gap-2 py-0.5 border-b border-gray-50">
            <span className="text-gray-400 w-20 shrink-0 text-[11px]">PER</span>
            <span className="text-gray-800 font-medium text-[11px]">{t.per?.toFixed(2) || '-'}배</span>
          </div>
          <div className="flex gap-2 py-0.5 border-b border-gray-50">
            <span className="text-gray-400 w-20 shrink-0 text-[11px]">PBR</span>
            <span className="text-gray-800 font-medium text-[11px]">{t.pbr?.toFixed(2) || '-'}배</span>
          </div>
          <div className="flex gap-2 py-0.5 border-b border-gray-50">
            <span className="text-gray-400 w-20 shrink-0 text-[11px]">EPS</span>
            <span className="text-gray-800 font-medium text-[11px]">{fmt(t.eps)}원</span>
          </div>
          <div className="flex gap-2 py-0.5 border-b border-gray-50">
            <span className="text-gray-400 w-20 shrink-0 text-[11px]">52주 고/저</span>
            <span className="text-[11px]">
              <span className="text-red-600 font-bold">{fmt(t.high_52w)}</span>
              <span className="text-gray-400"> / </span>
              <span className="text-blue-600 font-bold">{fmt(t.low_52w)}</span>
            </span>
          </div>
          <div className="flex gap-2 py-0.5 border-b border-gray-50">
            <span className="text-gray-400 w-20 shrink-0 text-[11px]">52주소외지수</span>
            <span className="text-gray-800 font-medium text-[11px]">{t.alienation_index_52w ?? '-'}</span>
          </div>
        </div>
      </div>

      <div>
        <div className="text-[11px] text-gray-500 font-semibold mb-1">관련 테마 ({themeNames.length}개)</div>
        <div className="flex flex-wrap gap-1">
          {themeNames.map(name => (
            <span key={name} className="px-2 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-100 rounded text-[10px] font-medium">
              {name}
            </span>
          ))}
        </div>
      </div>
      {t.updated_at && (
        <div className="text-[10px] text-gray-400 mt-2 text-right">수집: {t.updated_at}</div>
      )}
    </SectionCard>
  )
}

function OptionsSection({ stk_cd }: { stk_cd: string }) {
  const [expanded, setExpanded] = useState<number | null>(null)
  const { data: optList = [], isLoading, refetch } = useQuery({
    queryKey: ['evaluation', 'options', stk_cd],
    queryFn: () => fetchOptions(stk_cd),
    staleTime: 1000 * 60 * 5,
  })

  if (isLoading) return <Loading message="토론방 의견 로딩 중..." />

  return (
    <SectionCard
      title="네이버 종목토론방 의견 (stk_options)"
      icon={MessageSquare}
      badge={optList.length ? `${optList.length}건` : undefined}
    >
      <div className="flex justify-end mb-2">
        <button
          onClick={() => refetch()}
          className="flex items-center gap-1 text-[11px] text-gray-500 hover:text-gray-700"
        >
          <RefreshCw size={11} /> 새로고침
        </button>
      </div>

      {!optList.length ? (
        <div className="text-gray-400 text-[11px] py-4 text-center">
          수집된 의견 없음 (scheduler scrap_naver_options 실행 필요)
        </div>
      ) : (
        <div className="space-y-1">
          {optList.map(opt => {
            const isOpen = expanded === opt.id
            const lines = opt.options.split('\n\n')
            const preview = lines.slice(0, 2).join('\n\n')
            return (
              <div key={opt.id} className="border border-gray-100 rounded overflow-hidden">
                <button
                  className="w-full flex items-center gap-2 px-3 py-2 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
                  onClick={() => setExpanded(isOpen ? null : opt.id)}
                >
                  {isOpen ? <ChevronDown size={13} className="text-gray-400 shrink-0" /> : <ChevronRight size={13} className="text-gray-400 shrink-0" />}
                  <span className="font-semibold text-blue-700 text-[11px] shrink-0">{fmtDate(opt.date)}</span>
                  <span className="text-gray-500 text-[10px] ml-auto shrink-0">{lines.length}건</span>
                </button>
                {isOpen && (
                  <div className="px-3 py-2 bg-white">
                    <pre className="text-[11px] text-gray-700 leading-relaxed whitespace-pre-wrap font-sans">
                      {opt.options}
                    </pre>
                  </div>
                )}
                {!isOpen && (
                  <div className="px-3 py-1.5 bg-white border-t border-gray-50">
                    <pre className="text-[10px] text-gray-400 leading-relaxed whitespace-pre-wrap font-sans line-clamp-3">
                      {preview}
                    </pre>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </SectionCard>
  )
}

// ──────────────────────────────────────────────
// Main Page
// ──────────────────────────────────────────────
export default function StockEvaluationPage() {
  const { stk_cd, stk_nm } = useStockDetailStore()

  return (
    <div className="flex flex-col h-full bg-gray-100 text-[12px]">
      {/* Header */}
      <div className="h-11 px-4 border-b border-gray-300 bg-gray-50 flex items-center gap-4 shrink-0 shadow-sm z-10">
        <div className="flex items-center gap-1.5">
          <BarChart3 size={14} className="text-blue-600" />
          <span className="font-extrabold text-gray-700">종목 평가</span>
        </div>
        <StockSearchBar />
        {stk_cd && (
          <div className="ml-2 flex items-center gap-1.5">
            <span className="font-bold text-gray-900">{stk_nm}</span>
            <span className="font-mono text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200 text-[11px] font-bold">
              {stk_cd}
            </span>
          </div>
        )}
      </div>

      {!stk_cd ? (
        <div className="flex-1 flex flex-col items-center justify-center text-gray-400 bg-white m-3 rounded-xl border border-dashed border-gray-300">
          <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4">
            <Search size={32} className="text-gray-300" />
          </div>
          <h2 className="text-lg font-bold text-gray-700 mb-1">종목을 선택해 주세요</h2>
          <p className="text-sm">상단 검색 바에 종목명 또는 코드를 입력하세요.</p>
        </div>
      ) : (
        <div className="flex-1 overflow-auto p-3 space-y-3">
          {/* 상단: 기본정보 + 주달 2컬럼 */}
          <div className="grid grid-cols-2 gap-3">
            <StkInfoSection stk_cd={stk_cd} />
            <JudalSection stk_cd={stk_cd} />
          </div>
          {/* 하단: 토론방 전체폭 */}
          <OptionsSection stk_cd={stk_cd} />
        </div>
      )}
    </div>
  )
}
