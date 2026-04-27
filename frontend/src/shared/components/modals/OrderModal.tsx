import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog'
import { Input } from '@/shared/components/ui/input'
import { Button } from '@/shared/components/ui/button'
import { Label } from '@/shared/components/ui/label'
import {
  ToggleGroup,
  ToggleGroupItem,
} from '@/shared/components/ui/toggle-group'
import { useModalStore } from '@/store/modalStore'
import { getMarketStatus, sendOrder } from '@/services/stockService'
import { useQuery } from '@tanstack/react-query'
import { Loader2, AlertCircle, CheckCircle2, XIcon } from 'lucide-react'

const orderSchema = z.object({
  market: z.enum(['KRX', 'NXT']),
  pdno: z.string().min(1, '종목번호를 입력해주세요'),
  pdnm: z.string().min(1, '종목명을 입력해주세요'),
  qty: z.coerce.number().min(1, '수량을 입력해주세요'),
  price: z.coerce.number().min(0, '가격을 입력해주세요 (0은 시장가)'),
})

type OrderFormValues = z.infer<typeof orderSchema>

export default function OrderModal() {
  const { isOrderModalOpen, closeOrderModal, orderInitialData } = useModalStore()
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ text: string; type: 'info' | 'error' | 'success' } | null>(null)
  const [broker, setBroker] = useState<'kis' | 'kiwoom' | 'ls'>('kis')

  const { data: marketStatus, refetch: refetchMarketStatus } = useQuery({
    queryKey: ['marketStatus'],
    queryFn: getMarketStatus,
    enabled: isOrderModalOpen,
    refetchInterval: 1000 * 30, // 30초마다 갱신
  })

  const form = useForm<OrderFormValues>({
    resolver: zodResolver(orderSchema),
    defaultValues: {
      market: 'KRX',
      pdno: '',
      pdnm: '',
      qty: 1,
      price: 0,
    },
  })

  useEffect(() => {
    if (isOrderModalOpen && orderInitialData) {
      form.reset({
        market: marketStatus?.trade_market === 'NXT' ? 'NXT' : 'KRX',
        pdno: orderInitialData.stk_cd,
        pdnm: orderInitialData.stk_nm,
        qty: orderInitialData.qty || 1,
        price: orderInitialData.price || 0,
      })
    }
  }, [isOrderModalOpen, orderInitialData, form, marketStatus])

  const showMessage = (text: string, type: 'info' | 'error' | 'success') => {
    setMessage({ text, type })
    if (type !== 'error') {
      setTimeout(() => setMessage(null), 3000)
    }
  }

  const onSubmit = async (values: OrderFormValues, type: 'buy' | 'sell') => {
    setLoading(true)
    setMessage(null)
    
    try {
      let api_id = ''
      let payload: any = {}

      if (broker === 'kis') {
        api_id = type === 'buy' ? 'TTTC0012U' : 'TTTC0011U'
        payload = {
          CANO: '', // 백엔드에서 설정됨
          ACNT_PRDT_CD: '', // 백엔드에서 설정됨
          PDNO: values.pdno,
          ORD_DVSN: values.price === 0 ? '01' : '00', // 01: 시장가, 00: 지정가
          ORD_QTY: values.qty.toString(),
          ORD_UNPR: values.price.toString(),
          EXCG_ID_DVSN_CD: values.market,
        }
      } else if (broker === 'kiwoom') {
        api_id = type === 'buy' ? 'kt10000' : 'kt10001'
        payload = {
          dmst_stex_tp: values.market,
          stk_cd: values.pdno,
          ord_qty: values.qty.toString(),
          ord_uv: values.price.toString(),
          trde_tp: values.price === 0 ? '3' : '0', // 키움: 0:보통, 3:시장가
        }
      } else if (broker === 'ls') {
        api_id = 'CSPAT00601'
        payload = {
          IsuNo: values.pdno,
          OrdQty: values.qty,
          OrdPrc: values.price,
          BnsTpCode: type === 'buy' ? '2' : '1', // 1:매도, 2:매수
          OrdprcPtnCode: values.price === 0 ? '03' : '00', // 00:지정가, 03:시장가
          MgntrnCode: '000',
          LoanDt: '',
          OrdCndiTpCode: '0',
          MbrNo: values.market,
        }
      }

      const res = await sendOrder({
        broker,
        api_id,
        payload
      })

      if (res.success) {
        showMessage(`${type === 'buy' ? '매수' : '매도'} 주문이 성공적으로 전송되었습니다.`, 'success')
      } else {
        showMessage(res.error_message || '주문 실패', 'error')
      }
    } catch (error: any) {
      showMessage('주문 중 오류 발생: ' + error.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  const isMarketClosed = marketStatus?.is_open === false || marketStatus?.trade_market === null

  return (
    <Dialog open={isOrderModalOpen} onOpenChange={(open) => !open && closeOrderModal()}>
      <DialogContent 
        className="fixed right-0 top-0 h-full w-[400px] rounded-none border-l p-0 sm:max-w-none shadow-2xl 
                   !translate-x-0 !translate-y-0 !top-0 !left-auto
                   data-[state=open]:animate-in data-[state=closed]:animate-out 
                   data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right 
                   !zoom-in-100 !zoom-out-100
                   duration-300 ease-in-out"
        showCloseButton={false}
      >
        <div className="flex flex-col h-full bg-white">
          <DialogHeader className="p-6 pb-2 border-b shrink-0 flex flex-row items-center justify-between">
            <DialogTitle className="text-xl font-bold text-slate-800">주식 주문</DialogTitle>
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-8 w-8 rounded-full" 
              onClick={closeOrderModal}
            >
              <XIcon className="h-5 w-5" />
            </Button>
          </DialogHeader>

          <div className="p-6 flex flex-col flex-1 overflow-y-auto">
            {/* 증권사 선택 */}
            <div className="mb-6 shrink-0">
              <Label className="mb-2 block">증권사</Label>
              <ToggleGroup type="single" value={broker} onValueChange={(v) => v && setBroker(v as any)} className="justify-start">
                <ToggleGroupItem value="kis" className="px-4">KIS</ToggleGroupItem>
                <ToggleGroupItem value="kiwoom" className="px-4">키움</ToggleGroupItem>
                <ToggleGroupItem value="ls" className="px-4">LS</ToggleGroupItem>
              </ToggleGroup>
            </div>

            <form className="space-y-6">
              {/* 시장 선택 */}
              <div className="space-y-2">
                <Label>시장</Label>
                <ToggleGroup 
                  type="single" 
                  value={form.watch('market')} 
                  onValueChange={(v) => v && form.setValue('market', v as any)}
                  className="justify-start"
                >
                  <ToggleGroupItem 
                    value="KRX" 
                    disabled={!marketStatus?.is_krx_time}
                    className="px-4 data-[state=on]:bg-red-100 data-[state=on]:text-red-700"
                  >
                    KRX
                  </ToggleGroupItem>
                  <ToggleGroupItem 
                    value="NXT" 
                    disabled={!marketStatus?.is_nxt_time}
                    className="px-4 data-[state=on]:bg-blue-100 data-[state=on]:text-blue-700"
                  >
                    NXT
                  </ToggleGroupItem>
                </ToggleGroup>
                {isMarketClosed && (
                  <p className="text-xs text-destructive flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    현재 시장 운영 시간이 아닙니다.
                  </p>
                )}
              </div>

              {/* 종목 정보 */}
              <div className="grid grid-cols-3 gap-4">
                <div className="col-span-1">
                  <Label htmlFor="pdno">종목번호</Label>
                  <Input id="pdno" {...form.register('pdno')} readOnly className="bg-muted" />
                </div>
                <div className="col-span-2">
                  <Label htmlFor="pdnm">종목명</Label>
                  <Input id="pdnm" {...form.register('pdnm')} readOnly className="bg-muted" />
                </div>
              </div>

              {/* 수량/가격 */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="qty">수량</Label>
                  <Input id="qty" type="number" {...form.register('qty')} />
                  {form.formState.errors.qty && (
                    <p className="text-xs text-destructive">{form.formState.errors.qty.message}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="price">
                    지정가 <span className="text-[10px] text-muted-foreground font-normal">(0:시장가)</span>
                  </Label>
                  <Input id="price" type="number" {...form.register('price')} />
                  {form.formState.errors.price && (
                    <p className="text-xs text-destructive">{form.formState.errors.price.message}</p>
                  )}
                </div>
              </div>

              {/* 메시지 영역 */}
              {message && (
                <div className={`flex items-start gap-2 p-3 rounded-md text-sm ${
                  message.type === 'success' ? 'bg-green-500/10 text-green-600' : 
                  message.type === 'error' ? 'bg-destructive/10 text-destructive' : 'bg-blue-500/10 text-blue-600'
                }`}>
                  {message.type === 'success' ? <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" /> : <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />}
                  <span>{message.text}</span>
                </div>
              )}

              {/* 매수/매도 버튼 */}
              <div className="flex gap-4 pt-4">
                <Button 
                  type="button" 
                  className="flex-1 h-12 text-lg font-bold bg-red-600 hover:bg-red-700 text-white"
                  disabled={loading || isMarketClosed}
                  onClick={form.handleSubmit((v) => onSubmit(v, 'buy'))}
                >
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : '매수'}
                </Button>
                <Button 
                  type="button" 
                  className="flex-1 h-12 text-lg font-bold bg-blue-600 hover:bg-blue-700 text-white"
                  disabled={loading || isMarketClosed}
                  onClick={form.handleSubmit((v) => onSubmit(v, 'sell'))}
                >
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : '매도'}
                </Button>
              </div>
              
              <Button 
                type="button" 
                variant="outline" 
                className="w-full"
                onClick={() => form.reset({
                  ...form.getValues(),
                  qty: 1,
                  price: 0
                })}
              >
                초기화
              </Button>
            </form>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
