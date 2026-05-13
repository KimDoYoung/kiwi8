import React from 'react'
import PlaceholderPage from '@/pages/common/PlaceholderPage'
import AccountSummaryPage from '@/pages/accounts/AccountSummaryPage'
import TotalBalancePage from '@/pages/accounts/TotalBalancePage'
import ProfitTrendPage from '@/pages/accounts/ProfitTrendPage'
import ExecutionHistoryPage from '@/pages/accounts/ExecutionHistoryPage'
import KiwoomAccountPage from '@/pages/brokers/KiwoomAccountPage'
import KisAccountPage from '@/pages/brokers/KisAccountPage'
import LsAccountPage from '@/pages/brokers/LsAccountPage'
import StkDiaryList from '@/pages/diary/StkDiaryList'
import SettingsPage from '@/pages/settings/SettingsPage'
import LogViewPage from '@/pages/settings/LogViewPage'
import StockDetailPage from '@/pages/stock/StockDetailPage'
import MyStockPage from '@/pages/stock/MyStockPage'
import SchedulerPage from '@/pages/manage/SchedulerPage'

// screen_no → React 컴포넌트 매핑
// 향후 실제 페이지 구현 시 PlaceholderPage를 교체
const registry: Record<string, React.ComponentType<{ screenNo?: string; title?: string }>> = {
  // 홈
  'HOME': PlaceholderPage,
  // [1100 자산 현황]
  '1101': AccountSummaryPage,
  '1102': TotalBalancePage,
  '1103': ProfitTrendPage,
  '1104': ExecutionHistoryPage,
  // [1200 시장 분석]
  '1201': StockDetailPage,
  '1202': PlaceholderPage,
  '1203': MyStockPage,
  '1204': PlaceholderPage,
  // [1300 주문 센터]
  '1301': PlaceholderPage,
  '1302': PlaceholderPage,
  // [2000 KIS]
  '2101': KisAccountPage,
  '2102': PlaceholderPage,
  '2103': PlaceholderPage,
  '2104': PlaceholderPage,
  // [3000 LS증권]
  '3101': LsAccountPage,
  '3102': PlaceholderPage,
  '3103': PlaceholderPage,
  // [4000 키움증권]
  '4101': KiwoomAccountPage,
  '4102': PlaceholderPage,
  // [8100 투자 기록]
  '8101': StkDiaryList,
  // [8200 시스템 엔진]
  '8201': PlaceholderPage,
  '8202': SchedulerPage,
  // [9100 시스템 설정]
  '9101': SettingsPage,
  '9102': LogViewPage,
}

export default registry
