import { formatCost } from '@/lib/utils'

interface CombinedBadgeProps {
  label: string
  value: string | number
}

const CombinedBadge = ({ label, value }: CombinedBadgeProps) => {
  const displayValue = typeof value === 'number' ? formatCost(value) : value

  return (
    <div className="inline-flex items-center rounded-full border border-gray-700 bg-gray-900 text-sm font-medium">
      {/* 제목 부분 (Label) */}
      <span className="px-3 py-1 bg-gray-800 text-gray-400 rounded-l-full border-r border-gray-700">
        {label}
      </span>
      {/* 내용 부분 (Value) */}
      <span className="px-3 py-1 text-white">
        {displayValue}
      </span>
    </div>
  );
};

export default CombinedBadge;