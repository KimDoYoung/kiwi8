interface DetailRowProps {
    label: string
    value?: string
}

export function DetailRow({ label, value }: DetailRowProps) {
    if (!value) return null
    return (
        <div className="flex py-1.5 border-b border-gray-100 last:border-0 gap-2">
            <span className="text-xs text-gray-400 w-28 flex-shrink-0">{label}</span>
            <span className="text-xs font-medium text-gray-800 break-all">{value}</span>
        </div>
    )
}

interface DetailCardProps {
    title: string
    headerBg: string   // e.g. 'bg-indigo-500'
    bodyBg: string     // e.g. 'bg-indigo-50'
    children: React.ReactNode
}

export function DetailCard({ title, headerBg, bodyBg, children }: DetailCardProps) {
    return (
        <div className={`rounded-xl overflow-hidden shadow-sm border border-gray-100 ${bodyBg}`}>
            <div className={`px-3 py-2 text-white font-bold text-[11px] uppercase tracking-widest ${headerBg}`}>
                {title}
            </div>
            <div className="px-3 py-1">
                {children}
            </div>
        </div>
    )
}
