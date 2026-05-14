import React from 'react';
import type { ChangeEvent } from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';

// 1. 반환될 데이터의 타입을 정의합니다.
export interface NumberOverBelowData {
  value: number;
  isOver: boolean;
}

// 2. Props 타입을 정의합니다.
interface NumberOverBelowProps {
  label?: string;
  value: number;
  isOver: boolean;
  onChange: (data: NumberOverBelowData) => void;
  useIcon?: boolean;
  step?: number;
  min?: number;
  max?: number;
  unit?: string;
  className?: string;
}

const NumberOverBelow: React.FC<NumberOverBelowProps> = ({ 
  label,
  value, 
  isOver,
  onChange, 
  useIcon = false, 
  step = 1, 
  min = 0, 
  max = 1000000000,
  unit = "",
  className = "" 
}) => {
  const handleNumberChange = (e: ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value);
    if (!isNaN(val)) {
      onChange({ value: val, isOver });
    }
  };

  const toggleDirection = (dir: boolean) => {
    onChange({ value, isOver: dir });
  };

  return (
    <div className={`flex flex-col gap-0.5 ${className}`}>
      {label && <label className="text-[10px] font-medium text-gray-400 ml-1 whitespace-nowrap">{label}</label>}
      <div className="inline-flex items-center shadow-sm select-none border rounded-md overflow-hidden bg-white h-8">
        {/* 숫자 입력 필드 */}
        <div className="relative flex items-center h-full">
          <input
            type="number"
            value={value}
            onChange={handleNumberChange}
            step={step}
            min={min}
            max={max}
            className="w-20 h-full bg-white text-gray-800 px-2 text-[11px] font-mono outline-none focus:bg-blue-50/30 transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
          {unit && (
            <span className="absolute right-1 text-[9px] text-gray-400 font-bold pointer-events-none">
              {unit}
            </span>
          )}
        </div>

        {/* 버튼 그룹 */}
        <div className="flex h-full border-l">
          <button
            type="button"
            onClick={() => toggleDirection(true)}
            className={`px-1.5 flex items-center justify-center transition-colors ${
              isOver 
                ? 'bg-blue-600 text-white font-bold' 
                : 'bg-gray-50 text-gray-400 hover:bg-gray-100'
            }`}
            title="이상"
          >
            {useIcon ? <ChevronUp size={14} strokeWidth={3} /> : <span className="text-[10px]">↑</span>}
          </button>

          <button
            type="button"
            onClick={() => toggleDirection(false)}
            className={`px-1.5 border-l flex items-center justify-center transition-colors ${
              !isOver 
                ? 'bg-red-600 text-white font-bold' 
                : 'bg-gray-50 text-gray-400 hover:bg-gray-100'
            }`}
            title="이하"
          >
            {useIcon ? <ChevronDown size={14} strokeWidth={3} /> : <span className="text-[10px]">↓</span>}
          </button>
        </div>
      </div>
    </div>
  );
};

export default NumberOverBelow;
