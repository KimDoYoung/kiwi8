import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog'
import { Input } from '@/shared/components/ui/input'
import { Button } from '@/shared/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select'
import { Search, Plus, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react'
import { useModalStore } from '@/store/modalStore'
import api from '@/lib/api'

interface StockResult {
  stk_cd: string
  stk_nm: string
  market_name: string
}

export default function StockFindModal() {
  const { isStockFindModalOpen, closeStockFindModal } = useModalStore()
  const [keyword, setKeyword] = useState('')
  const [limit, setLimit] = useState('20')
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<StockResult[]>([])
  const [message, setMessage] = useState<{ text: string; type: 'info' | 'error' | 'success' } | null>(null)

  // 모달 닫힐 때 초기화
  useEffect(() => {
    if (!isStockFindModalOpen) {
      setKeyword('')
      setResults([])
      setMessage(null)
    }
  }, [isStockFindModalOpen])

  const showMessage = (text: string, type: 'info' | 'error' | 'success') => {
    setMessage({ text, type })
    setTimeout(() => setMessage(null), 3000)
  }

  const handleSearch = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!keyword.trim()) return

    setLoading(true)
    setMessage(null)
    try {
      const res = await api.post('/api/v1/stock/find', {
        api_id: 'stock_find',
        payload: {
          keyword: keyword.trim(),
          limit: parseInt(limit),
        },
      })

      if (res.data && res.data.success) {
        const found = res.data.data?.results || []
        setResults(found)
        if (found.length === 0) {
          showMessage(`'${keyword}' 검색 결과가 없습니다.`, 'info')
        }
      } else {
        showMessage(res.data?.error_message || '검색 중 오류가 발생했습니다.', 'error')
      }
    } catch (error: any) {
      showMessage('검색 중 오류 발생: ' + error.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleAddToMyStock = async (item: StockResult) => {
    try {
      const res = await api.put(`/api/v1/mystock/${item.stk_cd}`)
      if (res.data && res.data.success) {
        showMessage(`'${item.stk_nm}' 종목이 My Stock에 추가되었습니다.`, 'success')
        // 전역 이벤트 발생 (My Stock 리스트 갱신용)
        window.dispatchEvent(new CustomEvent('mystock-updated'))
      } else {
        showMessage(res.data?.error_message || '추가 실패', 'error')
      }
    } catch (error: any) {
      showMessage('추가 중 오류 발생: ' + error.message, 'error')
    }
  }

  return (
    <Dialog open={isStockFindModalOpen} onOpenChange={(open) => !open && closeStockFindModal()}>
      <DialogContent className="sm:max-w-[600px] max-h-[80vh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="p-6 pb-2 border-b">
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Search className="w-5 h-5 text-primary" />
            종목 찾기
          </DialogTitle>
        </DialogHeader>

        <div className="flex-grow flex flex-col p-6 space-y-4 overflow-hidden">
          {/* 검색 영역 */}
          <form onSubmit={handleSearch} className="flex gap-2">
            <div className="flex-grow">
              <Input
                placeholder="종목명/코드 입력 (예: 삼성전자)"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                autoFocus
              />
            </div>
            <div className="w-24">
              <Select value={limit} onValueChange={setLimit}>
                <SelectTrigger>
                  <SelectValue placeholder="개수" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10개</SelectItem>
                  <SelectItem value="20">20개</SelectItem>
                  <SelectItem value="50">50개</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" disabled={loading || !keyword.trim()}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4 mr-1" />}
              검색
            </Button>
          </form>

          {/* 메시지 영역 */}
          {message && (
            <div className={`flex items-center gap-2 p-2 rounded-md text-sm animate-in fade-in slide-in-from-top-1 duration-200 ${
              message.type === 'success' ? 'bg-green-500/10 text-green-600' : 
              message.type === 'error' ? 'bg-destructive/10 text-destructive' : 'bg-blue-500/10 text-blue-600'
            }`}>
              {message.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : 
               message.type === 'error' ? <AlertCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
              <span>{message.text}</span>
            </div>
          )}

          {/* 결과 테이블 */}
          <div className="flex-grow overflow-auto border rounded-md">
            <table className="w-full text-sm">
              <thead className="bg-muted sticky top-0">
                <tr>
                  <th className="p-2 text-left font-medium">종목코드</th>
                  <th className="p-2 text-left font-medium">종목명</th>
                  <th className="p-2 text-left font-medium">시장</th>
                  <th className="p-2 text-center font-medium">추가</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {results.map((item) => (
                  <tr key={item.stk_cd} className="hover:bg-muted/50 transition-colors">
                    <td className="p-2 font-mono font-bold">{item.stk_cd}</td>
                    <td className="p-2">{item.stk_nm}</td>
                    <td className="p-2">
                      <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-medium">
                        {item.market_name}
                      </span>
                    </td>
                    <td className="p-2 text-center">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-green-600 hover:text-green-700 hover:bg-green-50"
                        onClick={() => handleAddToMyStock(item)}
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
                {!loading && results.length === 0 && (
                  <tr>
                    <td colSpan={4} className="p-8 text-center text-muted-foreground">
                      {keyword ? '검색 결과가 없습니다.' : '검색어를 입력하세요.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
