const STATUS_STYLE: Record<string, string> = {
    '진행':     'bg-green-100 text-green-800 border border-green-300',
    '상장':     'bg-sky-100   text-sky-800   border border-sky-300',
    '공모철회': 'bg-gray-100  text-gray-600  border border-gray-300',
}

export function StatusBadge({ status }: { status: string }) {
    const cls = STATUS_STYLE[status] ?? 'bg-gray-100 text-gray-600 border border-gray-300'
    return <span className={`px-1.5 py-0.5 rounded text-[11px] font-medium ${cls}`}>{status}</span>
}
