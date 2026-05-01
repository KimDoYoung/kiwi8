import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useStockDetailStore } from '@/store/stockDetailStore'
import { useModalStore } from '@/store/modalStore'
import api from '@/lib/api'
import { toNum, fmt } from '@/pages/brokers/accountUtils'
import Loading from '@/shared/components/Loading'
import LoadingFail from '@/shared/components/LoadingFail'
import { RefreshCw, TrendingUp, Minus, Info, BarChart3, PieChart, FileText } from 'lucide-react'

async function fetchStockInfo(stk_cd: string | null) {
  if (!stk_cd) return null
  const res = await api.get(`/api/v1/stock/info/${stk_cd}`)
  return res.data
}

/** 뱃지 컴포넌트 */
function Badge({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={`px-1.5 py-0.5 rounded border text-[10px] font-bold leading-none ${className}`}>
      {children}
    </span>
  )
}

/** 타이틀 영역 주요 지표 뱃지 - 짙은 보라색 테마 적용 */
function StatItem({ label, value, unit = '' }: { label: string; value: string | number; unit?: string }) {
  return (
    <div className="flex items-center gap-1 bg-purple-50 border border-purple-100 rounded px-1.5 py-0.5 shadow-sm">
      <span className="text-purple-500 font-medium">{label}</span>
      <span className="text-purple-900 font-black">{value}{unit}</span>
    </div>
  )
}

/** 섹션 카드 컴포넌트 */
function SectionCard({ title, icon: Icon, children, className = '' }: { title: string; icon: any; children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white border border-gray-200 rounded shadow-sm overflow-hidden flex flex-col min-w-[320px] flex-1 ${className}`}>
      <div className="px-2.5 py-1.5 bg-gray-50 border-b border-gray-200 flex items-center gap-1.5 shrink-0">
        <Icon size={14} className="text-gray-500" />
        <span className="font-bold text-gray-700">{title}</span>
      </div>
      <div className="p-2.5 flex-1">
        {children}
      </div>
    </div>
  )
}

/** 날짜 포맷팅 (YYYYMMDD -> YYYY-MM-DD) */
function formatDate(dateStr: string) {
  if (!dateStr) return '-'
  const clean = String(dateStr).replace(/[^0-9]/g, '')
  if (clean.length !== 8) return dateStr
  return `${clean.substring(0, 4)}-${clean.substring(4, 6)}-${clean.substring(6, 8)}`
}

/** 부호 및 퍼센트 포맷팅 (중복 부호 방지) */
function formatChange(value: any, rate: any) {
  const v = String(value || '')
  const r = String(rate || '')
  
  const vNum = toNum(v)
  const rNum = toNum(r)

  // 값 앞에 부호 결정 (이미 있으면 붙이지 않음)
  const vPrefix = (vNum > 0 && !v.includes('+')) ? '+' : ''
  const rPrefix = (rNum > 0 && !r.includes('+')) ? '+' : ''

  return `${vPrefix}${fmt(vNum)} (${rPrefix}${rNum}%)`
}

export default function StockDetailPage() {
  const { stk_cd, stk_nm } = useStockDetailStore()
  const openOrderModal = useModalStore((s) => s.openOrderModal)

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['stock', 'info', stk_cd],
    queryFn: () => fetchStockInfo(stk_cd),
    enabled: !!stk_cd,
    staleTime: 1000 * 60,
  })

  const info = data?.data || {}

  const priceClass = (v: any) => {
    const n = toNum(v)
    if (n > 0) return 'text-red-600'
    if (n < 0) return 'text-blue-600'
    return 'text-gray-600'
  }

  const renderInfoRow = (label: string, value: any, options: { isPrice?: boolean; isNum?: boolean; unit?: string; className?: string } = {}) => (
    <div className="flex justify-between items-center py-0.5 border-b border-gray-100 last:border-0">
      <span className="text-gray-500 shrink-0 mr-2">{label}</span>
      <span className={`font-semibold text-right ${options.className || 'text-gray-800'}`}>
        {options.isPrice || options.isNum ? fmt(toNum(value)) : value || '-'}
        {options.unit && value ? options.unit : ''}
      </span>
    </div>
  )

  const marketCapFormatted = useMemo(() => {
    const n = toNum(info.시가총액)
    return n > 0 ? `${(n / 100).toFixed(1)}억` : '-'
  }, [info.시가총액])

  const salesFormatted = useMemo(() => `${(toNum(info.매출액) / 100).toFixed(1)}억`, [info.매출액])
  const profitFormatted = useMemo(() => `${(toNum(info.영업이익) / 100).toFixed(1)}억`, [info.영업이익])
  const netIncomeFormatted = useMemo(() => `${(toNum(info.당기순이익) / 100).toFixed(1)}억`, [info.당기순이익])

  if (!stk_cd) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-400">
        <div className="text-4xl mb-2">🔍</div>
        <p>조회할 종목을 선택해 주세요.</p>
      </div>
    )
  }

  if (isLoading) return <Loading message="종목 정보를 불러오는 중..." />
  if (error || !data) return <LoadingFail message="종목 정보를 불러오는데 실패했습니다." />

  return (
    <div className="flex flex-col h-full bg-gray-100 text-[12px]">
      {/* 1층: 타이틀 및 메인 헤더 영역 */}
      <div className="px-3 py-2 border-b border-gray-300 bg-white flex items-center justify-between shrink-0 flex-wrap gap-y-2">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-1.5">
            <span className="text-lg font-black text-gray-900 tracking-tight">{info.종목명 || stk_nm}</span>
            <span
              onClick={() => window.open(`https://finance.naver.com/item/main.naver?code=${stk_cd}`, '_blank')}
              className="font-mono text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200 text-xs font-bold leading-none cursor-pointer hover:bg-blue-100 hover:border-blue-400 transition-colors"
              title="네이버 금융 열기"
            >
              {stk_cd}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              <Badge className="bg-orange-50 text-orange-700 border-orange-200">
                감리: {info.감리구분 || '정상'}
              </Badge>
              {info.NXT가능여부 === 'Y' ? (
                <Badge className="bg-green-50 text-green-700 border-green-200">NXT가능</Badge>
              ) : (
                <Badge className="bg-red-50 text-red-700 border-red-200">NXT불가</Badge>
              )}
            </div>

            <div className="flex items-center gap-1 text-[11px]">
              <StatItem label="시총" value={marketCapFormatted} />
              <StatItem label="외인" value={info.외인소진률} unit="%" />
              <StatItem label="유통주" value={fmt(toNum(info.유통주식))} unit="천주" />
              <StatItem label="유통비" value={info.유통비율} unit="%" />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => refetch()}
            className="p-1.5 hover:bg-gray-100 rounded text-gray-500 border border-gray-200 bg-white transition-colors"
            title="새로고침"
          >
            <RefreshCw size={14} />
          </button>
          <div className="flex gap-1 ml-1">
            <button
              onClick={() => openOrderModal({
                stk_cd: stk_cd,
                stk_nm: info.종목명 || stk_nm || '',
                price: toNum(info.현재가),
                qty: 1,
                broker: 'kiwoom',
                order_type: 'buy'
              })}
              className="px-3 py-1 bg-red-600 text-white rounded font-bold hover:bg-red-700 transition-colors shadow-sm"
            >
              매수
            </button>
            <button
              onClick={() => openOrderModal({
                stk_cd: stk_cd,
                stk_nm: info.종목명 || stk_nm || '',
                price: toNum(info.현재가),
                qty: 1,
                broker: 'kiwoom',
                order_type: 'sell'
              })}
              className="px-3 py-1 bg-blue-600 text-white rounded font-bold hover:bg-blue-700 transition-colors shadow-sm"
            >
              매도
            </button>
          </div>
        </div>
      </div>

      {/* 2층: 서브 타이틀 바 (재무 핵심 지표) */}
      <div className="px-4 py-1.5 border-b border-gray-200 bg-gray-50 flex items-center gap-6 shrink-0 text-[11px]">
        <div className="flex items-center gap-2">
          <span className="text-gray-400 font-medium">매출액</span>
          <span className="text-gray-800 font-bold">{salesFormatted}</span>
        </div>
        <div className="w-[1px] h-3 bg-gray-200" />
        <div className="flex items-center gap-2">
          <span className="text-gray-400 font-medium">영업이익</span>
          <span className="text-gray-800 font-bold">{profitFormatted}</span>
        </div>
        <div className="w-[1px] h-3 bg-gray-200" />
        <div className="flex items-center gap-2">
          <span className="text-gray-400 font-medium">당기순이익</span>
          <span className="text-gray-800 font-bold">{netIncomeFormatted}</span>
        </div>
        <div className="ml-auto flex items-center gap-1 text-gray-400">
          <Info size={12} />
          <span>단위: 억원 (최근 결산 기준)</span>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-3">
        <div className="flex flex-wrap gap-3">
          
          {/* 1. 기업 설명 카드 */}
          <SectionCard title="기업 설명" icon={FileText}>
            <p className="text-gray-600 leading-relaxed whitespace-pre-line bg-gray-50 p-2.5 border border-gray-100 rounded text-[11px] h-full min-h-[100px]">
              {info.company_summary || '기업 개요 정보가 없습니다.'}
            </p>
          </SectionCard>

          {/* 2. 기업 정보 카드 (지표 부분) */}
          <SectionCard title="기업 정보" icon={Info}>
            <div className="flex flex-col gap-0.5">
              {renderInfoRow('시장/업종', `${info.시장명}/${info.업종명}`)}
              {renderInfoRow('기업규모', info.회사크기분류)}
              {renderInfoRow('상장일', formatDate(info.상장일))}
              {renderInfoRow('종목상태', info.종목상태)}
              {renderInfoRow('감리구분', info.감리구분)}
              {renderInfoRow('NXT가능', info.NXT가능여부)}
            </div>
          </SectionCard>

          {/* 3. 시세 정보 카드 */}
          <SectionCard title="시세 정보" icon={TrendingUp}>
            <div className="grid grid-cols-2 gap-x-8">
              <div>
                <div className="flex justify-between items-center py-1.5 border-b border-gray-100 mb-1">
                  <span className="text-gray-500 font-bold">현재가</span>
                  {/* 폰트 1단계 작게: text-xl -> text-lg, 부호 제거: Math.abs 적용 */}
                  <span className={`text-lg font-black ${priceClass(info.전일대비)}`}>
                    {fmt(Math.abs(toNum(info.현재가)))}
                  </span>
                </div>
                {/* 중복 부호 방지 로직 적용 */}
                {renderInfoRow('전일대비', formatChange(info.전일대비, info.등락율), { className: priceClass(info.전일대비) })}
                {renderInfoRow('거래량', info.거래량, { isNum: true })}
                {renderInfoRow('거래대비', info.거래대비, { unit: '%' })}
              </div>
              <div>
                {renderInfoRow('시가', info.시가, { isPrice: true })}
                {renderInfoRow('고가', info.고가, { isPrice: true, className: 'text-red-600' })}
                {renderInfoRow('저가', info.저가, { isPrice: true, className: 'text-blue-600' })}
                {renderInfoRow('기준가', info.기준가, { isPrice: true })}
              </div>
            </div>
          </SectionCard>

          {/* 4. 가격 범위 카드 */}
          <SectionCard title="가격 범위" icon={Minus}>
            <div className="grid grid-cols-2 gap-x-8">
              <div>
                {renderInfoRow('상한가', info.상한가, { isPrice: true, className: 'text-red-600' })}
                {renderInfoRow('하한가', info.하한가, { isPrice: true, className: 'text-blue-600' })}
                {renderInfoRow('대용가', info.대용가, { isPrice: true })}
                {renderInfoRow('신용비율', info.신용비율, { unit: '%' })}
              </div>
              <div>
                {renderInfoRow('연중최고', info.연중최고, { isPrice: true, className: 'text-red-600' })}
                {renderInfoRow('연중최저', info.연중최저, { isPrice: true, className: 'text-blue-600' })}
                {renderInfoRow('250최고', info['250최고'], { isPrice: true })}
                {renderInfoRow('250최저', info['250최저'], { isPrice: true })}
              </div>
            </div>
          </SectionCard>

          {/* 5. 투자 지표 카드 */}
          <SectionCard title="투자 지표" icon={BarChart3}>
            <div className="grid grid-cols-2 gap-x-8">
              <div>
                {renderInfoRow('PER', info.PER, { unit: '배' })}
                {renderInfoRow('PBR', info.PBR, { unit: '배' })}
                {renderInfoRow('ROE', info.ROE, { unit: '%' })}
                {renderInfoRow('EV/EBITDA', info.EV, { unit: '배' })}
              </div>
              <div>
                {renderInfoRow('EPS', info.EPS, { isNum: true, unit: '원' })}
                {renderInfoRow('BPS', info.BPS, { isNum: true, unit: '원' })}
                {renderInfoRow('액면가', info.액면가, { isPrice: true })}
                {renderInfoRow('결산월', info.결산월, { unit: '월' })}
              </div>
            </div>
          </SectionCard>

          {/* 6. 자본 및 주식 카드 */}
          <SectionCard title="자본 및 주식" icon={PieChart}>
            <div className="grid grid-cols-2 gap-x-8">
              <div>
                {renderInfoRow('시가총액', marketCapFormatted, { className: 'text-gray-800' })}
                {renderInfoRow('자본금', `${(toNum(info.자본금) / 100).toFixed(1)}억`)}
                {renderInfoRow('상장주식', info.상장주식, { isNum: true, unit: '천주' })}
              </div>
              <div>
                {renderInfoRow('유통주식', info.유통주식, { isNum: true, unit: '천주' })}
                {renderInfoRow('유통비율', info.유통비율, { unit: '%' })}
                {renderInfoRow('외인소진', info.외인소진률, { unit: '%' })}
              </div>
            </div>
          </SectionCard>

        </div>
      </div>
    </div>
  )
}
