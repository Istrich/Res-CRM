import { create } from 'zustand'

export const useAuthStore = create((set) => ({
  // Only track whether user is authenticated — the actual token lives in HttpOnly cookie.
  // We persist this in sessionStorage so page refresh keeps the user logged in
  // until the cookie expires (the /auth/me call in Layout will re-verify).
  isAuthenticated: sessionStorage.getItem('isAuthenticated') === 'true',
  user: null,

  setAuthenticated: (value) => {
    sessionStorage.setItem('isAuthenticated', String(value))
    set({ isAuthenticated: value })
  },

  setUser: (user) => set({ user }),

  logout: () => {
    sessionStorage.removeItem('isAuthenticated')
    set({ isAuthenticated: false, user: null })
  },
}))
