const MARKET_STYLE: Record<string, string> = {
    '코스닥':   'bg-blue-50  text-blue-700',
    '유가증권': 'bg-red-50   text-red-700',
    '코넥스':   'bg-gray-50  text-gray-600',
}

export function MarketBadge({ market }: { market: string }) {
    const cls = MARKET_STYLE[market] ?? 'bg-gray-50 text-gray-600'
    return <span className={`px-1 py-0.5 rounded text-[10px] font-semibold ${cls}`}>{market}</span>
}
