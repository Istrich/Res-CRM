export const MONTHS = ['Янв','Фев','Мар','Апр','Май','Июн','Июл','Авг','Сен','Окт','Ноя','Дек']

export const fmt = (n) => {
  if (n == null || n === '') return '—'
  return Number(n).toLocaleString('ru-RU', { maximumFractionDigits: 0 })
}

export const fmtDate = (d) => {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('ru-RU')
}

export const statusLabel = (s) => ({
  ok: 'В норме',
  warning: 'Риск',
  overrun: 'Перерасход',
}[s] || s)

export const statusColor = (s) => ({
  ok: '#22c55e',
  warning: '#f59e0b',
  overrun: '#ef4444',
}[s] || '#888')

export const downloadBlob = (blob, filename) => {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export const clamp = (val, min, max) => Math.min(Math.max(val, min), max)
