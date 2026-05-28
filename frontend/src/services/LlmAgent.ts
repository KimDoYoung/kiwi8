import api from '@/lib/api'

export interface LlmInfo {
    llm_url: string
    llm_model: string
}

export interface LlmAgentStatus {
    initialized: boolean
    ollamaReachable: boolean
    llmUrl: string
    llmModel: string
    lastError: string | null
}

export class LlmAgent {
    private llmUrl = ''
    private llmModel = ''
    private initialized = false
    private lastError: string | null = null

    async init(): Promise<LlmInfo> {
        const { data } = await api.get<LlmInfo>('/api/v1/ai/llm-info')
        this.llmUrl = data.llm_url.replace(/\/$/, '')
        this.llmModel = data.llm_model
        this.initialized = true
        this.lastError = null
        return data
    }

    async checkOllama(): Promise<boolean> {
        if (!this.initialized) await this.init()
        try {
            const res = await fetch(`${this.llmUrl}/api/tags`)
            return res.ok
        } catch {
            return false
        }
    }

    async ask(
        userMessage: string,
        systemPrompt = '당신은 도움이 되는 한국어 AI 어시스턴트입니다.'
    ): Promise<string> {
        if (!this.initialized) await this.init()
        const res = await fetch(`${this.llmUrl}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: this.llmModel,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userMessage },
                ],
                stream: false,
            }),
        })
        if (!res.ok) {
            const msg = `Ollama error: ${res.status}`
            this.lastError = msg
            throw new Error(msg)
        }
        const data = await res.json()
        this.lastError = null
        return data.message.content as string
    }

    getStatus(): LlmAgentStatus {
        return {
            initialized: this.initialized,
            ollamaReachable: this.initialized && this.lastError === null,
            llmUrl: this.llmUrl,
            llmModel: this.llmModel,
            lastError: this.lastError,
        }
    }
}

export const llmAgent = new LlmAgent()
