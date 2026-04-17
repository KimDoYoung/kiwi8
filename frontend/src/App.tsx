import { useAuthStore } from '@/store/authStore'
import LoginPage from '@/pages/LoginPage'
import MainLayout from '@/layout/MainLayout'

export default function App() {
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn)
  return isLoggedIn ? <MainLayout /> : <LoginPage />
}
