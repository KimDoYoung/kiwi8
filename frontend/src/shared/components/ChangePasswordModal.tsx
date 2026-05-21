import { useState } from 'react'
import { Lock, X, CheckCircle2, AlertCircle } from 'lucide-react'
import api from '@/lib/api'

interface Props {
  username: string
  onClose: () => void
}

export default function ChangePasswordModal({ username, onClose }: Props) {
  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [status, setStatus] = useState<{ text: string; type: 'success' | 'error' } | null>(null)

  const handleSubmit = async () => {
    if (!currentPw || !newPw || !confirmPw) {
      setStatus({ text: '모든 항목을 입력해주세요.', type: 'error' })
      return
    }
    if (newPw !== confirmPw) {
      setStatus({ text: '새 비밀번호가 일치하지 않습니다.', type: 'error' })
      return
    }
    setIsLoading(true)
    setStatus(null)
    try {
      const res = await api.post('/api/v1/settings/change-password', {
        current_password: currentPw,
        new_password: newPw,
      })
      if (res.data?.success) {
        setStatus({ text: '비밀번호가 변경되었습니다.', type: 'success' })
        setCurrentPw('')
        setNewPw('')
        setConfirmPw('')
        setTimeout(onClose, 1200)
      } else {
        setStatus({ text: res.data?.error_message || '비밀번호 변경 실패', type: 'error' })
      }
    } catch (e: unknown) {
      setStatus({ text: '오류 발생: ' + (e as Error).message, type: 'error' })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl w-80 p-6 flex flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Lock size={16} className="text-primary" />
            <span className="font-bold text-gray-800">비밀번호 변경</span>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 text-gray-400">
            <X size={16} />
          </button>
        </div>

        <div className="text-xs text-gray-500 bg-gray-50 px-3 py-1.5 rounded">
          사용자: <span className="font-semibold text-gray-700">{username}</span>
        </div>

        <div className="flex flex-col gap-2">
          <input
            type="password"
            placeholder="현재 비밀번호"
            value={currentPw}
            onChange={(e) => setCurrentPw(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-primary/30"
            autoFocus
          />
          <input
            type="password"
            placeholder="새 비밀번호"
            value={newPw}
            onChange={(e) => setNewPw(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          <input
            type="password"
            placeholder="새 비밀번호 확인"
            value={confirmPw}
            onChange={(e) => setConfirmPw(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>

        {status && (
          <div className={`flex items-center gap-2 text-xs px-3 py-2 rounded-md ${
            status.type === 'success'
              ? 'bg-green-50 text-green-700'
              : 'bg-red-50 text-red-600'
          }`}>
            {status.type === 'success'
              ? <CheckCircle2 size={14} />
              : <AlertCircle size={14} />}
            {status.text}
          </div>
        )}

        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 py-2 text-sm border border-gray-200 rounded-md text-gray-600 hover:bg-gray-50 transition-colors"
          >
            취소
          </button>
          <button
            onClick={handleSubmit}
            disabled={isLoading}
            className="flex-1 py-2 text-sm bg-primary text-white rounded-md hover:bg-primary/90 disabled:opacity-50 transition-colors font-semibold"
          >
            {isLoading ? '변경 중...' : '변경'}
          </button>
        </div>
      </div>
    </div>
  )
}
