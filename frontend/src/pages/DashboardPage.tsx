import { useWsStore } from '@/store/wsStore'

const JANGUBUN: Record<string, string> = {
  '1': '코스피', '2': '코스닥', '5': '선물/옵션', '6': 'NXT',
  '8': 'KRX야간', '9': '미국주식', 'A': '중국오전', 'B': '중국오후',
  'C': '홍콩오전', 'D': '홍콩오후', 'E': '일본오전', 'F': '일본오후',
}
const JSTATUS: Record<string, string> = {
  // 공통
  '11': '장전동시호가개시',
  '21': '장시작',
  '22': '장개시10초전',
  '23': '장개시1분전',
  '24': '장개시5분전',
  '25': '장개시10분전',
  '31': '장후동시호가개시',
  '41': '장마감',
  '42': '장마감10초전',
  '43': '장마감1분전',
  '44': '장마감5분전',
  '51': '시간외종가매매개시',
  '52': '시간외종가종료·단일가개시',
  '53': '사용안함',
  '54': '시간외단일가매매종료',
  '55': '프리마켓개시',
  'A2': '프리마켓개시10초전',
  'A3': '프리마켓개시1분전',
  'A4': '프리마켓개시5분전',
  'A5': '프리마켓개시10분전',
  '56': '에프터마켓개시',
  'B2': '에프터마켓개시10초전',
  'B3': '에프터마켓개시1분전',
  'B4': '에프터마켓개시5분전',
  'B5': '에프터마켓개시10분전',
  '57': '프리마켓마감',
  'C2': '프리마켓마감10초전',
  'C3': '프리마켓마감1분전',
  'C4': '프리마켓마감5분전',
  '58': '에프터마켓마감',
  'D2': '에프터마켓마감10초전',
  'D3': '에프터마켓마감1분전',
  'D4': '에프터마켓마감5분전',
  // KOSPI/KOSDAQ (jangubun 1,2)
  '61': '서킷브레이크1단계발동',
  '62': '서킷브레이크1단계해제',
  '63': '서킷브레이크1단계동시호가종료',
  '64': '사이드카매도발동',
  '65': '사이드카매도해제',
  '66': '사이드카매수발동',
  '67': '사이드카매수해제',
  '68': '서킷브레이크2단계발동',
  '69': '서킷브레이크3단계·장종료',
  '70': '서킷브레이크2단계해제',
  '71': '서킷브레이크2단계동시호가종료',
  // 선물/옵션 전용 (jangubun 5)
  '72': '3단계상한가예정',
  '73': '3단계하한가예정',
  '74': '2단계상한가확대',
  '75': '2단계하한가확대',
  '76': '3단계상한가확대',
  '77': '3단계하한가확대',
}

const BrokerBadge = ({ broker }: { broker: string }) => {
  const styles: Record<string, string> = {
    kiwoom: 'bg-amber-100 text-amber-700 border-amber-300',
    kis:    'bg-sky-100 text-sky-700 border-sky-300',
    ls:     'bg-teal-100 text-teal-700 border-teal-300',
  }
  return (
    <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${styles[broker] ?? 'bg-slate-100 text-slate-500 border-slate-300'}`}>
      {broker}
    </span>
  )
}

const Card = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <div className={`bg-white border border-slate-200 rounded-2xl shadow-sm ${className}`}>
    {children}
  </div>
)

const SectionTitle = ({ color, children, count }: { color: string; children: React.ReactNode; count?: number }) => (
  <div className="flex items-center gap-2 mb-3">
    <span className={`w-1 h-4 rounded-full ${color}`} />
    <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest">{children}</h2>
    {count !== undefined && (
      <span className="ml-auto text-[11px] text-slate-400 font-mono">{count}건</span>
    )}
  </div>
)

const DashboardPage = () => {
  const { connected, newsItems, marketStatus, orderEvents, latestCcnl, rawLog, totalCount } = useWsStore()
  const ccnlList = Object.values(latestCcnl)
  const marketList = Object.values(marketStatus)

  return (
    <div className="min-h-screen bg-slate-50 p-6 space-y-5">

      {/* 헤더 */}
      <div className="flex items-center justify-between pb-1">
        <div>
          <h1 className="text-xl font-bold text-slate-800 tracking-tight">WebSocket 모니터</h1>
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

      {/* Debug 패널 */}
      <section>
        <SectionTitle color="bg-slate-400">
          디버그 · Raw 수신 로그
          <span className="ml-2 px-2 py-0.5 bg-slate-100 text-slate-500 rounded-full font-mono text-[10px]">
            총 {totalCount}건
          </span>
        </SectionTitle>
        <Card className="divide-y divide-slate-50 max-h-48 overflow-y-auto font-mono">
          {rawLog.length === 0 ? (
            <div className="p-4 text-center text-slate-400 text-sm">
              {connected ? '연결됨 — 메시지 대기 중' : '서버 미연결'}
            </div>
          ) : (
            rawLog.map((r, i) => (
              <div key={i} className="px-3 py-2 flex items-start gap-3 hover:bg-slate-50">
                <span className="text-[10px] text-slate-400 whitespace-nowrap pt-px">{r.ts}</span>
                <span className="text-[11px] text-slate-600 break-all leading-snug">{r.text.slice(0, 200)}</span>
              </div>
            ))
          )}
        </Card>
      </section>

      {/* 장운영정보 */}
      <section>
        <SectionTitle color="bg-teal-400" count={marketList.length}>장운영정보 · LS JIF</SectionTitle>
        {marketList.length === 0 ? (
          <Card className="p-5 text-center text-slate-400 text-sm">수신 대기 중...</Card>
        ) : (
          <Card className="p-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {marketList.map((m) => (
                <div key={m.jangubun} className="bg-teal-50 rounded-xl px-3 py-2.5 border border-teal-100">
                  <div className="text-[10px] text-teal-500 mb-1 font-medium">
                    {JANGUBUN[m.jangubun] ?? m.jangubun}
                  </div>
                  <div className="text-sm font-mono font-bold text-teal-700">
                    {JSTATUS[m.jstatus] ?? m.jstatus}
                  </div>
                  <div className="text-[10px] text-teal-400 font-mono mt-0.5">{m.jangubun}/{m.jstatus}</div>
                </div>
              ))}
            </div>
          </Card>
        )}
      </section>

      {/* 체결 + 주문 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* 종목 체결 */}
        <section>
          <SectionTitle color="bg-sky-400" count={ccnlList.length}>종목 체결 · 동적 구독</SectionTitle>
          <Card>
            {ccnlList.length === 0 ? (
              <div className="p-5 text-center text-slate-400 text-sm">매매 시 종목 구독 후 수신됩니다</div>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-100 text-slate-400">
                    <th className="text-left px-3 py-2.5">브로커</th>
                    <th className="text-left px-3 py-2.5">종목</th>
                    <th className="text-right px-3 py-2.5">현재가</th>
                    <th className="text-right px-3 py-2.5">등락율</th>
                    <th className="text-right px-3 py-2.5">거래량</th>
                  </tr>
                </thead>
                <tbody>
                  {ccnlList.map((c) => {
                    const rate = parseFloat(c.change_rate ?? '0')
                    const rateColor = rate > 0 ? 'text-rose-500' : rate < 0 ? 'text-sky-600' : 'text-slate-400'
                    return (
                      <tr key={`${c.broker}:${c.stock_code}`}
                          className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                        <td className="px-3 py-2"><BrokerBadge broker={c.broker} /></td>
                        <td className="px-3 py-2 font-mono text-slate-700 font-semibold">{c.stock_code}</td>
                        <td className={`px-3 py-2 text-right font-mono font-bold ${rateColor}`}>
                          {Number(c.price).toLocaleString()}
                        </td>
                        <td className={`px-3 py-2 text-right font-mono ${rateColor}`}>
                          {rate > 0 ? '+' : ''}{c.change_rate}%
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-slate-400">
                          {Number(c.volume).toLocaleString()}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </Card>
        </section>

        {/* 계좌체결통보 */}
        <section>
          <SectionTitle color="bg-amber-400" count={orderEvents.length}>계좌체결통보 · KIS H0STCNI0</SectionTitle>
          <Card className="max-h-64 overflow-y-auto">
            {orderEvents.length === 0 ? (
              <div className="p-5 text-center text-slate-400 text-sm">수신 대기 중...</div>
            ) : (
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-white border-b border-slate-100">
                  <tr className="text-slate-400">
                    <th className="text-left px-3 py-2.5">종목</th>
                    <th className="text-left px-3 py-2.5">구분</th>
                    <th className="text-right px-3 py-2.5">체결가</th>
                    <th className="text-right px-3 py-2.5">수량</th>
                  </tr>
                </thead>
                <tbody>
                  {orderEvents.map((o, i) => (
                    <tr key={i} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                      <td className="px-3 py-2 text-slate-700 font-semibold">{o.stock_name || o.stock_code}</td>
                      <td className="px-3 py-2">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border
                          ${o.sell_buy === '2'
                            ? 'bg-rose-50 text-rose-600 border-rose-200'
                            : 'bg-sky-50 text-sky-600 border-sky-200'}`}>
                          {o.sell_buy === '2' ? '매수' : '매도'}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-slate-700">
                        {Number(o.ccnl_price).toLocaleString()}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-slate-400">{o.ccnl_qty}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </section>
      </div>

      {/* 뉴스 */}
      <section>
        <SectionTitle color="bg-violet-400" count={newsItems.length}>뉴스 · LS NWS</SectionTitle>
        <Card className="max-h-72 overflow-y-auto divide-y divide-slate-50">
          {newsItems.length === 0 ? (
            <div className="p-5 text-center text-slate-400 text-sm">수신 대기 중...</div>
          ) : (
            newsItems.slice(0, 7).map((n) => (
              <div key={n.news_id} className="px-4 py-3 hover:bg-slate-50 transition-colors flex items-start gap-3">
                <span className="text-[10px] font-mono text-slate-400 whitespace-nowrap pt-px">
                  {n.time?.replace(/(\d{2})(\d{2})(\d{2})/, '$1:$2:$3') ?? ''}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-700 leading-snug">{n.title}</p>
                  {n.stock_codes && (
                    <p className="text-[10px] text-slate-400 mt-1 font-mono">{n.stock_codes}</p>
                  )}
                </div>
              </div>
            ))
          )}
        </Card>
      </section>

    </div>
  )
}

export default DashboardPage
