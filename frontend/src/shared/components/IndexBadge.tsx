import React from 'react';

interface IndexBadgeProps {
  /** 지수 명칭 (예: 코스피, 코스닥) */
  name: string;
  /** 현재 지수 값 */
  value: number;
  /** 전일 대비 변동 수치 */
  change: number;
  /** 변동률 (%) */
  percentage: number;
}

/**
 * IndexBadge: 증시 지수(KOSPI, KOSDAQ 등)를 요약해서 보여주는 배지 컴포넌트
 * GEMINI.md의 디자인 원칙에 따라 상승은 Red-600, 하락은 Blue-600 색상을 사용합니다.
 * 
 * 참조: CombinedBadge.tsx (공통 UI 컴포넌트 구조)
 */
const IndexBadge: React.FC<IndexBadgeProps> = ({ name, value, change, percentage }) => {
  const isPositive = change > 0;
  const isNegative = change < 0;
  const numericPercentage = Number(String(percentage).replace(/[^(\d|.|-|+)]/g, ''))

  // GEMINI.md 지침: 상승/수익(text-red-600), 하락/손실(text-blue-600)
  const colorClass = isPositive ? 'text-red-600' : isNegative ? 'text-blue-600' : 'text-gray-600';
  const bgColorClass = isPositive ? 'bg-red-50' : isNegative ? 'bg-blue-50' : 'bg-gray-50';
  const percentagePrefix = numericPercentage > 0 ? '+' : numericPercentage < 0 ? '-' : '';

  return (
    <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-md border border-gray-200 ${bgColorClass} shadow-sm font-sans text-[12px] h-8`}>
      <span className="font-bold text-gray-700 border-r pr-2 border-gray-200">{name}</span>
      <span className="font-bold text-gray-900">
        {value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </span>
      <div className={`flex items-center gap-0.5 font-semibold ${colorClass}`}>
        <span>{isPositive ? '▲' : isNegative ? '▼' : '-'}</span>
        <span>{Math.abs(change).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        <span className="ml-0.5">({percentagePrefix}{Math.abs(numericPercentage).toFixed(2)}%)</span>
      </div>
    </div>
  );
};

export default IndexBadge;
