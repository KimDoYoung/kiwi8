import React from 'react'
import PlaceholderPage from '@/pages/common/PlaceholderPage'
import AccountSummaryPage from '@/pages/accounts/AccountSummaryPage'
import RealtimeBalancePage from '@/pages/accounts/RealtimeBalancePage'
import ProfitTrendPage from '@/pages/accounts/ProfitTrendPage'
import ExecutionHistoryPage from '@/pages/accounts/ExecutionHistoryPage'
import KiwoomAccountPage from '@/pages/brokers/KiwoomAccountPage'
import KisAccountPage from '@/pages/brokers/KisAccountPage'
import LsAccountPage from '@/pages/brokers/LsAccountPage'

// screen_no → React 컴포넌트 매핑
// 향후 실제 페이지 구현 시 PlaceholderPage를 교체
const registry: Record<string, React.ComponentType<{ screenNo?: string; title?: string }>> = {
  // 홈
  'HOME': PlaceholderPage,
  // [1100 자산 현황]
  '1101': AccountSummaryPage,
  '1102': RealtimeBalancePage,
  '1103': ProfitTrendPage,
  '1104': ExecutionHistoryPage,
  // [1200 시장 분석]
  '1201': PlaceholderPage,
  '1202': PlaceholderPage,
  '1203': PlaceholderPage,
  '1204': PlaceholderPage,
  // [1300 주문 센터]
  '1301': PlaceholderPage,
  '1302': PlaceholderPage,
  // [2100 키움증권]
  '2101': KiwoomAccountPage,
  '2102': PlaceholderPage,
  // [3100 KIS]
  '3101': KisAccountPage,
  '3102': PlaceholderPage,
  '3103': PlaceholderPage,
  // [4100 LS증권]
  '4101': LsAccountPage,
  '4102': PlaceholderPage,
  // [8100 투자 기록]
  '8101': PlaceholderPage,
  // [8200 시스템 엔진]
  '8201': PlaceholderPage,
  '8202': PlaceholderPage,
}

export default registry
