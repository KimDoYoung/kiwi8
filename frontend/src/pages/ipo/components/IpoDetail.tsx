import { ExternalLink } from 'lucide-react'
import type { IpoRow } from '../types'
import { StatusBadge } from './StatusBadge'
import { MarketBadge } from './MarketBadge'
import { DetailCard, DetailRow } from './DetailCard'

interface Props {
    row: IpoRow
}

function IpoStockLink({ code, label, variant }: { code: string; label: string; variant: 'blue' | 'green' }) {
    const path = variant === 'blue' ? 'view_01' : 'view_04'
    const cls = variant === 'blue'
        ? 'bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100'
        : 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
    return (
        <a
            href={`http://www.ipostock.co.kr/view_pg/${path}.asp?code=${code}`}
            target="_blank" rel="noopener noreferrer"
            className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium ${cls}`}
        >
            <ExternalLink className="w-3 h-3" />
            {label}
        </a>
    )
}

export function IpoDetail({ row }: Props) {
    return (
        <div className="flex flex-col h-full overflow-hidden">
            {/* 헤더 */}
            <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex-shrink-0">
                <div className="flex items-start justify-between gap-2 flex-wrap">
                    <div>
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="text-base font-bold text-gray-900">{row.stock_name}</span>
                            <StatusBadge status={row.status} />
                            <MarketBadge market={row.market_type} />
                        </div>
                        <div className="flex items-center gap-3 text-xs text-gray-500">
                            {row.stock_code && <span>종목코드: <b className="text-gray-700">{row.stock_code}</b></span>}
                            {row.industry  && <span>{row.industry}</span>}
                        </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                        {row.website && (
                            <a href={row.website} target="_blank" rel="noreferrer"
                                className="flex items-center gap-1 text-[11px] text-gray-500 hover:text-blue-600 border border-gray-200 px-2 py-0.5 rounded hover:border-blue-300">
                                <ExternalLink className="w-3 h-3" />홈페이지
                            </a>
                        )}
                        <IpoStockLink code={row.track_id} label="회사정보" variant="blue" />
                        <IpoStockLink code={row.track_id} label="공모정보" variant="green" />
                    </div>
                </div>
            </div>

            {/* 2×2 카드 그리드 */}
            <div className="flex-1 overflow-y-auto p-3">
                <div className="grid grid-cols-2 gap-3">
                    {/* 일정 — 인디고 */}
                    <DetailCard title="일정" headerBg="bg-indigo-500" bodyBg="bg-indigo-50">
                        <DetailRow label="수요예측일" value={row.demand_forecast_date} />
                        <DetailRow label="공모청약일" value={row.ipo_subscription_date} />
                        <DetailRow label="납입일"     value={row.payment_date} />
                        <DetailRow label="환불일"     value={row.refund_date} />
                        <DetailRow label="상장일"     value={row.listing_date} />
                        {row.ir_data && <DetailRow label="IR 일정" value={row.ir_data} />}
                    </DetailCard>

                    {/* 공모 정보 — 에메랄드 */}
                    <DetailCard title="공모 정보" headerBg="bg-emerald-500" bodyBg="bg-emerald-50">
                        <DetailRow label="총공모주식수"  value={row.total_ipo_shares} />
                        <DetailRow label="액면가"        value={row.face_value} />
                        <DetailRow label="희망공모가격"  value={row.desired_ipo_price} />
                        <DetailRow label="확정공모가격"  value={row.final_ipo_price} />
                        <DetailRow label="공모금액"      value={row.ipo_proceeds} />
                        <DetailRow label="청약경쟁률"    value={row.subscription_competition_rate} />
                        <DetailRow label="주간사"        value={row.lead_manager} />
                    </DetailCard>

                    {/* 회사 정보 — 오렌지 */}
                    <DetailCard title="회사 정보" headerBg="bg-orange-400" bodyBg="bg-orange-50">
                        <DetailRow label="대표이사"   value={row.ceo} />
                        <DetailRow label="기업구분"   value={row.business_type} />
                        <DetailRow label="본점소재지" value={row.headquarters_location} />
                        <DetailRow label="대표전화"   value={row.phone_number} />
                        <DetailRow label="최대주주"   value={row.major_shareholder} />
                    </DetailCard>

                    {/* 재무 정보 — 퍼플 */}
                    <DetailCard title="재무 정보" headerBg="bg-purple-500" bodyBg="bg-purple-50">
                        <DetailRow label="매출액"             value={row.revenue} />
                        <DetailRow label="법인세차감전순이익" value={row.pre_tax_continuing_operations_profit} />
                        <DetailRow label="순이익"             value={row.net_profit} />
                        <DetailRow label="자기자본"           value={row.capital} />
                    </DetailCard>
                </div>
            </div>
        </div>
    )
}
