import { useEffect, useRef, useState } from 'react'
import { llmAgent, type LlmInfo } from '@/services/LlmAgent'

interface Message {
    role: 'user' | 'assistant'
    content: string
}

export default function LlmTalkPage() {
    const [llmInfo, setLlmInfo] = useState<LlmInfo | null>(null)
    const [messages, setMessages] = useState<Message[]>([])
    const [input, setInput] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const bottomRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        llmAgent.init()
            .then(setLlmInfo)
            .catch((e) => setError(String(e)))
    }, [])

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages])

    const send = async (text: string) => {
        if (!text.trim() || loading) return
        setError(null)
        setInput('')
        setMessages(prev => [...prev, { role: 'user', content: text }])
        setLoading(true)
        try {
            const reply = await llmAgent.ask(text)
            setMessages(prev => [...prev, { role: 'assistant', content: reply }])
        } catch (e) {
            setError(String(e))
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="flex flex-col h-full text-sm">
            {/* 헤더 */}
            <div className="px-4 py-2 border-b border-gray-200 bg-gray-50 shrink-0 flex items-center gap-4">
                <span className="font-bold text-gray-700">LLM 대화</span>
                <span className="text-gray-400 font-mono">[8201]</span>
                {llmInfo && (
                    <span className="text-xs text-gray-500">
                        {llmInfo.llm_model} @ {llmInfo.llm_url}
                    </span>
                )}
                {!llmInfo && !error && (
                    <span className="text-xs text-gray-400">연결 중...</span>
                )}
                {error && (
                    <span className="text-xs text-red-500">{error}</span>
                )}
            </div>

            {/* 메시지 영역 */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
                {messages.length === 0 && (
                    <p className="text-gray-400 text-center mt-8">LLM에게 말을 걸어보세요.</p>
                )}
                {messages.map((msg, i) => (
                    <div
                        key={i}
                        className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                        <div
                            className={`max-w-[70%] rounded-lg px-3 py-2 whitespace-pre-wrap text-sm ${
                                msg.role === 'user'
                                    ? 'bg-blue-500 text-white'
                                    : 'bg-gray-100 text-gray-800 border border-gray-200'
                            }`}
                        >
                            {msg.content}
                        </div>
                    </div>
                ))}
                {loading && (
                    <div className="flex justify-start">
                        <div className="bg-gray-100 border border-gray-200 rounded-lg px-3 py-2 text-gray-400 text-sm">
                            생각 중...
                        </div>
                    </div>
                )}
                <div ref={bottomRef} />
            </div>

            {/* 빠른 버튼 */}
            <div className="px-4 pb-1 shrink-0 flex gap-2">
                {['안녕?', '지금 시장 분석해줘', '내 포트폴리오 조언해줘'].map(q => (
                    <button
                        key={q}
                        onClick={() => send(q)}
                        disabled={loading}
                        className="text-xs px-2 py-1 rounded border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-40"
                    >
                        {q}
                    </button>
                ))}
            </div>

            {/* 입력창 */}
            <div className="px-4 pb-3 pt-1 shrink-0 flex gap-2">
                <input
                    className="flex-1 border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
                    placeholder="메시지 입력..."
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send(input)}
                    disabled={loading}
                />
                <button
                    onClick={() => send(input)}
                    disabled={loading || !input.trim()}
                    className="px-4 py-2 bg-blue-500 text-white rounded text-sm hover:bg-blue-600 disabled:opacity-40"
                >
                    전송
                </button>
            </div>
        </div>
    )
}
