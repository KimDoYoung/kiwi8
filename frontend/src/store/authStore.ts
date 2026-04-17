import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface AuthState {
  isLoggedIn: boolean
  username: string
  login: (username: string) => void
  logout: () => void
  expireSession: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      isLoggedIn: false,
      username: '',
      login: (username) => set({ isLoggedIn: true, username }),
      logout: () => set({ isLoggedIn: false, username: '' }),
      expireSession: () => set({ isLoggedIn: false }), // username은 유지
    }),
    { name: 'kiwi8-auth' }
  )
)
