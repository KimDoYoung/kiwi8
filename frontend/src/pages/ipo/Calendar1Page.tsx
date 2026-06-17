import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { startOfWeek, endOfWeek, addDays, format, parse } from 'date-fns'
import api from '@/lib/api'
import { Button } from '@/shared/components/ui/button'

// ── 이벤트 타입별 스타일 ─────────────────────────────────────────
const EVENT_STYLE = {
    subscription:     { bg: 'bg-green-100',  text: 'text-green-800',  border: 'border-green-300',  label: '청약' },
    payment:          { bg: 'bg-orange-100', text: 'text-orange-800', border: 'border-orange-300', label: '납입' },
    refund:           { bg: 'bg-rose-100',   text: 'text-rose-800',   border: 'border-rose-300',   label: '환불' },
    listing:          { bg: 'bg-sky-100',    text: 'text-sky-800',    border: 'border-sky-300',    label: '상장' },
    demand_forecast:  { bg: 'bg-purple-100', text: 'text-purple-800', border: 'border-purple-300', label: '수요예측' },
} as const

type EventType = keyof typeof EVENT_STYLE

interface IpoEvent {
    ymd: string
    stock_name: string
    event_type: EventType
    track_id: string
}

interface CalendarResponse {
    data: IpoEvent[]
    holidays: Record<string, string>  // { '20260603': '선거일', ... }
}

interface CalendarDay {
    ymd: string
    day: number
    isToday: boolean
    isThisMonth: boolean
    isSunday: boolean
    isSaturday: boolean
    events: IpoEvent[]
}

// '일' 제거: '레메디' → '레메디', '레메디일' → '레메디'
function stripIlSuffix(name: string): string {
    return name.replace(/일$/, '')
}

function getStartEndYmd(year: number, month: number): [string, string] {
    const firstDate = new Date(year, month - 1, 1)
    const lastDate  = new Date(year, month, 0)
    const startDate = startOfWeek(firstDate, { weekStartsOn: 0 })
    const endDate   = endOfWeek(lastDate, { weekStartsOn: 0 })
    return [format(startDate, 'yyyyMMdd'), format(endDate, 'yyyyMMdd')]
}

async function fetchIpoCalendar(startYmd: string, endYmd: string): Promise<CalendarResponse> {
    const res = await api.get('/api/v1/ipo/calendar', { params: { start_ymd: startYmd, end_ymd: endYmd } })
    return { data: res.data?.data ?? [], holidays: res.data?.holidays ?? {} }
}

const todayYmd = format(new Date(), 'yyyyMMdd')

export default function Calendar1Page() {
    const today = new Date()
    const [currentYear, setCurrentYear]   = useState(today.getFullYear())
    const [currentMonth, setCurrentMonth] = useState(today.getMonth() + 1)
    const [showDemandForecast, setShowDemandForecast] = useState(false)

    const [startYmd, endYmd] = useMemo(
        () => getStartEndYmd(currentYear, currentMonth),
        [currentYear, currentMonth],
    )

    const { data: calData } = useQuery<CalendarResponse>({
        queryKey: ['ipo-calendar', startYmd, endYmd],
        queryFn: () => fetchIpoCalendar(startYmd, endYmd),
        staleTime: 1000 * 60 * 5,
    })
    const holidays = calData?.holidays ?? {}

    const eventMap = useMemo(() => {
        const map: Record<string, IpoEvent[]> = {}
        for (const ev of calData?.data ?? []) {
            if (!showDemandForecast && ev.event_type === 'demand_forecast') continue
            if (!map[ev.ymd]) map[ev.ymd] = []
            map[ev.ymd].push(ev)
        }
        return map
    }, [calData?.data, showDemandForecast])

    const days = useMemo<CalendarDay[]>(() => {
        const result: CalendarDay[] = []
        let cur = parse(startYmd, 'yyyyMMdd', new Date())
        const end = parse(endYmd, 'yyyyMMdd', new Date())
        const thisYm = `${currentYear}${String(currentMonth).padStart(2, '0')}`
        let idx = 0
        while (cur <= end) {
            const ymd = format(cur, 'yyyyMMdd')
            result.push({
                ymd,
                day: cur.getDate(),
                isToday: ymd === todayYmd,
                isThisMonth: ymd.startsWith(thisYm),
                isSunday: idx % 7 === 0,
                isSaturday: idx % 7 === 6,
                events: eventMap[ymd] ?? [],
            })
            cur = addDays(cur, 1)
            idx++
        }
        return result
    }, [startYmd, endYmd, currentYear, currentMonth, eventMap])

    function prevMonth() {
        if (currentMonth === 1) { setCurrentYear(y => y - 1); setCurrentMonth(12) }
        else setCurrentMonth(m => m - 1)
    }
    function nextMonth() {
        if (currentMonth === 12) { setCurrentYear(y => y + 1); setCurrentMonth(1) }
        else setCurrentMonth(m => m + 1)
    }
    function goToday() {
        const t = new Date()
        setCurrentYear(t.getFullYear())
        setCurrentMonth(t.getMonth() + 1)
    }

    return (
        <div className="flex flex-col h-full bg-gray-50">
            {/* 헤더 */}
            <div className="bg-gradient-to-r from-indigo-500 to-blue-500 px-4 py-3 text-white flex items-center justify-between flex-shrink-0">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" onClick={prevMonth}
                        className="text-white hover:bg-white/20 rounded-full h-8 w-8">
                        <ChevronLeft className="w-5 h-5" />
                    </Button>
                    <h1 className="text-xl font-bold min-w-[140px] text-center">
                        {currentYear}년 {currentMonth}월
                    </h1>
                    <Button variant="ghost" size="icon" onClick={nextMonth}
                        className="text-white hover:bg-white/20 rounded-full h-8 w-8">
                        <ChevronRight className="w-5 h-5" />
                    </Button>
                    <Button variant="secondary" size="sm" onClick={goToday}
                        className="bg-white/20 border-white/30 text-white hover:bg-white/40 px-3 h-7 text-sm font-bold">
                        오늘
                    </Button>
                </div>

                {/* 범례 */}
                <div className="flex items-center gap-2 flex-wrap text-xs">
                    {(Object.keys(EVENT_STYLE) as EventType[]).map(type => {
                        const s = EVENT_STYLE[type]
                        if (type === 'demand_forecast') {
                            return (
                                <label key={type}
                                    className={`flex items-center gap-1 px-2 py-0.5 rounded border font-medium cursor-pointer select-none
                                        ${showDemandForecast ? `${s.bg} ${s.text} ${s.border}` : 'bg-white/10 text-white/50 border-white/20'}`}>
                                    <input
                                        type="checkbox"
                                        checked={showDemandForecast}
                                        onChange={e => setShowDemandForecast(e.target.checked)}
                                        className="accent-purple-500 w-3 h-3"
                                    />
                                    {s.label}
                                </label>
                            )
                        }
                        return (
                            <span key={type}
                                className={`px-2 py-0.5 rounded border font-medium ${s.bg} ${s.text} ${s.border}`}>
                                {s.label}
                            </span>
                        )
                    })}
                </div>
            </div>

            {/* 요일 헤더 */}
            <div className="grid grid-cols-7 border-b border-gray-200 bg-gray-50 flex-shrink-0">
                {['일', '월', '화', '수', '목', '금', '토'].map((w, i) => (
                    <div key={w}
                        className={`py-2 text-center text-[15px] font-bold border-r border-gray-100 last:border-0
                            ${i === 0 ? 'text-red-500' : i === 6 ? 'text-blue-500' : 'text-gray-600'}`}>
                        {w}
                    </div>
                ))}
            </div>

            {/* 달력 그리드 */}
            <div className="flex-1 overflow-auto">
                <div className="grid grid-cols-7 gap-px bg-gray-200 border-x border-b border-gray-200 min-h-full">
                    {days.map(day => (
                        <div key={day.ymd}
                            className={`min-h-[110px] p-1.5
                                ${!day.isThisMonth ? 'bg-gray-100 text-gray-300' :
                                  day.isToday ? 'bg-yellow-50 bg-white' : 'bg-white'}`}>

                            {/* 날짜 숫자 + 공휴일명 */}
                            <div className="flex items-center gap-1 mb-1">
                                <div className={`text-[15px] font-bold w-7 h-7 flex items-center justify-center rounded-full flex-shrink-0
                                    ${day.isToday ? 'bg-indigo-600 text-white' :
                                      (day.isSunday || !!holidays[day.ymd]) ? 'text-red-500' :
                                      day.isSaturday ? 'text-blue-500' : 'text-gray-700'}`}>
                                    {day.day}
                                </div>
                                {holidays[day.ymd] && (
                                    <span className="text-[11px] text-red-500 font-medium truncate leading-tight">
                                        {holidays[day.ymd]}
                                    </span>
                                )}
                            </div>

                            {/* 이벤트 뱃지 */}
                            <div className="space-y-0.5">
                                {day.events.map((ev, idx) => {
                                    const s = EVENT_STYLE[ev.event_type]
                                    return (
                                        <a key={`${ev.track_id}-${ev.event_type}-${idx}`}
                                            href={`http://www.ipostock.co.kr/view_pg/view_01.asp?code=${ev.track_id}`}
                                            target="_blank" rel="noopener noreferrer"
                                            title={`${ev.stock_name} — ${s.label}`}
                                            className={`block text-xs font-medium px-1.5 py-0.5 rounded border truncate leading-tight cursor-pointer hover:brightness-95
                                                ${s.bg} ${s.text} ${s.border}`}>
                                            {stripIlSuffix(ev.stock_name)}
                                            <span className="ml-1 opacity-60 text-[11px]">({s.label})</span>
                                        </a>
                                    )
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}
