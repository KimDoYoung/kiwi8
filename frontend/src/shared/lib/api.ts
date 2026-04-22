import axios from 'axios'
import { useAuthStore } from '@/store/authStore'
import { setStatusMessage } from '@/store/statusStore'

const api = axios.create({
  baseURL: '/kiwi8',
  withCredentials: true,
})

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config
    
    // 401 오류이고 아직 재시도하지 않은 요청인 경우
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true
      
      try {
        // 1. 토큰 갱신 시도 (Refresh Token은 쿠키를 통해 자동 전송됨)
        await axios.post('/kiwi8/api/auth/refresh', {}, { withCredentials: true })
        
        // 2. 갱신 성공 시 원래 요청 재시도
        return api(originalRequest)
      } catch (refreshError) {
        // 3. 갱신 실패 (Refresh Token 만료 등) 시 세션 만료 처리
        useAuthStore.getState().expireSession()
        setStatusMessage('세션이 만료되었습니다. 다시 로그인해 주세요.', 'error')
        return Promise.reject(refreshError)
      }
    }
    
    return Promise.reject(error)
  }
)

export default api
