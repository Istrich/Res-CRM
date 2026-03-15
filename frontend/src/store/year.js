import { create } from 'zustand'

export const useYearStore = create((set) => ({
  year: new Date().getFullYear(),
  setYear: (year) => set({ year }),
}))
