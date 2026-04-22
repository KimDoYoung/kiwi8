import ReactECharts from 'echarts-for-react'
import type { EChartsOption } from 'echarts'
import { useMemo, useState } from 'react'
import { AgGridReact } from 'ag-grid-react'
import type { ColDef } from 'ag-grid-community'
import { AllCommunityModule, ModuleRegistry } from 'ag-grid-community'

ModuleRegistry.registerModules([AllCommunityModule])

interface ExecRow {
  time: string
  broker: string
  code: string
  name: string
  side: '매수' | '매도'
  qty: number
  price: number
  amount: number
  profit: number | null
}

const DATA: ExecRow[] = [
  { time:'09:01:22', broker:'키움',   code:'005930', name:'삼성전자',    side:'매수', qty:10,  price:71_200, amount:712_000,   profit:null       },
  { time:'09:03:45', broker:'KIS',    code:'005380', name:'현대차',      side:'매수', qty:5,   price:237_000, amount:1_185_000, profit:null       },
  { time:'09:12:11', broker:'LS',     code:'068270', name:'셀트리온',    side:'매도', qty:6,   price:191_500, amount:1_149_000, profit:156_000    },
  { time:'09:18:34', broker:'키움',   code:'000660', name:'SK하이닉스',  side:'매수', qty:3,   price:179_000, amount:537_000,   profit:null       },
  { time:'09:32:07', broker:'KIS',    code:'035720', name:'카카오',      side:'매도', qty:15,  price:53_500,  amount:802_500,   profit:45_000     },
  { time:'09:47:53', broker:'LS',     code:'000270', name:'기아',        side:'매수', qty:8,   price:101_500, amount:812_000,   profit:null       },
  { time:'10:05:19', broker:'키움',   code:'035420', name:'NAVER',       side:'매도', qty:4,   price:229_000, amount:916_000,   profit:76_000     },
  { time:'10:23:42', broker:'KIS',    code:'247540', name:'에코프로비엠', side:'매수', qty:2,  price:171_000, amount:342_000,   profit:null       },
  { time:'10:44:01', broker:'LS',     code:'003550', name:'LG',          side:'매도', qty:10,  price:83_000,  amount:830_000,   profit:50_000     },
  { time:'11:02:28', broker:'키움',   code:'373220', name:'LG에너지솔루션', side:'매수', qty:1, price:346_000, amount:346_000,  profit:null       },
  { time:'11:15:55', broker:'KIS',    code:'051910', name:'LG화학',      side:'매도', qty:3,   price:288_500, amount:865_500,   profit:-34_500    },
  { time:'11:33:17', broker:'LS',     code:'207940', name:'삼성바이오로직스', side:'매수', qty:1, price:893_000, amount:893_000, profit:null      },
  { time:'13:08:44', broker:'키움',   code:'005930', name:'삼성전자',    side:'매도', qty:10,  price:72_400,  amount:724_000,  profit:12_000     },
  { time:'13:21:09', broker:'KIS',    code:'006400', name:'삼성SDI',     side:'매수', qty:2,   price:399_000, amount:798_000,   profit:null       },
  { time:'14:02:33', broker:'LS',     code:'036570', name:'NC소프트',    side:'매도', qty:4,   price:171_000, amount:684_000,   profit:-96_000    },
  { time:'14:45:18', broker:'키움',   code:'000660', name:'SK하이닉스',  side:'매도', qty:3,   price:181_000, amount:543_000,   profit:6_000      },
  { time:'15:12:02', broker:'KIS',    code:'005380', name:'현대차',      side:'매도', qty:5,   price:239_500, amount:1_197_500, profit:12_500     },
  { time:'15:28:41', broker:'LS',     code:'000270', name:'기아',        side:'매도', qty:8,   price:103_000, amount:824_000,   profit:12_000     },
]

function SideCell({ value }: { value: string }) {
  return (
    <span className={`px-1.5 py-0.5 rounded text-[11px] font-bold ${value === '매수' ? 'bg-red-50 text-red-500' : 'bg-blue-50 text-blue-500'}`}>
      {value}
    </span>
  )
}
function ProfitCell({ value }: { value: number | null }) {
  if (value === null) return <span className="text-gray-300 text-xs">-</span>
  const style: React.CSSProperties = value > 0 ? { color: '#ef4444', fontWeight: 600 } : { color: '#3b82f6', fontWeight: 600 }
  return <span style={style}>{(value > 0 ? '+' : '') + value.toLocaleString('ko-KR')}</span>
}

// 증권사별 체결 건수 도넛
const brokerCounts = ['KIS', 'LS', 'Kiwoom'].map((b) => ({
  name: b, value: DATA.filter((d) => d.broker === b || (b === 'Kiwoom' && d.broker === '키움')).length,
}))
const donutOption: EChartsOption = {
  backgroundColor: '#fff',
  tooltip: { trigger: 'item', formatter: '{b}: {c}건 ({d}%)' },
  legend: { bottom: 8, textStyle: { fontSize: 11 } },
  series: [{
    type: 'pie', radius: ['48%', '72%'], center: ['50%', '45%'],
    label: { show: false },
    data: [
      { ...brokerCounts[0], itemStyle: { color: '#80624c' } },
      { ...brokerCounts[1], itemStyle: { color: '#003378' } },
      { ...brokerCounts[2], itemStyle: { color: '#e4007f' } },
    ],
  }],
}

// 시간대별 거래량 바
const hourBuckets: Record<string, number> = {}
DATA.forEach((d) => {
  const h = d.time.slice(0, 2) + '시'
  hourBuckets[h] = (hourBuckets[h] ?? 0) + d.amount / 1_000_000
})
const hourBarOption: EChartsOption = {
  backgroundColor: '#fff',
  tooltip: { trigger: 'axis', formatter: (p: any) => `${p[0].axisValue}<br/>거래대금: <b>${p[0].value.toFixed(1)}백만원</b>` },
  grid: { top: 20, left: 52, right: 12, bottom: 36 },
  xAxis: { type: 'category', data: Object.keys(hourBuckets), axisLabel: { fontSize: 11 } },
  yAxis: { type: 'value', axisLabel: { formatter: (v: number) => `${v.toFixed(0)}M`, fontSize: 10 }, splitLine: { lineStyle: { type: 'dashed', color: '#f0f0f0' } } },
  series: [{ type: 'bar', data: Object.values(hourBuckets).map((v) => +v.toFixed(2)), barMaxWidth: 40,
    itemStyle: { color: '#6366f1' },
    label: { show: true, position: 'top', formatter: (p: any) => `${p.value.toFixed(1)}`, fontSize: 10 },
  }],
}

// 매수/매도 비율
const buyAmt = DATA.filter((d) => d.side === '매수').reduce((s, d) => s + d.amount, 0)
const sellAmt = DATA.filter((d) => d.side === '매도').reduce((s, d) => s + d.amount, 0)
const buySellOption: EChartsOption = {
  backgroundColor: '#fff',
  tooltip: { trigger: 'item', formatter: (p: any) => `${p.name}: ${(p.value / 1_000_000).toFixed(1)}백만원 (${p.percent}%)` },
  legend: { bottom: 8, textStyle: { fontSize: 11 } },
  series: [{
    type: 'pie', radius: ['48%', '72%'], center: ['50%', '45%'],
    label: { show: false },
    data: [
      { name: '매수', value: buyAmt, itemStyle: { color: '#ef4444' } },
      { name: '매도', value: sellAmt, itemStyle: { color: '#3b82f6' } },
    ],
  }],
}

export default function ExecutionHistoryPage() {
  const [filter, setFilter] = useState<'전체' | 'KIS' | 'LS' | 'Kiwoom'>('전체')

  const colDefs = useMemo<ColDef<ExecRow>[]>(() => [
    { field: 'time',   headerName: '체결시간', width: 90,  cellStyle: { fontFamily: 'monospace', fontSize: '11px' } },
    { field: 'broker', headerName: '증권사',   width: 72 },
    { field: 'code',   headerName: '종목코드', width: 88,  cellStyle: { fontFamily: 'monospace', fontSize: '11px' } },
    { field: 'name',   headerName: '종목명',   width: 140 },
    { field: 'side',   headerName: '구분',     width: 70,  cellRenderer: SideCell },
    { field: 'qty',    headerName: '수량',     width: 70,  type: 'numericColumn', valueFormatter: (p) => p.value.toLocaleString() },
    { field: 'price',  headerName: '체결가',   width: 100, type: 'numericColumn', valueFormatter: (p) => p.value.toLocaleString() },
    { field: 'amount', headerName: '체결금액', width: 115, type: 'numericColumn', valueFormatter: (p) => p.value.toLocaleString() },
    { field: 'profit', headerName: '실현손익', width: 110, cellRenderer: ProfitCell },
  ], [])

  const filtered = filter === '전체' ? DATA : DATA.filter((d) => {
    if (filter === 'Kiwoom') return d.broker === 'Kiwoom' || d.broker === '키움'
    return d.broker === filter
  })
  const totalProfit = DATA.reduce((s, d) => s + (d.profit ?? 0), 0)

  return (
    <div className="flex flex-col h-full overflow-hidden bg-gray-50">
      {/* 헤더 */}
      <div className="px-4 py-2.5 border-b border-gray-200 bg-white flex items-center gap-3 shrink-0">
        <span className="text-sm font-bold text-gray-700">전 증권사 체결내역</span>
        <span className="text-xs text-gray-400 font-mono">[1104]</span>
        <span className="text-xs text-gray-500 ml-2">
          실현손익: <span className={totalProfit >= 0 ? 'text-red-500 font-bold' : 'text-blue-500 font-bold'}>
            {(totalProfit > 0 ? '+' : '') + totalProfit.toLocaleString('ko-KR')}원
          </span>
        </span>
        <span className="ml-auto text-xs text-gray-400">2026-04-17</span>
      </div>

      {/* 차트 3개 */}
      <div className="grid grid-cols-3 gap-3 p-3 shrink-0">
        <div className="bg-white rounded-xl border border-gray-200 p-2">
          <div className="text-xs font-semibold text-gray-500 mb-1 text-center">증권사별 체결건수</div>
          <ReactECharts option={donutOption} style={{ height: 160 }} />
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-2">
          <div className="text-xs font-semibold text-gray-500 mb-1 text-center">시간대별 거래대금</div>
          <ReactECharts option={hourBarOption} style={{ height: 160 }} />
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-2">
          <div className="text-xs font-semibold text-gray-500 mb-1 text-center">매수/매도 비중</div>
          <ReactECharts option={buySellOption} style={{ height: 160 }} />
        </div>
      </div>

      {/* 필터 탭 + 그리드 */}
      <div className="flex-1 flex flex-col min-h-0 px-3 pb-3">
        <div className="flex gap-1 mb-2 shrink-0">
          {(['전체', 'KIS', 'LS', 'Kiwoom'] as const).map((b) => (
            <button
              key={b}
              onClick={() => setFilter(b)}
              className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors
                ${filter === b ? 'bg-green-600 text-white' : 'bg-white border border-gray-200 text-gray-500 hover:border-green-400'}`}
            >
              {b}
            </button>
          ))}
          <span className="ml-auto text-xs text-gray-400 self-center">{filtered.length}건</span>
        </div>
        <div className="flex-1 ag-theme-alpine min-h-0">
          <AgGridReact
            rowData={filtered}
            columnDefs={colDefs}
            defaultColDef={{ resizable: true, sortable: true }}
            domLayout="normal"
            headerHeight={32}
            rowHeight={26}
          />
        </div>
      </div>
    </div>
  )
}
