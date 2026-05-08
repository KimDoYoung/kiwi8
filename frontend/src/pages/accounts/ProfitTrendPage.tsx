import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AgGridReact } from 'ag-grid-react'
import type { ColDef } from 'ag-grid-community'
import { AllCommunityModule, ModuleRegistry } from 'ag-grid-community'
import api from '@/lib/api'
import Loading from '@/shared/components/Loading'
import LoadingFail from '@/shared/components/LoadingFail'
import { Button } from '@/shared/components/ui/button'
import { Search, Calendar as CalendarIcon } from 'lucide-react'
import { fmt, toNum } from '@/lib/utils'
import { DateRangePicker } from '@/shared/components/DateRangePicker'

ModuleRegistry.registerModules([AllCommunityModule])

async function fetchProfitTrend(startDate: string, endDate: string) {
  const res = await api.get(`/api/v1/trend/${startDate}/${endDate}/profit`)
  return res.data
}

export default function ProfitTrendPage() {
  const [startDate, setStartDate] = useState(() => {
    const d = new Date()
    d.setMonth(d.getMonth() - 1)
    return d.toISOString().split('T')[0]
  })
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0])

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['profitTrend', startDate, endDate],
    queryFn: () => fetchProfitTrend(startDate, endDate),
    enabled: false, // 처음에는 수동 조회
  })

  const handleSearch = () => {
    refetch()
  }

  const kiwoomData = data?.data?.kiwoom?.['일자별실현손익'] || []
  const kisData = data?.data?.kis?.['output1'] || []
  const lsData = data?.data?.ls?.['FOCCQ33600OutBlock3'] || []

  const defaultColDef = useMemo<ColDef>(() => ({
    sortable: true,
    resizable: true,
    flex: 1,
    minWidth: 100,
  }), [])

  const kiwoomCols = useMemo<ColDef[]>(() => [
    { field: '일자', headerName: '일자', minWidth: 120 },
    { field: '매수금액', headerName: '매수금액', type: 'numericColumn', valueFormatter: (p) => fmt(toNum(p.value)) },
    { field: '매도금액', headerName: '매도금액', type: 'numericColumn', valueFormatter: (p) => fmt(toNum(p.value)) },
    { field: '당일매도손익', headerName: '당일손익', type: 'numericColumn', cellStyle: (p) => ({ color: toNum(p.value) > 0 ? '#ef4444' : toNum(p.value) < 0 ? '#3b82f6' : 'inherit' }), valueFormatter: (p) => fmt(toNum(p.value)) },
    { field: '당일매매수수료', headerName: '수수료', type: 'numericColumn', valueFormatter: (p) => fmt(toNum(p.value)) },
    { field: '당일매매세금', headerName: '세금', type: 'numericColumn', valueFormatter: (p) => fmt(toNum(p.value)) },
  ], [])

  const kisCols = useMemo<ColDef[]>(() => [
    { field: '주식일자', headerName: '일자', minWidth: 120 },
    { field: '손익금액', headerName: '손익금액', type: 'numericColumn', cellStyle: (p) => ({ color: toNum(p.value) > 0 ? '#ef4444' : toNum(p.value) < 0 ? '#3b82f6' : 'inherit' }), valueFormatter: (p) => fmt(toNum(p.value)) },
    { field: '매도금액', headerName: '매도금액', type: 'numericColumn', valueFormatter: (p) => fmt(toNum(p.value)) },
    { field: '매수금액', headerName: '매수금액', type: 'numericColumn', valueFormatter: (p) => fmt(toNum(p.value)) },
    { field: '매매수수료', headerName: '수수료', type: 'numericColumn', valueFormatter: (p) => fmt(toNum(p.value)) },
    { field: '매매세금', headerName: '세금', type: 'numericColumn', valueFormatter: (p) => fmt(toNum(p.value)) },
  ], [])

  const lsCols = useMemo<ColDef[]>(() => [
    { field: '기준일', headerName: '일자', minWidth: 120 },
    { field: '평가손익금액', headerName: '손익금액', type: 'numericColumn', cellStyle: (p) => ({ color: toNum(p.value) > 0 ? '#ef4444' : toNum(p.value) < 0 ? '#3b82f6' : 'inherit' }), valueFormatter: (p) => fmt(toNum(p.value)) },
    { field: '기간수익률', headerName: '수익률(%)', type: 'numericColumn', valueFormatter: (p) => `${toNum(p.value).toFixed(2)}%` },
  ], [])

  return (
    <div className="flex flex-col h-full bg-slate-50 overflow-hidden">
      {/* 헤더 및 조회 조건 */}
      <div className="bg-white border-b border-slate-200 p-4 shrink-0 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-start gap-6">
          <div className="flex items-center gap-3">
            <div className="bg-blue-600 p-2 rounded-lg text-white shadow-blue-200 shadow-lg">
              <CalendarIcon size={20} />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-800 leading-tight">기간별 실현손익</h1>
              <p className="text-xs text-slate-500">[1103] 증권사별 실현손익 현황을 조회합니다.</p>
            </div>
          </div>

          <div className="flex items-center gap-2 bg-slate-50 p-1 rounded-lg border border-slate-200">
            <DateRangePicker
              layout="row"
              returnFormat="yyyy-MM-dd"
              startDate={startDate}
              endDate={endDate}
              onChange={(s, e) => { setStartDate(s); setEndDate(e) }}
              className="bg-transparent border-none"
            />
            <Button 
              onClick={handleSearch} 
              disabled={isLoading}
              className="h-8 bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-100"
            >
              {isLoading ? '조회중...' : (
                <>
                  <Search size={16} className="mr-1.5" />
                  조회
                </>
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* 메인 콘텐츠 영역 */}
      <div className="flex-1 overflow-auto p-4 space-y-6">
        {isLoading && <Loading message="증권사별 데이터를 통합 조회 중입니다..." />}
        {error && <LoadingFail message="데이터 조회 중 오류가 발생했습니다." />}
        
        {!data && !isLoading && (
          <div className="h-full flex flex-col items-center justify-center text-slate-400 bg-white rounded-xl border border-dashed border-slate-300 py-20">
            <Search size={48} className="mb-4 opacity-20" />
            <p className="text-lg font-medium">조회 기간을 선택한 후 조회 버튼을 눌러주세요.</p>
            <p className="text-sm">키움, 한국투자, LS증권의 데이터를 한 번에 가져옵니다.</p>
          </div>
        )}

        {data && (
          <div className="grid grid-cols-1 gap-6 min-h-0">
            {/* 한국투자증권 */}
            <div className={`flex flex-col bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden ${kisData.length > 0 ? 'h-[400px]' : ''}`}>
              <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-[#80624c]" />
                  <h2 className="font-semibold text-slate-700">한국투자증권</h2>
                </div>
                {kisData.length > 0 && <span className="text-xs text-slate-500 font-medium">{kisData.length}건</span>}
              </div>
              {kisData.length > 0 ? (
                <div className="flex-1 ag-theme-alpine">
                  <AgGridReact
                    rowData={kisData}
                    columnDefs={kisCols}
                    defaultColDef={defaultColDef}
                  />
                </div>
              ) : (
                <div className="py-2 px-4 text-red-400 bg-slate-50/20 italic text-xs">
                  해당 기간의 한국투자증권 실현손익 데이터가 없습니다.
                </div>
              )}
            </div>

            {/* LS증권 */}
            <div className={`flex flex-col bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden ${lsData.length > 0 ? 'h-[400px]' : ''}`}>
              <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-[#003378]" />
                  <h2 className="font-semibold text-slate-700">LS증권</h2>
                </div>
                {lsData.length > 0 && <span className="text-xs text-slate-500 font-medium">{lsData.length}건</span>}
              </div>
              {lsData.length > 0 ? (
                <div className="flex-1 ag-theme-alpine">
                  <AgGridReact
                    rowData={lsData}
                    columnDefs={lsCols}
                    defaultColDef={defaultColDef}
                  />
                </div>
              ) : (
                <div className="py-2 px-4 text-red-400 bg-slate-50/20 italic text-xs">
                  해당 기간의 LS증권 실현손익 데이터가 없습니다.
                </div>
              )}
            </div>

            {/* 키움증권 */}
            <div className={`flex flex-col bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden ${kiwoomData.length > 0 ? 'h-[400px]' : ''}`}>
              <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-[#e4007f]" />
                  <h2 className="font-semibold text-slate-700">키움증권</h2>
                </div>
                {kiwoomData.length > 0 && <span className="text-xs text-slate-500 font-medium">{kiwoomData.length}건</span>}
              </div>
              {kiwoomData.length > 0 ? (
                <div className="flex-1 ag-theme-alpine">
                  <AgGridReact
                    rowData={kiwoomData}
                    columnDefs={kiwoomCols}
                    defaultColDef={defaultColDef}
                  />
                </div>
              ) : (
                <div className="py-2 px-4 text-slate-400 bg-slate-50/20 italic text-xs">
                  해당 기간의 키움증권 실현손익 데이터가 없습니다.
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
