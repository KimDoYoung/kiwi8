import React, { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';

interface CandleChartProps {
  data: any[];
  title?: string;
  height?: string | number;
}

const CandleChart: React.FC<CandleChartProps> = ({ data, _title, height = 400 }) => {
  const chartOptions = useMemo(() => {
    if (!data || data.length === 0) return {};

    // 1. 데이터 정렬
    const sortedData = [...data].sort((a, b) => {
        const dateA = a.주식영업일자 || a.영업일자 || '';
        const dateB = b.주식영업일자 || b.영업일자 || '';
        return dateA.localeCompare(dateB);
    });

    // 2. MA 계산을 위한 전체 종가 배열
    const allClosePrices = sortedData.map(item => parseFloat(item.주식종가 || item.종가 || '0'));

    // 이동평균선(MA) 계산 함수
    const calculateMA = (dayCount: number, prices: number[]) => {
      const result = [];
      for (let i = 0; i < prices.length; i++) {
        if (i < dayCount - 1) {
          result.push(null);
          continue;
        }
        let sum = 0;
        for (let j = 0; j < dayCount; j++) {
          sum += prices[i - j];
        }
        result.push(parseFloat((sum / dayCount).toFixed(2)));
      }
      return result;
    };

    const allMa5 = calculateMA(5, allClosePrices);
    const allMa20 = calculateMA(20, allClosePrices);
    const allMa60 = calculateMA(60, allClosePrices);

    // 3. 최근 2개월(약 45거래일) 데이터만 필터링하여 화면에 표시
    // MA 계산을 위해 앞쪽 데이터를 충분히 가져왔으므로, 사용자에게는 최근 부분만 보여줍니다.
    const displayCount = Math.min(sortedData.length, 45); 
    const startIndex = sortedData.length - displayCount;

    const displayData = sortedData.slice(startIndex);
    const displayMa5 = allMa5.slice(startIndex);
    const displayMa20 = allMa20.slice(startIndex);
    const displayMa60 = allMa60.slice(startIndex);

    const dates = displayData.map(item => {
      const d = item.주식영업일자 || item.영업일자 || '';
      return `${d.substring(4, 6)}/${d.substring(6, 8)}`;
    });

    const values = displayData.map(item => [
      parseFloat(item.주식시가2 || item.시가 || '0'),
      parseFloat(item.주식종가 || item.종가 || '0'),
      parseFloat(item.주식최저가 || item.저가 || '0'),
      parseFloat(item.주식최고가 || item.고가 || '0')
    ]);

    const volumes = displayData.map((item) => {
      const open = parseFloat(item.주식시가2 || item.시가 || '0');
      const close = parseFloat(item.주식종가 || item.종가 || '0');
      return {
        value: parseFloat(item.누적거래량 || item.거래량 || '0'),
        itemStyle: { color: close >= open ? '#ef4444' : '#3b82f6' }
      };
    });

    return {
      legend: {
        data: ['봉차트', 'MA5', 'MA20', 'MA60'],
        top: 0,
        itemGap: 15,
        textStyle: { fontSize: 11, fontWeight: 'bold' }
      },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'cross' },
        backgroundColor: 'rgba(255, 255, 255, 0.98)',
        borderWidth: 1,
        borderColor: '#ddd',
        padding: 10,
        textStyle: { fontSize: 12, color: '#333' },
        formatter: (params: any) => {
          let res = `<div style="border-bottom:1px solid #eee;padding-bottom:5px;margin-bottom:5px;font-weight:bold">${params[0].name}</div>`;
          params.forEach((item: any) => {
            if (item.seriesName === '봉차트') {
              const d = item.data;
              const isUp = d[2] >= d[1];
              const color = isUp ? '#ef4444' : '#3b82f6';
              res += `<div style="display:flex;justify-content:space-between;gap:20px"><span>시가:</span> <span style="font-family:monospace">${d[1].toLocaleString()}</span></div>`;
              res += `<div style="display:flex;justify-content:space-between;gap:20px;color:${color}"><span>종가:</span> <b style="font-family:monospace">${d[2].toLocaleString()}</b></div>`;
              res += `<div style="display:flex;justify-content:space-between;gap:20px"><span>고가:</span> <span style="font-family:monospace;color:#ef4444">${d[4].toLocaleString()}</span></div>`;
              res += `<div style="display:flex;justify-content:space-between;gap:20px"><span>저가:</span> <span style="font-family:monospace;color:#3b82f6">${d[3].toLocaleString()}</span></div>`;
            } else if (item.value !== null) {
              res += `<div style="display:flex;justify-content:space-between;gap:20px"><span>${item.marker} ${item.seriesName}:</span> <span style="font-family:monospace">${item.value.toLocaleString()}</span></div>`;
            }
          });
          return res;
        }
      },
      grid: [
        { left: '50', right: '20', height: '65%', top: '15%' },
        { left: '50', right: '20', top: '82%', height: '12%' }
      ],
      xAxis: [
        { type: 'category', data: dates, boundaryGap: true, axisLine: { lineStyle: { color: '#ccc' } }, splitLine: { show: false } },
        { type: 'category', gridIndex: 1, data: dates, boundaryGap: true, axisLine: { show: false }, axisTick: { show: false }, splitLine: { show: false }, axisLabel: { show: false } }
      ],
      yAxis: [
        { scale: true, splitArea: { show: true, areaStyle: { color: ['#fafafa', '#fff'] } }, splitLine: { lineStyle: { type: 'dashed', color: '#eee' } }, axisLabel: { fontSize: 10 } },
        { scale: true, gridIndex: 1, splitNumber: 2, axisLabel: { show: false }, axisLine: { show: false }, axisTick: { show: false }, splitLine: { show: false } }
      ],
      dataZoom: [{ type: 'inside', xAxisIndex: [0, 1], start: 0, end: 100 }],
      series: [
        {
          name: '봉차트',
          type: 'candlestick',
          data: values,
          itemStyle: {
            color: '#ef4444', color0: '#3b82f6',
            borderColor: '#ef4444', borderColor0: '#3b82f6'
          }
        },
        { name: 'MA5', type: 'line', data: displayMa5, smooth: true, showSymbol: false, lineStyle: { opacity: 0.8, width: 1.5, color: '#f59e0b' } },
        { name: 'MA20', type: 'line', data: displayMa20, smooth: true, showSymbol: false, lineStyle: { opacity: 0.8, width: 1.5, color: '#8b5cf6' } },
        { name: 'MA60', type: 'line', data: displayMa60, smooth: true, showSymbol: false, lineStyle: { opacity: 0.8, width: 1.5, color: '#10b981' } },
        { name: '거래량', type: 'bar', xAxisIndex: 1, yAxisIndex: 1, data: volumes }
      ]
    };
  }, [data]);

  return (
    <div className="w-full h-full min-h-[380px]">
      {data && data.length > 0 ? (
        <ReactECharts 
          option={chartOptions} 
          style={{ height: height, width: '100%' }} 
          notMerge={true}
        />
      ) : (
        <div className="flex items-center justify-center h-full text-gray-400 border border-dashed border-gray-200 rounded-lg">데이터가 없습니다.</div>
      )}
    </div>
  );
};

export default CandleChart;
