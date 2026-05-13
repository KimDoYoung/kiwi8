import { fmt } from '@/lib/utils';

/**
 * 가격 위치 표시 바를 렌더링하는 React 컴포넌트입니다.
 * 
 * @interface PricePositionBarProps - 컴포넌트에 필요한 프로퍼티 인터페이스
 */
interface PricePositionBarProps {
  high: number; // 가격 범위의 최고값
  low: number;  // 가격 범위의 최저값
  current: number; // 현재 가격
  className?: string; // 선택적 클래스 이름 (추가 스타일 적용 가능)
}

/**
 * 가격 위치 표시 바 컴포넌트 함수.
 * 
 * @param {PricePositionBarProps} props - 컴포넌트에 전달된 프로퍼티
 */
export function PricePositionBar({ high, low, current, className = '' }: PricePositionBarProps) {
  // 만약 high, low, 또는 current가 없으면 null을 반환하여 컴포넌트를 렌더링하지 않음
  if (!high || !low || !current) return null;

  // 가격 범위의 길이 계산
  const range = high - low;
  
  // 현재 가격이 범위 내에서의 상대 위치百分율 계산
  const pos = range === 0 ? 0 : ((current - low) / range) * 100;

  // 위치를 0과 100 사이로 제한 (유효성 검사)
  const clampedPos = Math.max(0, Math.min(100, pos));

  // 컴포넌트 리턴
  return (
    <div className={`flex items-center h-full w-full px-1 gap-1.5 ${className}`}>
      {/* 최저 가격 표시 */}
      <span className="text-[9px] text-gray-400 tabular-nums min-w-[40px] text-right">{fmt(low)}</span>
      
      {/* 배경 바와 현재 위치를 나타내는 점 */}
      <div className="relative flex-1 h-1 bg-red-200 rounded-full">
        <div 
          className="absolute top-[-3px] bottom-[-3px] w-0.5 bg-gray-800 z-10" 
          style={{ left: `${clampedPos}%`, transform: 'translateX(-50%)' }}
        />
      </div>
      
      {/* 최고 가격 표시 */}
      <span className="text-[9px] text-gray-400 tabular-nums min-w-[40px] text-left">{fmt(high)}</span>
    </div>
  );
}