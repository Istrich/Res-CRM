import { create } from 'zustand'

const now = new Date()
export const useYearStore = create((set) => ({
  year: now.getFullYear(),
  month: now.getMonth() + 1, // 1..12
  setYear: (year) => set({ year }),
  setMonth: (month) => set({ month }),
}))
