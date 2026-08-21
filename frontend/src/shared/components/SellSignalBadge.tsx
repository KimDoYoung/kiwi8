interface SellSignalBadgeProps {
    recommend?: boolean
}

export function SellSignalBadge({ recommend }: SellSignalBadgeProps) {
    if (recommend) {
        return (
            <span className="inline-flex w-[68px] items-center justify-center rounded-md border px-2 py-1 text-xs font-semibold leading-none bg-blue-100 text-blue-800 border-blue-200">
                매도
            </span>
        )
    }
    return (
        <span className="inline-flex w-[68px] items-center justify-center rounded-md border px-2 py-1 text-xs font-semibold leading-none bg-gray-100 text-gray-500 border-gray-200">
            보유
        </span>
    )
}
