import { Badge } from '@/shared/components/ui/badge'

// CompanySizeBadge 컴포넌트
interface CompanySizeBadgeProps {
  size: '대형주' | '중형주' | '소형주';
}

export const CompanySizeBadge = ({ size }: CompanySizeBadgeProps) => {
  let color;
  switch (size) {
    case '대형주':
      color = 'bg-blue-200 text-blue-800'; // 대형주의 배경색을 파스텔 블루로 설정
      break;
    case '중형주':
      color = 'bg-green-200 text-green-800'; // 중형주의 배경색을 파스텔 그린으로 설정
      break;
    case '소형주':
      color = 'bg-yellow-200 text-yellow-800'; // 소형주의 배경색을 파스텔 옐로우로 설정
      break;
    default:
      color = 'bg-gray-200 text-gray-800'; // 기본 배경색은 회색으로 설정
  }

  return (
    <Badge className={color}>
      {size}
    </Badge>
  );
};

// MarketBadge 컴포넌트
interface MarketBadgeProps {
  market: '코스닥' | '코스피';
}

export const MarketBadge = ({ market }: MarketBadgeProps) => {
  let color;
  switch (market) {
    case '코스닥':
      color = 'bg-pink-200 text-pink-800'; // 코스닥의 배경색을 파스텔 핑크로 설정
      break;
    case '코스피':
      color = 'bg-orange-200 text-orange-800'; // 코스피의 배경색을 파스텔 오렌지로 설정
      break;
    default:
      color = 'bg-gray-200 text-gray-800'; // 기본 배경색은 회색으로 설정
  }

  return (
    <Badge className={color}>
      {market}
    </Badge>
  );
};

// NXT가능여부 뱃지 컴포넌트
interface NXTBadgeProps {
  isPossible: 'Y' | 'N';
}

export const NXTBadge = ({ isPossible }: NXTBadgeProps) => {
  let color;
  switch (isPossible) {
    case 'Y':
      color = 'bg-green-200 text-green-800'; // Y의 배경색을 파스텔 그린으로 설정
      break;
    case 'N':
      color = 'bg-red-200 text-red-800'; // N의 배경색을 파스텔 레드로 설정
      break;
    default:
      color = 'bg-gray-200 text-gray-800'; // 기본 배경색은 회색으로 설정
  }

  return (
    <Badge className={color}>
      {isPossible}
    </Badge>
  );
};