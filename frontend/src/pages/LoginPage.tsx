import { useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/store/authStore'
import api from '@/services/api'

export default function LoginPage() {
  const queryClient = useQueryClient()
  const login = useAuthStore((s) => s.login)
  const [userId, setUserId] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      // 백엔드가 Form 데이터 수신 (userId, password)
      const form = new URLSearchParams()
      form.append('userId', userId)
      form.append('password', password)
      const res = await api.post('/login', form)
      if (res.data?.user_id) {
        // 로그인 성공 시 캐시 무효화 (메뉴 등 다시 불러오기)
        await queryClient.invalidateQueries()
        login(res.data.user_id)
      } else {
        setError('로그인 실패')
      }
    } catch (err: any) {
      const msg = err.response?.data?.detail ?? '서버에 연결할 수 없습니다.'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="bg-white rounded-xl shadow-lg p-10 w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-green-600 tracking-tight">kiwi8</h1>
          <p className="text-sm text-gray-400 mt-1">주식 자산관리 시스템</p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">아이디</label>
            <input
              type="text"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
              placeholder="아이디를 입력하세요"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">비밀번호</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
              placeholder="비밀번호를 입력하세요"
              required
            />
          </div>

          {error && (
            <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="mt-2 bg-green-500 hover:bg-green-600 disabled:bg-gray-300 text-white font-semibold rounded-lg py-2 text-sm transition-colors"
          >
            {loading ? '로그인 중...' : '로그인'}
          </button>
        </form>
      </div>
    </div>
  )
}
