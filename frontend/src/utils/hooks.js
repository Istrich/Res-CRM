import { useState, useEffect } from 'react'

/**
 * Debounces a value: returns the latest value only after `delay` ms
 * have passed without changes. Use in queryKeys to avoid API spam.
 */
export function useDebounce(value, delay = 300) {
  const [debouncedValue, setDebouncedValue] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])

  return debouncedValue
}
