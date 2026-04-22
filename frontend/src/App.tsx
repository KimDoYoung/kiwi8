import { useAuthStore } from '@/store/authStore'
import LoginPage from '@/pages/auth/LoginPage'
import MainLayout from '@/layout/MainLayout'

export default function App() {
  const { isLoggedIn, username } = useAuthStore()

  // 한 번도 로그인한 적이 없거나 명시적으로 로그아웃한 경우 (username이 없음)
  if (!isLoggedIn && !username) {
    return <LoginPage />
  }

  // 로그인 상태거나, 세션만 만료된 경우 (username은 있음)
  return (
    <div className="relative h-screen w-full overflow-hidden">
      {/* 배경으로 유지되는 메인 레이아웃 (데이터 유실 방지) */}
      <MainLayout />

      {/* 세션 만료 시에만 나타나는 흐릿한 덮개와 로그인 모달 */}
      {!isLoggedIn && (
        <div className="absolute inset-0 z-[9999] bg-black/60 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-300">
          <LoginPage isModal />
        </div>
      )}
    </div>
  )
}

