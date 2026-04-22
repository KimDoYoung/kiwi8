import ReactECharts from 'echarts-for-react'
import type { EChartsOption } from 'echarts'

// 2026년 1~4월 일별 누적 수익률 (%) 더미 데이터
const DATES = [
  '01/02','01/06','01/08','01/10','01/14','01/16','01/20','01/22','01/24','01/28',
  '02/03','02/05','02/07','02/11','02/13','02/17','02/19','02/21','02/25','02/27',
  '03/03','03/05','03/07','03/11','03/13','03/17','03/19','03/21','03/25','03/27',
  '04/01','04/03','04/07','04/09','04/11','04/14','04/16',
]

const KIWOOM =  [0.3,0.8,1.2,0.9,1.5,2.1,1.8,2.6,3.1,3.8, 3.5,4.2,4.8,4.1,5.0,5.8,6.2,5.7,6.9,7.4, 7.0,7.8,8.5,8.1,9.0,8.6,9.4,10.2,9.8,10.5, 10.1,11.0,11.8,12.3,11.9,12.7,13.1]
const KIS    =  [0.1,0.5,0.3,0.9,0.6,1.2,0.8,1.5,1.1,1.9, 1.5,2.2,1.8,2.6,2.1,2.9,2.4,3.2,2.7,3.5, 3.0,3.8,3.3,4.1,3.6,4.4,3.9,4.7,4.2,5.0, 4.5,5.3,4.8,5.6,5.1,5.9,6.2]
const LS     =  [0.5,1.1,0.8,1.6,1.3,2.0,1.6,2.4,2.0,2.8, 2.3,3.1,2.7,3.5,3.0,3.8,3.3,4.1,3.6,4.4, 3.9,4.7,4.2,3.8,4.6,4.0,4.8,5.4,4.9,5.7, 5.1,5.9,5.3,6.1,5.5,6.3,6.8]
const KOSPI  =  [0.2,0.6,0.4,0.8,0.5,1.1,0.7,1.3,0.9,1.5, 1.1,1.8,1.4,2.0,1.6,2.2,1.8,2.4,2.0,2.6, 2.2,2.8,2.4,2.0,2.7,2.3,2.9,3.4,3.0,3.6, 3.2,3.8,3.4,4.0,3.6,4.2,4.5]

const lineOption: EChartsOption = {
  backgroundColor: '#fff',
  tooltip: {
    trigger: 'axis',
    formatter: (params: any) => {
      const date = params[0].axisValue
      const rows = params.map((p: any) =>
        `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${p.color};margin-right:5px"></span>${p.seriesName}: <b>${p.value > 0 ? '+' : ''}${p.value.toFixed(2)}%</b>`
      ).join('<br/>')
      return `<div style="font-size:12px">${date}<br/>${rows}</div>`
    },
  },
  legend: {
    top: 8,
    data: ['키움증권', '한국투자증권', 'LS증권', 'KOSPI(기준)'],
    textStyle: { fontSize: 12 },
  },
  grid: { top: 50, left: 55, right: 20, bottom: 50 },
  xAxis: {
    type: 'category',
    data: DATES,
    axisLabel: { fontSize: 11, rotate: 30 },
    boundaryGap: false,
  },
  yAxis: {
    type: 'value',
    axisLabel: { formatter: (v: number) => `${v.toFixed(1)}%`, fontSize: 11 },
    splitLine: { lineStyle: { type: 'dashed', color: '#f0f0f0' } },
  },
  series: [
    { name: '키움증권',     type: 'line', data: KIWOOM, smooth: true, lineStyle: { width: 2 }, symbol: 'none', color: '#22c55e' },
    { name: '한국투자증권', type: 'line', data: KIS,    smooth: true, lineStyle: { width: 2 }, symbol: 'none', color: '#3b82f6' },
    { name: 'LS증권',       type: 'line', data: LS,     smooth: true, lineStyle: { width: 2 }, symbol: 'none', color: '#f59e0b' },
    { name: 'KOSPI(기준)',  type: 'line', data: KOSPI,  smooth: true, lineStyle: { width: 1.5, type: 'dashed' }, symbol: 'none', color: '#9ca3af' },
  ],
}

// 월별 증권사별 수익률 바차트
const BAR_MONTHS = ['1월', '2월', '3월', '4월']
const barOption: EChartsOption = {
  backgroundColor: '#fff',
  tooltip: {
    trigger: 'axis',
    axisPointer: { type: 'shadow' },
    formatter: (params: any) =>
      params[0].axisValue + '<br/>' +
      params.map((p: any) =>
        `<span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${p.color};margin-right:5px"></span>${p.seriesName}: <b>${p.value > 0 ? '+' : ''}${p.value.toFixed(2)}%</b>`
      ).join('<br/>'),
  },
  legend: { top: 8, textStyle: { fontSize: 12 } },
  grid: { top: 50, left: 55, right: 20, bottom: 36 },
  xAxis: { type: 'category', data: BAR_MONTHS, axisLabel: { fontSize: 12 } },
  yAxis: {
    type: 'value',
    axisLabel: { formatter: (v: number) => `${v.toFixed(1)}%`, fontSize: 11 },
    splitLine: { lineStyle: { type: 'dashed', color: '#f0f0f0' } },
  },
  series: [
    { name: '키움증권',     type: 'bar', data: [3.8, 7.4, 10.5, 13.1], barMaxWidth: 36, color: '#22c55e',
      label: { show: true, position: 'top', formatter: (p: any) => `${p.value.toFixed(1)}%`, fontSize: 11 } },
    { name: '한국투자증권', type: 'bar', data: [1.9, 3.5, 5.0, 6.2],   barMaxWidth: 36, color: '#3b82f6',
      label: { show: true, position: 'top', formatter: (p: any) => `${p.value.toFixed(1)}%`, fontSize: 11 } },
    { name: 'LS증권',       type: 'bar', data: [2.8, 4.4, 5.7, 6.8],   barMaxWidth: 36, color: '#f59e0b',
      label: { show: true, position: 'top', formatter: (p: any) => `${p.value.toFixed(1)}%`, fontSize: 11 } },
  ],
}

export default function ProfitTrendPage() {
  const latest = { kiwoom: 13.1, kis: 6.2, ls: 6.8, kospi: 4.5 }

  return (
    <div className="flex flex-col h-full overflow-auto bg-gray-50">
      {/* 헤더 */}
      <div className="px-4 py-2.5 border-b border-gray-200 bg-white flex items-center gap-3 shrink-0">
        <span className="text-sm font-bold text-gray-700">통합 수익률 추이</span>
        <span className="text-xs text-gray-400 font-mono">[1103]</span>
        <span className="ml-auto text-xs text-gray-400">2026.01.01 ~ 2026.04.17 (YTD)</span>
      </div>

      {/* KPI 카드 */}
      <div className="grid grid-cols-4 gap-3 p-4 shrink-0">
        {[
          { label: '키움증권', value: latest.kiwoom, color: 'text-green-600', bg: 'bg-green-50 border-green-200' },
          { label: '한국투자증권', value: latest.kis, color: 'text-blue-600', bg: 'bg-blue-50 border-blue-200' },
          { label: 'LS증권', value: latest.ls, color: 'text-amber-600', bg: 'bg-amber-50 border-amber-200' },
          { label: 'KOSPI', value: latest.kospi, color: 'text-gray-600', bg: 'bg-gray-50 border-gray-200' },
        ].map((card) => (
          <div key={card.label} className={`rounded-xl border p-4 ${card.bg}`}>
            <div className="text-xs text-gray-500 mb-1">{card.label} YTD</div>
            <div className={`text-2xl font-bold ${card.color}`}>
              +{card.value.toFixed(2)}%
            </div>
          </div>
        ))}
      </div>

      {/* 차트 2개 */}
      <div className="grid grid-cols-2 gap-3 px-4 pb-4 flex-1 min-h-0">
        <div className="bg-white rounded-xl border border-gray-200 p-3 flex flex-col">
          <div className="text-xs font-semibold text-gray-600 mb-1">누적 수익률 추이 (일별)</div>
          <div className="flex-1 min-h-0">
            <ReactECharts option={lineOption} style={{ height: '100%', minHeight: 280 }} />
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-3 flex flex-col">
          <div className="text-xs font-semibold text-gray-600 mb-1">월별 수익률 비교</div>
          <div className="flex-1 min-h-0">
            <ReactECharts option={barOption} style={{ height: '100%', minHeight: 280 }} />
          </div>
        </div>
      </div>
    </div>
  )
}
