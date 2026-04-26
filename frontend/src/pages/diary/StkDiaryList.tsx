import { useState, useEffect, useCallback, useRef } from 'react'
import { AgGridReact } from 'ag-grid-react'
import type { ColDef, GridReadyEvent } from 'ag-grid-community'
import { AllCommunityModule, ModuleRegistry } from 'ag-grid-community'
import { 
  Search, 
  Plus, 
  Edit2, 
  Trash2, 
  Calendar, 
  RefreshCw,
  FileText,
  SearchCode,
  BookOpen
} from 'lucide-react'
import { format, subDays } from 'date-fns'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Card, CardContent } from '@/shared/components/ui/card'
import { useModalStore } from '@/store/modalStore'
import api from '@/shared/lib/api'

ModuleRegistry.registerModules([AllCommunityModule])

interface DiaryEntry {
  id: number
  ymd: string
  stk_cd: string | null
  note: string
  created_at: string
  updated_at: string
}

export default function StkDiaryList() {
  const { openDiaryEditModal } = useModalStore()
  
  // 검색 필터 상태
  const [startDate, setStartDate] = useState(format(subDays(new Date(), 30), 'yyyy-MM-dd'))
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [stkCd, setStkCd] = useState('')
  const [keyword, setKeyword] = useState('')
  
  const [rowData, setRowData] = useState<DiaryEntry[]>([])
  const [loading, setLoading] = useState(false)
  const gridRef = useRef<AgGridReact>(null)

  const fetchDiaries = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.post('/api/v1/diary/list', {
        api_id: 'diary_list',
        payload: {
          start_ymd: startDate.replace(/-/g, ''),
          end_ymd: endDate.replace(/-/g, ''),
          stk_cd: stkCd || null,
          note_like: keyword || null,
          page: 1,
          limit: 1000 // 충분히 크게 가져옴
        }
      })
      
      if (res.data && res.data.success) {
        setRowData(res.data.data.list || [])
      }
    } catch (error) {
      console.error('Failed to fetch diaries:', error)
    } finally {
      setLoading(false)
    }
  }, [startDate, endDate, stkCd, keyword])

  useEffect(() => {
    fetchDiaries()
    
    // 일지 업데이트 이벤트 리스너
    const handleUpdate = () => fetchDiaries()
    window.addEventListener('diary-updated', handleUpdate)
    return () => window.removeEventListener('diary-updated', handleUpdate)
  }, [fetchDiaries])

  const handleDelete = async (id: number) => {
    if (!window.confirm('정말 삭제하시겠습니까?')) return
    
    try {
      const res = await api.delete(`/api/v1/diary/${id}/`)
      if (res.data && res.data.success) {
        fetchDiaries()
      } else {
        alert('삭제 실패: ' + (res.data?.error_message || '알 수 없는 오류'))
      }
    } catch (error: any) {
      alert('삭제 중 오류 발생: ' + error.message)
    }
  }

  const columnDefs: ColDef[] = [
    { 
      headerName: '날짜', 
      field: 'ymd', 
      width: 120,
      valueFormatter: (params) => {
        if (!params.value) return ''
        return params.value.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3')
      },
      sort: 'desc'
    },
    { 
      headerName: '종목코드', 
      field: 'stk_cd', 
      width: 100,
      cellStyle: { textAlign: 'center' },
      valueFormatter: (params) => params.value || '-'
    },
    { 
      headerName: '일지 내용', 
      field: 'note', 
      flex: 1,
      autoHeight: true,
      wrapText: true,
      cellStyle: { padding: '8px', lineHeight: '1.5' }
    },
    { 
      headerName: '작성일시', 
      field: 'created_at', 
      width: 160,
      valueFormatter: (params) => params.value?.substring(0, 16) || '-'
    },
    {
      headerName: '관리',
      width: 100,
      pinned: 'right',
      cellRenderer: (params: any) => (
        <div className="flex items-center gap-1 h-full">
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-8 w-8 text-blue-600"
            onClick={() => openDiaryEditModal(params.data)}
          >
            <Edit2 className="h-4 w-4" />
          </Button>
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-8 w-8 text-destructive"
            onClick={() => handleDelete(params.data.id)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      )
    }
  ]

  const onGridReady = (params: GridReadyEvent) => {
    params.api.sizeColumnsToFit()
  }

  return (
    <div className="p-4 space-y-4 h-full flex flex-col overflow-hidden">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-green-100 rounded-lg">
            <BookOpen className="w-5 h-5 text-green-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold">매매 일지</h1>
            <p className="text-xs text-muted-foreground">나만의 투자 기록과 시장 분석</p>
          </div>
        </div>
        <Button onClick={() => openDiaryEditModal()}>
          <Plus className="w-4 h-4 mr-2" />
          새 일지 작성
        </Button>
      </div>

      <Card className="shrink-0">
        <CardContent className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase text-muted-foreground">시작일</label>
              <div className="relative">
                <Calendar className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input 
                  type="date" 
                  value={startDate} 
                  onChange={(e) => setStartDate(e.target.value)}
                  className="pl-9 h-9"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase text-muted-foreground">종료일</label>
              <div className="relative">
                <Calendar className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input 
                  type="date" 
                  value={endDate} 
                  onChange={(e) => setEndDate(e.target.value)}
                  className="pl-9 h-9"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase text-muted-foreground">종목코드</label>
              <div className="relative">
                <SearchCode className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input 
                  placeholder="코드 6자리" 
                  value={stkCd} 
                  onChange={(e) => setStkCd(e.target.value)}
                  className="pl-9 h-9 font-mono"
                  maxLength={6}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase text-muted-foreground">내용 검색</label>
              <div className="relative">
                <FileText className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input 
                  placeholder="검색어 입력" 
                  value={keyword} 
                  onChange={(e) => setKeyword(e.target.value)}
                  className="pl-9 h-9"
                />
              </div>
            </div>
            <Button onClick={fetchDiaries} disabled={loading} className="h-9">
              {loading ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : <Search className="w-4 h-4 mr-2" />}
              조회
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="flex-1 min-h-0 border rounded-lg bg-white overflow-hidden ag-theme-alpine">
        <AgGridReact
          ref={gridRef}
          rowData={rowData}
          columnDefs={columnDefs}
          onGridReady={onGridReady}
          rowHeight={60}
          animateRows={true}
          localeText={{ noRowsToShow: '작성된 일지가 없습니다.' }}
        />
      </div>
    </div>
  )
}
