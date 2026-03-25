import { useState, useRef, useMemo, Fragment } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getStafferMatrix, upsertStafferExpense,
  uploadStafferInvoiceFile, deleteStafferInvoiceFile, stafferInvoiceFileDownloadUrl,
  upsertStafferMonthRate, deleteStafferMonthRate,
  prefillStafferPlan, getWorkingHours,
  updateStaffer, getProjects, getContractors,
  getStaffingBudgets,
} from '../../api'
import { useYearStore } from '../../store/year'

// ─── Constants ───────────────────────────────────────────────────────────────

const MONTHS_FULL = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
]

const WORK_STATUSES = ['Активен', 'Завершен', 'Планируется', 'Приостановлен']
const EXT_STATUSES = ['Нет', 'Продление', 'Запрос продления', 'На согласовании']
const INVOICE_STATUSES = [
  'Ожидаем выставления', 'Получен', 'Загружен файл', 'Не выставлен', 'Проверяется',
]

// Left fixed columns definition
const LEFT_COLS = [
  { key: 'order',      label: '№',          w: 36 },
  { key: 'full_name',  label: 'ФИО',         w: 158 },
  { key: 'contractor', label: 'Подрядчик',   w: 100 },
  { key: 'rating',     label: '★',           w: 52 },
  { key: 'role',       label: 'Роль',        w: 90 },
  { key: 'project',    label: 'Проект',      w: 90 },
  { key: 'tasks',      label: 'Задачи',      w: 100 },
  { key: 'start',      label: 'С',           w: 76 },
  { key: 'end',        label: 'По',          w: 76 },
  { key: 'dur',        label: 'Срок',        w: 44 },
  { key: 'status',     label: 'Статус',      w: 108 },
  { key: 'actions',    label: '',            w: 28 },
]

// Cumulative left offsets for sticky positioning
const LEFT_POS = LEFT_COLS.reduce((acc, col, i) => {
  acc[i] = i === 0 ? 0 : acc[i - 1] + LEFT_COLS[i - 1].w
  return acc
}, {})
const TOTAL_LEFT_W = LEFT_COLS.reduce((s, c) => s + c.w, 0)

// Monthly numeric sub-columns
const MONTH_NUM_FIELDS = [
  { key: 'hourly_rate',    label: 'Ставка',     w: 65 },
  { key: 'planned_hours',  label: 'Ч.план',     w: 52 },
  { key: 'actual_hours',   label: 'Ч.факт',     w: 52 },
  { key: 'planned_amount', label: 'Сумма план', w: 82 },
  { key: 'actual_amount',  label: 'Сумма факт', w: 82 },
]
const INVOICE_COL_W = 94
const MONTH_COL_W = MONTH_NUM_FIELDS.reduce((s, f) => s + f.w, 0) + INVOICE_COL_W // 330

const FIRST_ROW_H = 38 // thead row 1 height in px

// ─── Pure helpers ─────────────────────────────────────────────────────────────

function fmtMoney(v) {
  if (v === null || v === undefined) return '—'
  return Number(v).toLocaleString('ru-RU', { maximumFractionDigits: 0 })
}

function fmtDate(d) {
  if (!d) return '—'
  const s = String(d)
  const [y, m, dd] = s.split('-')
  return `${dd}.${m}.${String(y).slice(2)}`
}

function durationMonths(validFrom, validTo) {
  if (!validTo || !validFrom) return null
  const from = new Date(validFrom)
  const to = new Date(validTo)
  return Math.max(0, (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth()))
}

function endDateAlert(staffer) {
  if (staffer.work_status && staffer.work_status !== 'Активен') return null
  if (!staffer.valid_to) return null
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const end = new Date(staffer.valid_to)
  const diff = Math.floor((end - today) / 86400000)
  if (diff < 0) return 'var(--red)'
  if (diff <= 30) return 'var(--amber)'
  return null
}

function factBg(planned, actual) {
  const p = planned ?? 0
  if (p > 0 && (actual === null || actual === undefined)) return 'rgba(245,158,11,0.09)'
  if (actual != null && planned != null) {
    if (actual > planned) return 'rgba(239,68,68,0.10)'
    if (actual < planned) return 'rgba(34,197,94,0.07)'
  }
  return ''
}

const STATUS_BADGE = {
  'Активен':      { bg: '#f0fdf4', color: '#15803d', border: '#bbf7d0' },
  'Завершен':     { bg: '#f1f5f9', color: '#64748b', border: '#e2e8f0' },
  'Планируется':  { bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe' },
  'Приостановлен':{ bg: '#fffbeb', color: '#b45309', border: '#fde68a' },
}
const EXT_BADGE = {
  'Продление':         { bg: '#eef2ff', color: '#4338ca', border: '#c7d2fe', short: 'Продл.' },
  'Запрос продления':  { bg: '#fff7ed', color: '#c2410c', border: '#fed7aa', short: 'Запр.прод.' },
  'На согласовании':   { bg: '#f8fafc', color: '#475569', border: '#e2e8f0', short: 'На согл.' },
}
const INVOICE_STATUS_STYLE = {
  'Получен':              { color: '#15803d', bg: '#f0fdf4' },
  'Ожидаем выставления':  { color: '#92400e', bg: '#fffbeb' },
  'Загружен файл':        { color: '#1d4ed8', bg: '#eff6ff' },
  'Не выставлен':         { color: '#dc2626', bg: '#fef2f2' },
  'Проверяется':          { color: '#7c3aed', bg: '#faf5ff' },
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SummaryWidget({ label, value, sub, color }) {
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 8, padding: '10px 14px', flex: '1 1 120px', minWidth: 120,
      borderLeft: `3px solid ${color || 'var(--accent)'}`,
    }}>
      <div style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.4px' }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, marginTop: 3, color: color || 'var(--text)', lineHeight: 1.2 }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 1 }}>{sub}</div>}
    </div>
  )
}

function BudgetWidget({ label, value, sub, color, progress, hint }) {
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 8, padding: '10px 14px', flex: '1 1 140px', minWidth: 140,
      borderLeft: `3px solid ${color || 'var(--accent)'}`,
    }}>
      <div style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.4px' }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, marginTop: 3, color: color || 'var(--text)', lineHeight: 1.2 }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 1 }}>{sub}</div>}
      {progress != null && (
        <div style={{ marginTop: 6 }}>
          <div style={{ height: 4, borderRadius: 2, background: 'var(--border)', overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: 2, transition: 'width 0.4s',
              background: progress > 90 ? 'var(--red)' : progress > 70 ? 'var(--amber)' : 'var(--green)',
              width: `${Math.min(progress, 100)}%`,
            }} />
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 2 }}>{hint}</div>
        </div>
      )}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ExpensesTab() {
  const { year } = useYearStore()
  const qc = useQueryClient()

  // Filters
  const [search, setSearch] = useState('')
  const [fProject, setFProject] = useState('')
  const [fContractor, setFContractor] = useState('')
  const [fRole, setFRole] = useState('')
  const [fWorkStatus, setFWorkStatus] = useState('')
  const [fExtStatus, setFExtStatus] = useState('')
  const [fOverrun, setFOverrun] = useState(false)
  const [fNoInvoice, setFNoInvoice] = useState(false)

  // UI state
  const [editCell, setEditCell] = useState(null) // { stafferId, month, field }
  const [drafts, setDrafts] = useState({})
  const [drawerStaffer, setDrawerStaffer] = useState(null)
  const [invoiceModal, setInvoiceModal] = useState(null) // { staffer, month, expense }

  // Queries
  const { data: staffers = [], isLoading } = useQuery({
    queryKey: ['staffer-matrix', year],
    queryFn: () => getStafferMatrix(year),
    enabled: !!year,
  })
  const { data: projects = [] } = useQuery({ queryKey: ['projects-list'], queryFn: getProjects })
  const { data: contractors = [] } = useQuery({ queryKey: ['contractors-list'], queryFn: getContractors })
  const { data: workingHoursData } = useQuery({
    queryKey: ['working-hours', year],
    queryFn: () => getWorkingHours(year),
    enabled: !!year,
  })
  const { data: budgets = [] } = useQuery({
    queryKey: ['staffing-budgets', year],
    queryFn: () => getStaffingBudgets(year),
    enabled: !!year,
  })

  // month (1..12) -> hours
  const workingHoursByMonth = useMemo(() => {
    const m = {}
    ;(workingHoursData?.items || []).forEach(i => { m[i.month] = i.hours })
    return m
  }, [workingHoursData])

  const roles = useMemo(() => {
    const set = new Set(staffers.map(s => s.specialization).filter(Boolean))
    return [...set].sort()
  }, [staffers])

  // Mutations
  const upsertMut = useMutation({
    mutationFn: ({ stafferId, month, data }) => upsertStafferExpense(stafferId, year, month, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['staffer-matrix', year] }),
    onError: (e) => alert(e.response?.data?.detail || 'Ошибка сохранения'),
  })
  const uploadMut = useMutation({
    mutationFn: ({ expenseId, file }) => uploadStafferInvoiceFile(expenseId, file),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['staffer-matrix', year] }),
    onError: (e) => alert(e.response?.data?.detail || 'Ошибка загрузки файла'),
  })
  const deleteFileMut = useMutation({
    mutationFn: (fileId) => deleteStafferInvoiceFile(fileId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['staffer-matrix', year] }),
    onError: (e) => alert(e.response?.data?.detail || 'Ошибка удаления файла'),
  })
  const updateStafferMut = useMutation({
    mutationFn: ({ id, data }) => updateStaffer(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['staffer-matrix', year] })
      qc.invalidateQueries({ queryKey: ['staffers'] })
      setDrawerStaffer(null)
    },
    onError: (e) => alert(e.response?.data?.detail || 'Ошибка сохранения'),
  })
  const upsertRateMut = useMutation({
    mutationFn: ({ stafferId, month, hourly_rate }) =>
      upsertStafferMonthRate(stafferId, year, month, { hourly_rate }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['staffer-matrix', year] }),
    onError: (e) => alert(e.response?.data?.detail || 'Ошибка сохранения ставки'),
  })
  const deleteRateMut = useMutation({
    mutationFn: ({ stafferId, month }) => deleteStafferMonthRate(stafferId, year, month),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['staffer-matrix', year] }),
    onError: (e) => alert(e.response?.data?.detail || 'Ошибка сброса ставки'),
  })
  const prefillMut = useMutation({
    mutationFn: () => prefillStafferPlan(year),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['staffer-matrix', year] })
      alert(`Предзаполнено: создано ${res.created}, обновлено ${res.updated} записей.`)
    },
    onError: (e) => alert(e.response?.data?.detail || 'Ошибка предзаполнения'),
  })

  // ─── Draft helpers ──────────────────────────────────────────────────────────
  const dk = (sId, m, f) => `${sId}_${m}_${f}`
  const getDraft = (sId, m, f) => { const k = dk(sId, m, f); return k in drafts ? drafts[k] : undefined }
  const setDraft = (sId, m, f, v) => setDrafts(p => ({ ...p, [dk(sId, m, f)]: v }))
  const clearDraft = (sId, m, f) => setDrafts(p => { const n = { ...p }; delete n[dk(sId, m, f)]; return n })

  function getExp(staffer, month) {
    return staffer.month_expenses.find(e => e.month === month) || null
  }

  function isMonthInPeriod(staffer, month) {
    const vf = staffer.valid_from ? staffer.valid_from.split('-').map(Number) : null // [y, m, d]
    const vt = staffer.valid_to   ? staffer.valid_to.split('-').map(Number)   : null
    if (vf && (year < vf[0] || (year === vf[0] && month < vf[1]))) return false
    if (vt && (year > vt[0] || (year === vt[0] && month > vt[1]))) return false
    return true
  }

  function getEffectivePlannedHours(staffer, month) {
    const exp = getExp(staffer, month)
    if (exp?.planned_hours != null) return { value: exp.planned_hours, isExplicit: true }
    if (!isMonthInPeriod(staffer, month)) return { value: null, isExplicit: false }
    const fromSettings = workingHoursByMonth[month] ?? null
    return { value: fromSettings, isExplicit: false }
  }

  function getEffectivePlannedAmount(staffer, month) {
    const exp = getExp(staffer, month)
    if (exp?.planned_amount != null) return { value: exp.planned_amount, isExplicit: true }
    const { value: hours } = getEffectivePlannedHours(staffer, month)
    if (hours == null || hours === 0) return { value: null, isExplicit: false }
    const { effective: rate } = getMonthRate(staffer, month)
    return { value: Math.round(rate * hours), isExplicit: false }
  }

  function getMonthRate(staffer, month) {
    const explicit = staffer.month_rates?.find(r => r.month === month)
    return { explicit: explicit?.hourly_rate ?? null, effective: explicit?.hourly_rate ?? staffer.hourly_rate }
  }

  function handleCellBlur(staffer, month, field) {
    const draft = getDraft(staffer.id, month, field)
    if (draft === undefined) return

    // Inline-edit for staffer.task_description ("Задачи")
    if (field === 'task_description') {
      const textVal = draft === '' ? null : String(draft)
      const serverVal = staffer.task_description ?? null
      clearDraft(staffer.id, month, field)
      setEditCell(null)
      if (textVal === serverVal) return
      updateStafferMut.mutate({ id: staffer.id, data: { task_description: textVal } })
      return
    }

    const numVal = draft === '' ? null : parseFloat(draft)
    clearDraft(staffer.id, month, field)
    setEditCell(null)

    if (field === 'hourly_rate') {
      if (numVal == null || isNaN(numVal) || numVal < 0) return
      const { explicit } = getMonthRate(staffer, month)
      if (numVal === explicit) return
      upsertRateMut.mutate({ stafferId: staffer.id, month, hourly_rate: numVal })
      return
    }

    if (field === 'planned_hours') {
      if (numVal == null || isNaN(numVal) || numVal < 0) return
      const exp = getExp(staffer, month)
      const data = { planned_hours: numVal }
      // Auto-fill planned_amount = rate * hours when it hasn't been explicitly set
      if (exp?.planned_amount == null) {
        const { effective: rate } = getMonthRate(staffer, month)
        data.planned_amount = Math.round(rate * numVal)
      }
      upsertMut.mutate({ stafferId: staffer.id, month, data })
      return
    }

    const exp = getExp(staffer, month)
    const serverVal = exp ? (exp[field] ?? null) : null
    if (numVal === serverVal) return
    upsertMut.mutate({ stafferId: staffer.id, month, data: { [field]: numVal } })
  }

  function startEdit(stafferId, month, field, currentValue) {
    setEditCell({ stafferId, month, field })
    if (getDraft(stafferId, month, field) === undefined) {
      // For fields with effective (computed) defaults, initialize from the effective value
      if (field === 'planned_hours') {
        const s = filtered.find(x => x.id === stafferId)
        const { value } = s ? getEffectivePlannedHours(s, month) : { value: null }
        setDraft(stafferId, month, field, String(value ?? 0))
      } else if (field === 'planned_amount') {
        const s = filtered.find(x => x.id === stafferId)
        const { value } = s ? getEffectivePlannedAmount(s, month) : { value: null }
        setDraft(stafferId, month, field, String(value ?? 0))
      } else {
        setDraft(stafferId, month, field, currentValue != null ? String(currentValue) : '')
      }
    }
  }

  // ─── Filtered data ──────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let r = staffers
    const q = search.toLowerCase()
    if (q) r = r.filter(s =>
      s.full_name.toLowerCase().includes(q) ||
      (s.contractor_name || '').toLowerCase().includes(q) ||
      (s.project_name || '').toLowerCase().includes(q) ||
      (s.specialization || '').toLowerCase().includes(q) ||
      (s.task_description || '').toLowerCase().includes(q) ||
      s.month_expenses.some(e => (e.invoice_text || '').toLowerCase().includes(q))
    )
    if (fProject)    r = r.filter(s => s.project_id === fProject)
    if (fContractor) r = r.filter(s => s.contractor_id === fContractor)
    if (fRole)       r = r.filter(s => s.specialization === fRole)
    if (fWorkStatus) r = r.filter(s => s.work_status === fWorkStatus)
    if (fExtStatus)  r = r.filter(s => s.extension_status === fExtStatus)
    if (fOverrun)    r = r.filter(s =>
      s.month_expenses.some(e => e.actual_amount != null && e.planned_amount != null && e.actual_amount > e.planned_amount)
    )
    if (fNoInvoice)  r = r.filter(s =>
      s.month_expenses.some(e =>
        (e.planned_amount || 0) > 0 &&
        !e.invoice_text && !e.invoice_link &&
        (!e.invoice_files || e.invoice_files.length === 0)
      )
    )
    return r
  }, [staffers, search, fProject, fContractor, fRole, fWorkStatus, fExtStatus, fOverrun, fNoInvoice])

  // ─── Summary stats ──────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const active = staffers.filter(s => !s.work_status || s.work_status === 'Активен').length
    const expiring = staffers.filter(s => {
      if (s.work_status && s.work_status !== 'Активен') return false
      if (!s.valid_to) return false
      const diff = Math.floor((new Date(s.valid_to) - today) / 86400000)
      return diff >= 0 && diff <= 30
    }).length
    const renewal = staffers.filter(s =>
      s.extension_status === 'Запрос продления' || s.extension_status === 'На согласовании'
    ).length
    const allExp = staffers.flatMap(s => s.month_expenses)
    const totalPlan = allExp.reduce((s, e) => s + (e.planned_amount || 0), 0)
    const totalFact = allExp.reduce((s, e) => s + (e.actual_amount || 0), 0)
    const overrun = allExp.reduce((s, e) => {
      if (e.actual_amount != null && e.planned_amount != null && e.actual_amount > e.planned_amount)
        return s + (e.actual_amount - e.planned_amount)
      return s
    }, 0)
    const noInvoice = allExp.filter(e =>
      (e.planned_amount || 0) > 0 &&
      !e.invoice_text && !e.invoice_link &&
      (!e.invoice_files || e.invoice_files.length === 0)
    ).length
    return { active, expiring, renewal, totalPlan, totalFact, overrun, noInvoice }
  }, [staffers])

  // ─── Budget stats ────────────────────────────────────────────────────────────
  const budgetStats = useMemo(() => {
    const budgetsWithTotal = budgets.filter(b => b.total_budget != null && b.total_budget > 0)
    const totalBudget = budgetsWithTotal.reduce((s, b) => s + b.total_budget, 0)
    const allExp = staffers.flatMap(s => s.month_expenses)
    const totalFact = allExp.reduce((s, e) => s + (e.actual_amount || 0), 0)

    // Burn rate: average monthly fact across months that have any actual spend
    const factByMonth = {}
    allExp.forEach(e => {
      if (e.actual_amount > 0) factByMonth[e.month] = (factByMonth[e.month] || 0) + e.actual_amount
    })
    const monthsWithFact = Object.keys(factByMonth).length
    const burnRate = monthsWithFact > 0 ? totalFact / monthsWithFact : 0

    // Current month number (1..12) for "months remaining" calc
    const now = new Date()
    const currentYearMonth = now.getFullYear() === year ? now.getMonth() + 1 : (now.getFullYear() > year ? 12 : 0)
    const monthsRemaining = Math.max(0, 12 - currentYearMonth)
    const projectedTotal = totalFact + burnRate * monthsRemaining
    const remaining = totalBudget > 0 ? totalBudget - totalFact : null
    const consumedPct = totalBudget > 0 ? (totalFact / totalBudget) * 100 : null

    return { totalBudget, totalFact, remaining, consumedPct, burnRate, projectedTotal, budgetCount: budgetsWithTotal.length }
  }, [budgets, staffers, year])

  // ─── Per-month totals ───────────────────────────────────────────────────────
  const totals = useMemo(() => {
    const months = {}
    for (let m = 1; m <= 12; m++) {
      let plan = 0, fact = 0, planH = 0, factH = 0
      let hasPlan = false, hasFact = false, hasPlanH = false, hasFactH = false
      filtered.forEach(s => {
        const e = getExp(s, m)
        if (e) {
          if (e.planned_amount != null) { plan  += e.planned_amount; hasPlan  = true }
          if (e.actual_amount  != null) { fact  += e.actual_amount;  hasFact  = true }
          if (e.planned_hours  != null) { planH += e.planned_hours;  hasPlanH = true }
          if (e.actual_hours   != null) { factH += e.actual_hours;   hasFactH = true }
        }
      })
      months[m] = {
        plan:  hasPlan  ? plan  : null,
        fact:  hasFact  ? fact  : null,
        planH: hasPlanH ? planH : null,
        factH: hasFactH ? factH : null,
      }
    }
    const grandPlan = Object.values(months).reduce((s, t) => s + (t.plan || 0), 0)
    const grandFact = Object.values(months).reduce((s, t) => s + (t.fact || 0), 0)
    return { months, grandPlan, grandFact }
  }, [filtered])

  // ─── Cell styles — columns 0 (№) and 1 (ФИО) are sticky horizontally ─────────
  const STICKY_COLS = 2 // first N left columns that stick horizontally

  function thLeftCell(i, topOffset) {
    const isSticky = i < STICKY_COLS
    return {
      position: 'sticky',
      top: topOffset,
      ...(isSticky && { left: LEFT_POS[i], zIndex: 30 }),
      ...(!isSticky && { zIndex: 20 }),
      background: topOffset === 0 ? 'var(--surface)' : 'var(--surface2)',
      borderBottom: topOffset === 0 ? '1px solid var(--border)' : '2px solid var(--border)',
      borderRight: i === LEFT_COLS.length - 1 ? '2px solid var(--border)' : '1px solid var(--border-light)',
      padding: '4px 6px',
      fontSize: 10,
      fontWeight: 600,
      color: 'var(--text-2)',
      whiteSpace: 'nowrap',
      verticalAlign: 'middle',
      width: LEFT_COLS[i].w,
      minWidth: LEFT_COLS[i].w,
      maxWidth: LEFT_COLS[i].w,
    }
  }

  function tdLeft(i, extra = {}) {
    const isSticky = i < STICKY_COLS
    return {
      background: 'var(--surface)',
      borderBottom: '1px solid var(--border-light)',
      borderRight: i === LEFT_COLS.length - 1 ? '2px solid var(--border)' : '1px solid var(--border-light)',
      padding: '4px 6px',
      fontSize: 12,
      width: LEFT_COLS[i].w,
      minWidth: LEFT_COLS[i].w,
      maxWidth: LEFT_COLS[i].w,
      verticalAlign: 'middle',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
      ...(isSticky && { position: 'sticky', left: LEFT_POS[i], zIndex: 5 }),
      ...extra,
    }
  }

  // ─── Render helpers ─────────────────────────────────────────────────────────
  function renderNumCell(staffer, month, field) {
    const isEditing = editCell?.stafferId === staffer.id && editCell?.month === month && editCell?.field === field
    const draft = getDraft(staffer.id, month, field)
    const w = MONTH_NUM_FIELDS.find(f => f.key === field)?.w || 84

    const editInput = (initVal, bg = '#eef2ff') => (
      <td key={field} style={{ padding: '2px 3px', background: bg, width: w, minWidth: w, borderRight: '1px solid var(--border-light)' }}>
        <input
          type="number" min="0" autoFocus
          value={draft !== undefined ? draft : String(initVal ?? '')}
          style={{ width: '100%', textAlign: 'right', padding: '2px 4px', border: '1px solid var(--accent)', borderRadius: 3, fontSize: 12, background: '#fff' }}
          onChange={e => setDraft(staffer.id, month, field, e.target.value)}
          onBlur={() => handleCellBlur(staffer, month, field)}
          onKeyDown={e => {
            if (e.key === 'Escape') { clearDraft(staffer.id, month, field); setEditCell(null) }
            if (e.key === 'Enter') e.target.blur()
          }}
        />
      </td>
    )

    // ── Ставка: reads from StafferMonthRate ──
    if (field === 'hourly_rate') {
      const { explicit, effective } = getMonthRate(staffer, month)
      if (isEditing) return editInput(explicit ?? effective)
      return (
        <td
          key={field}
          style={{ padding: '4px 5px', width: w, minWidth: w, textAlign: 'right', fontSize: 12, cursor: 'pointer', verticalAlign: 'middle', borderRight: '1px solid var(--border-light)', borderBottom: '1px solid var(--border-light)', color: explicit != null ? 'var(--text)' : 'var(--text-3)', fontWeight: explicit != null ? 600 : 400 }}
          onClick={() => startEdit(staffer.id, month, field, null)}
          onContextMenu={e => { e.preventDefault(); if (explicit != null) deleteRateMut.mutate({ stafferId: staffer.id, month }) }}
          title={explicit != null ? `Явная ставка ${fmtMoney(explicit)} ₽/ч. ПКМ — сбросить к базовой.` : `Базовая ставка ${fmtMoney(staffer.hourly_rate)} ₽/ч. Нажмите для переопределения.`}
        >
          {fmtMoney(effective)}
        </td>
      )
    }

    // ── Ч.план: effective = explicit OR working hours from settings ──
    if (field === 'planned_hours') {
      const { value, isExplicit } = getEffectivePlannedHours(staffer, month)
      if (isEditing) return editInput(value)
      return (
        <td
          key={field}
          style={{ padding: '4px 5px', width: w, minWidth: w, textAlign: 'right', fontSize: 12, cursor: 'pointer', verticalAlign: 'middle', borderRight: '1px solid var(--border-light)', borderBottom: '1px solid var(--border-light)', color: isExplicit ? 'var(--text)' : 'var(--text-3)', fontWeight: isExplicit ? 600 : 400 }}
          onClick={() => startEdit(staffer.id, month, field, null)}
          title={isExplicit ? 'Явное значение. Нажмите для изменения.' : value != null ? `По производственному календарю: ${value} ч. Нажмите для изменения.` : 'Нет рабочих часов для этого месяца.'}
        >
          {value != null ? value : <span style={{ color: 'var(--border)' }}>—</span>}
        </td>
      )
    }

    // ── Сумма план: effective = explicit OR rate * effective_hours ──
    if (field === 'planned_amount') {
      const { value, isExplicit } = getEffectivePlannedAmount(staffer, month)
      if (isEditing) return editInput(value)
      return (
        <td
          key={field}
          style={{ padding: '4px 5px', width: w, minWidth: w, textAlign: 'right', fontSize: 12, cursor: 'pointer', verticalAlign: 'middle', borderRight: '1px solid var(--border-light)', borderBottom: '1px solid var(--border-light)', color: isExplicit ? 'var(--text)' : 'var(--text-3)', fontWeight: isExplicit ? 600 : 400 }}
          onClick={() => startEdit(staffer.id, month, field, null)}
          title={isExplicit ? 'Явное значение. Нажмите для изменения.' : value != null ? `Авто: ставка × часы = ${fmtMoney(value)} ₽. Нажмите для изменения.` : 'Нет данных.'}
        >
          {value != null ? fmtMoney(value) : <span style={{ color: 'var(--border)' }}>—</span>}
        </td>
      )
    }

    // ── Остальные числовые поля (actual_hours, actual_amount) ──
    const exp = getExp(staffer, month)
    const serverVal = exp ? (exp[field] ?? null) : null
    const bg = field === 'actual_amount' ? factBg(
      getEffectivePlannedAmount(staffer, month).value,
      exp?.actual_amount ?? null,
    ) : ''

    if (isEditing) return editInput(serverVal, bg || '#eef2ff')
    return (
      <td
        key={field}
        style={{ padding: '4px 5px', background: bg, width: w, minWidth: w, textAlign: 'right', fontSize: 12, cursor: 'pointer', verticalAlign: 'middle', borderRight: '1px solid var(--border-light)', borderBottom: '1px solid var(--border-light)' }}
        onClick={() => startEdit(staffer.id, month, field, serverVal)}
        title="Нажмите для редактирования"
      >
        {serverVal != null ? (field === 'actual_hours' ? serverVal : fmtMoney(serverVal)) : <span style={{ color: 'var(--border)' }}>—</span>}
      </td>
    )
  }

  function renderInvoiceCell(staffer, month) {
    const exp = getExp(staffer, month)
    const hasContent = exp && (exp.invoice_text || exp.invoice_link || exp.invoice_status || (exp.invoice_files?.length > 0))

    return (
      <td
        key="invoice"
        style={{
          padding: '3px 5px', width: INVOICE_COL_W, minWidth: INVOICE_COL_W, fontSize: 11,
          verticalAlign: 'middle', borderRight: '2px solid var(--border)',
          borderBottom: '1px solid var(--border-light)',
        }}
      >
        {hasContent ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {exp.invoice_status && (() => {
              const st = INVOICE_STATUS_STYLE[exp.invoice_status] || { color: '#64748b', bg: '#f1f5f9' }
              return (
                <span style={{ ...st, padding: '1px 4px', borderRadius: 3, fontSize: 9, fontWeight: 600, alignSelf: 'flex-start' }}>
                  {exp.invoice_status}
                </span>
              )
            })()}
            {exp.invoice_text && (
              <span style={{ fontSize: 10, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: INVOICE_COL_W - 10 }} title={exp.invoice_text}>
                {exp.invoice_text}
              </span>
            )}
            {exp.invoice_link && (
              <a href={exp.invoice_link} target="_blank" rel="noreferrer" title={exp.invoice_link} style={{ fontSize: 10, color: 'var(--accent)' }}>🔗 ссылка</a>
            )}
            {exp.invoice_files?.length > 0 && (
              <div style={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                {exp.invoice_files.map(f => (
                  <a key={f.id} href={stafferInvoiceFileDownloadUrl(f.id)} target="_blank" rel="noreferrer" title={f.filename} style={{ fontSize: 12 }}>📄</a>
                ))}
              </div>
            )}
            <button
              type="button"
              style={{ alignSelf: 'flex-start', fontSize: 9, color: 'var(--text-3)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginTop: 1 }}
              onClick={() => setInvoiceModal({ staffer, month, expense: exp })}
              title="Редактировать счёт"
            >
              ✏️ изменить
            </button>
          </div>
        ) : (
          <button
            type="button"
            style={{ fontSize: 10, color: 'var(--text-3)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
            onClick={() => setInvoiceModal({ staffer, month, expense: exp })}
            title="Добавить счёт"
          >
            + счёт
          </button>
        )}
      </td>
    )
  }

  // ─── Table header ───────────────────────────────────────────────────────────
  function renderHeader() {
    return (
      <thead>
        {/* Row 1: group headers */}
        <tr style={{ height: FIRST_ROW_H }}>
          <th
            colSpan={LEFT_COLS.length}
            style={{
              position: 'sticky', top: 0, zIndex: 20,
              background: 'var(--surface)', borderBottom: '1px solid var(--border)',
              borderRight: '2px solid var(--border)',
              padding: '0 12px', fontSize: 11, fontWeight: 700, color: 'var(--text-2)',
              textAlign: 'left', verticalAlign: 'middle',
              minWidth: TOTAL_LEFT_W,
            }}
          >
            СТАФФЕР / СОТРУДНИК
          </th>
          {Array.from({ length: 12 }, (_, i) => (
            <th
              key={i + 1}
              colSpan={MONTH_NUM_FIELDS.length + 1}
              style={{
                position: 'sticky', top: 0, zIndex: 20,
                background: 'var(--surface)', borderBottom: '1px solid var(--border)',
                borderRight: '2px solid var(--border)',
                padding: '0 4px', fontSize: 11, fontWeight: 700, color: 'var(--text-2)',
                textAlign: 'center', verticalAlign: 'middle',
                minWidth: MONTH_COL_W,
              }}
            >
              {MONTHS_FULL[i]} {year}
            </th>
          ))}
          <th colSpan={2} style={{
            position: 'sticky', top: 0, zIndex: 20,
            background: 'var(--surface)', borderBottom: '1px solid var(--border)',
            padding: '0 8px', fontSize: 11, fontWeight: 700, color: 'var(--accent)',
            textAlign: 'right', verticalAlign: 'middle', minWidth: 150,
          }}>
            ИТОГО {year}
          </th>
        </tr>

        {/* Row 2: sub-column headers */}
        <tr style={{ height: 32 }}>
          {LEFT_COLS.map((col, i) => (
            <th key={col.key} style={thLeftCell(i, FIRST_ROW_H)}>
              {col.label}
            </th>
          ))}
          {Array.from({ length: 12 }, (_, mi) => (
            <Fragment key={mi}>
              {MONTH_NUM_FIELDS.map((f, fi) => (
                <th
                  key={`${mi}_${f.key}`}
                  style={{
                    position: 'sticky', top: FIRST_ROW_H, zIndex: 20,
                    background: 'var(--surface2)', borderBottom: '2px solid var(--border)',
                    borderRight: '1px solid var(--border-light)',
                    padding: '4px 4px', fontSize: 10, fontWeight: 600, color: 'var(--text-3)',
                    textAlign: 'right', verticalAlign: 'middle',
                    width: f.w, minWidth: f.w,
                  }}
                >
                  {f.label}
                </th>
              ))}
              <th
                key={`${mi}_inv`}
                style={{
                  position: 'sticky', top: FIRST_ROW_H, zIndex: 20,
                  background: 'var(--surface2)', borderBottom: '2px solid var(--border)',
                  borderRight: '2px solid var(--border)',
                  padding: '4px 4px', fontSize: 10, fontWeight: 600, color: 'var(--text-3)',
                  textAlign: 'center', verticalAlign: 'middle',
                  width: INVOICE_COL_W, minWidth: INVOICE_COL_W,
                }}
              >
                Счёт
              </th>
            </Fragment>
          ))}
          {/* Totals sub-headers */}
          <th style={{ position: 'sticky', top: FIRST_ROW_H, zIndex: 20, background: 'var(--surface2)', borderBottom: '2px solid var(--border)', padding: '4px 8px', fontSize: 10, fontWeight: 600, color: 'var(--text-3)', textAlign: 'right', minWidth: 75 }}>
            План ₽
          </th>
          <th style={{ position: 'sticky', top: FIRST_ROW_H, zIndex: 20, background: 'var(--surface2)', borderBottom: '2px solid var(--border)', padding: '4px 8px', fontSize: 10, fontWeight: 600, color: 'var(--text-3)', textAlign: 'right', minWidth: 75 }}>
            Факт ₽
          </th>
        </tr>
      </thead>
    )
  }

  // ─── Staffer row ────────────────────────────────────────────────────────────
  function renderStafferRow(staffer, idx) {
    const endAlert = endDateAlert(staffer)
    const dur = durationMonths(staffer.valid_from, staffer.valid_to)
    const rowPlan = staffer.month_expenses.reduce((s, e) => s + (e.planned_amount || 0), 0)
    const rowFact = staffer.month_expenses.reduce((s, e) => s + (e.actual_amount || 0), 0)
    const wsBadge = STATUS_BADGE[staffer.work_status] || STATUS_BADGE['Активен']
    const extBadge = EXT_BADGE[staffer.extension_status]
    const isEditingTasks = editCell?.stafferId === staffer.id && editCell?.month === 0 && editCell?.field === 'task_description'
    const tasksDraft = getDraft(staffer.id, 0, 'task_description')

    return (
      <tr key={staffer.id} style={{ background: 'var(--surface)' }}>
        {/* № */}
        <td style={{ ...tdLeft(0), textAlign: 'center', color: 'var(--text-3)' }}>
          {staffer.display_order ?? idx + 1}
        </td>

        {/* ФИО */}
        <td style={tdLeft(1)} title={staffer.full_name}>
          <button
            type="button"
            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--accent)', fontWeight: 500, fontSize: 12, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block', width: '100%' }}
            onClick={() => setDrawerStaffer(staffer)}
          >
            {staffer.full_name}
          </button>
        </td>

        {/* Подрядчик */}
        <td style={tdLeft(2)} title={staffer.contractor_name || ''}>
          <span style={{ color: 'var(--text-2)', fontSize: 11 }}>{staffer.contractor_name || '—'}</span>
        </td>

        {/* Оценка */}
        <td style={{ ...tdLeft(3), textAlign: 'center' }}>
          {staffer.rating
            ? <span style={{ fontSize: 10, color: '#d97706', letterSpacing: -1 }}>{'★'.repeat(staffer.rating)}</span>
            : <span style={{ color: 'var(--border)' }}>—</span>
          }
        </td>

        {/* Роль */}
        <td style={tdLeft(4)} title={staffer.specialization || ''}>
          <span style={{ fontSize: 11 }}>{staffer.specialization || <span style={{ color: 'var(--border)' }}>—</span>}</span>
        </td>

        {/* Проект */}
        <td style={tdLeft(5)} title={staffer.project_name || ''}>
          <span style={{ fontSize: 11, color: 'var(--text-2)' }}>{staffer.project_name || <span style={{ color: 'var(--border)' }}>—</span>}</span>
        </td>

        {/* Задачи */}
        <td
          style={tdLeft(6, isEditingTasks ? { overflow: 'visible', whiteSpace: 'normal', textOverflow: 'clip' } : {})}
          title={staffer.task_description || ''}
        >
          {isEditingTasks ? (
            <textarea
              autoFocus
              rows={2}
              value={tasksDraft !== undefined ? tasksDraft : (staffer.task_description || '')}
              onChange={e => setDraft(staffer.id, 0, 'task_description', e.target.value)}
              onBlur={() => handleCellBlur(staffer, 0, 'task_description')}
              onKeyDown={e => {
                if (e.key === 'Escape') {
                  clearDraft(staffer.id, 0, 'task_description')
                  setEditCell(null)
                }
                if ((e.key === 'Enter' || e.key === 'NumpadEnter') && (e.ctrlKey || e.metaKey)) e.currentTarget.blur()
              }}
              style={{
                width: '100%',
                minHeight: 34,
                border: '1px solid var(--accent)',
                borderRadius: 3,
                fontSize: 11,
                padding: '3px 4px',
                background: '#fff',
                resize: 'vertical',
                whiteSpace: 'pre-wrap',
                boxSizing: 'border-box',
              }}
            />
          ) : (
            <button
              type="button"
              style={{
                width: '100%',
                textAlign: 'left',
                background: 'none',
                border: 'none',
                padding: 0,
                cursor: 'pointer',
                fontSize: 11,
                color: staffer.task_description ? 'var(--text-2)' : 'var(--border)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
              onClick={() => startEdit(staffer.id, 0, 'task_description', staffer.task_description)}
              title="Нажмите для редактирования"
            >
              {staffer.task_description || '—'}
            </button>
          )}
        </td>

        {/* С (start) */}
        <td style={tdLeft(7)}>
          <span style={{ fontSize: 10, color: 'var(--text-2)' }}>{fmtDate(staffer.valid_from)}</span>
        </td>

        {/* По (end) */}
        <td style={tdLeft(8)} title={staffer.valid_to || ''}>
          <span style={{ fontSize: 10, color: endAlert || 'var(--text-2)', fontWeight: endAlert ? 600 : 400 }}>
            {fmtDate(staffer.valid_to)}
          </span>
        </td>

        {/* Срок */}
        <td style={{ ...tdLeft(9), textAlign: 'center' }}>
          <span style={{ fontSize: 11, color: 'var(--text-2)' }}>{dur != null ? dur : '—'}</span>
        </td>

        {/* Статус */}
        <td style={tdLeft(10)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-start' }}>
            {staffer.work_status && (
              <span style={{
                background: wsBadge.bg, color: wsBadge.color,
                border: `1px solid ${wsBadge.border}`,
                padding: '1px 5px', borderRadius: 3, fontSize: 9, fontWeight: 600,
                whiteSpace: 'nowrap',
              }}>
                {staffer.work_status}
              </span>
            )}
            {extBadge && staffer.extension_status !== 'Нет' && (
              <span
                title={staffer.extension_status}
                style={{
                  background: extBadge.bg, color: extBadge.color,
                  border: `1px solid ${extBadge.border}`,
                  padding: '1px 4px', borderRadius: 3, fontSize: 9, fontWeight: 600,
                  whiteSpace: 'nowrap',
                }}
              >
                {extBadge.short || staffer.extension_status}
              </span>
            )}
          </div>
        </td>

        {/* Actions */}
        <td style={{ ...tdLeft(11), textAlign: 'center', padding: '2px' }}>
          <button
            type="button"
            style={{ fontSize: 14, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: '1px 3px', lineHeight: 1 }}
            title="Редактировать стаффера"
            onClick={() => setDrawerStaffer(staffer)}
          >
            ⋯
          </button>
        </td>

        {/* Monthly cells */}
        {Array.from({ length: 12 }, (_, i) => {
          const m = i + 1
          return (
            <Fragment key={m}>
              {MONTH_NUM_FIELDS.map(f => renderNumCell(staffer, m, f.key))}
              {renderInvoiceCell(staffer, m)}
            </Fragment>
          )
        })}

        {/* Row totals */}
        <td style={{ padding: '4px 8px', textAlign: 'right', fontSize: 12, fontWeight: 500, color: 'var(--text-2)', minWidth: 75, borderBottom: '1px solid var(--border-light)', whiteSpace: 'nowrap' }}>
          {rowPlan > 0 ? fmtMoney(rowPlan) : '—'}
        </td>
        <td style={{
          padding: '4px 8px', textAlign: 'right', fontSize: 12, fontWeight: 600,
          color: rowFact > 0 && rowPlan > 0 && rowFact > rowPlan ? 'var(--red)' : rowFact > 0 ? 'var(--green)' : 'var(--text-3)',
          minWidth: 75, borderBottom: '1px solid var(--border-light)', whiteSpace: 'nowrap',
        }}>
          {rowFact > 0 ? fmtMoney(rowFact) : '—'}
        </td>
      </tr>
    )
  }

  // ─── Totals row ─────────────────────────────────────────────────────────────
  function renderTotalsRow() {
    return (
      <tr style={{ background: 'var(--surface2)' }}>
        <td
          colSpan={LEFT_COLS.length}
          style={{
            background: 'var(--surface2)', borderTop: '2px solid var(--border)',
            borderRight: '2px solid var(--border)', padding: '6px 12px',
            fontSize: 12, fontWeight: 700, color: 'var(--text-2)',
          }}
        >
          ИТОГО — {filtered.length} {filtered.length === 1 ? 'стаффер' : filtered.length < 5 ? 'стаффера' : 'стафферов'}
        </td>

        {Array.from({ length: 12 }, (_, i) => {
          const m = i + 1
          const mt = totals.months[m]
          const tdc = (extra = {}) => ({
            padding: '4px 5px', textAlign: 'right', fontSize: 11, fontWeight: 600,
            background: 'var(--surface2)', borderTop: '2px solid var(--border)',
            borderRight: '1px solid var(--border-light)', ...extra,
          })
          return (
            <Fragment key={m}>
              {/* Ставка — нет итога */}
              <td style={tdc({ color: 'var(--text-3)', fontWeight: 400, width: MONTH_NUM_FIELDS[0].w })}>—</td>
              {/* Ч.план */}
              <td style={tdc({ width: MONTH_NUM_FIELDS[1].w })}>
                {mt.planH != null ? `${mt.planH}` : '—'}
              </td>
              {/* Ч.факт */}
              <td style={tdc({ width: MONTH_NUM_FIELDS[2].w })}>
                {mt.factH != null ? `${mt.factH}` : '—'}
              </td>
              {/* Сумма план */}
              <td style={tdc({ width: MONTH_NUM_FIELDS[3].w })}>
                {mt.plan != null ? fmtMoney(mt.plan) : '—'}
              </td>
              {/* Сумма факт */}
              <td style={tdc({
                width: MONTH_NUM_FIELDS[4].w,
                color: mt.fact != null && mt.plan != null && mt.fact > mt.plan ? 'var(--red)' : 'inherit',
                borderRight: '2px solid var(--border)',
              })}>
                {mt.fact != null ? fmtMoney(mt.fact) : '—'}
              </td>
              <td style={{ background: 'var(--surface2)', borderTop: '2px solid var(--border)', borderRight: '2px solid var(--border)', width: INVOICE_COL_W }} />
            </Fragment>
          )
        })}

        <td style={{ padding: '4px 8px', textAlign: 'right', fontSize: 12, fontWeight: 700, background: 'var(--surface2)', borderTop: '2px solid var(--border)', minWidth: 75, whiteSpace: 'nowrap' }}>
          {fmtMoney(totals.grandPlan)}
        </td>
        <td style={{
          padding: '4px 8px', textAlign: 'right', fontSize: 12, fontWeight: 700,
          color: totals.grandFact > totals.grandPlan ? 'var(--red)' : totals.grandFact > 0 ? 'var(--green)' : 'var(--text-3)',
          background: 'var(--surface2)', borderTop: '2px solid var(--border)', minWidth: 75, whiteSpace: 'nowrap',
        }}>
          {fmtMoney(totals.grandFact)}
        </td>
      </tr>
    )
  }

  const hasFilters = search || fProject || fContractor || fRole || fWorkStatus || fExtStatus || fOverrun || fNoInvoice

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <div>
      {/* Summary widgets — row 1: staffers */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
        <SummaryWidget label="Активных стафферов" value={stats.active} color="var(--green)" />
        <SummaryWidget label="Срок ≤30 дней" value={stats.expiring} color="var(--amber)" />
        <SummaryWidget label="Требуют продления" value={stats.renewal} color="#7c3aed" />
        <SummaryWidget label="Общий план" value={fmtMoney(stats.totalPlan)} sub="₽" color="var(--accent)" />
        <SummaryWidget label="Общий факт" value={fmtMoney(stats.totalFact)} sub="₽" color="var(--text)" />
        <SummaryWidget
          label="Перерасход"
          value={stats.overrun > 0 ? `+${fmtMoney(stats.overrun)}` : '0'}
          sub="₽"
          color={stats.overrun > 0 ? 'var(--red)' : 'var(--green)'}
        />
        <SummaryWidget label="Без счёта" value={stats.noInvoice} color={stats.noInvoice > 0 ? 'var(--amber)' : 'var(--text-3)'} />
      </div>

      {/* Summary widgets — row 2: budget */}
      {budgetStats.totalBudget > 0 ? (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
          <BudgetWidget
            label={`Бюджет на ${year}`}
            value={fmtMoney(budgetStats.totalBudget)}
            sub={`${budgetStats.budgetCount} ${budgetStats.budgetCount === 1 ? 'бюджет' : budgetStats.budgetCount < 5 ? 'бюджета' : 'бюджетов'}`}
            color="var(--accent)"
          />
          <BudgetWidget
            label="Освоено"
            value={`${budgetStats.consumedPct != null ? budgetStats.consumedPct.toFixed(1) : '0'}%`}
            sub={`${fmtMoney(budgetStats.totalFact)} ₽ из ${fmtMoney(budgetStats.totalBudget)} ₽`}
            color={budgetStats.consumedPct > 90 ? 'var(--red)' : budgetStats.consumedPct > 70 ? 'var(--amber)' : 'var(--green)'}
            progress={budgetStats.consumedPct}
            hint={`${fmtMoney(budgetStats.totalFact)} ₽ потрачено`}
          />
          <BudgetWidget
            label="Остаток бюджета"
            value={fmtMoney(budgetStats.remaining)}
            sub="₽"
            color={budgetStats.remaining < 0 ? 'var(--red)' : budgetStats.remaining < budgetStats.totalBudget * 0.15 ? 'var(--amber)' : 'var(--green)'}
          />
          <BudgetWidget
            label="Burn rate"
            value={fmtMoney(budgetStats.burnRate)}
            sub="₽/мес (средний факт)"
            color="var(--text)"
          />
          <BudgetWidget
            label="Прогноз на год"
            value={fmtMoney(budgetStats.projectedTotal)}
            sub="₽ (факт + остаток месяцев × burn rate)"
            color={budgetStats.projectedTotal > budgetStats.totalBudget ? 'var(--red)' : 'var(--text-2)'}
          />
        </div>
      ) : (
        <div style={{ marginBottom: 14, fontSize: 12, color: 'var(--text-3)', padding: '6px 10px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span>💰</span>
          <span>Бюджет не задан — перейдите в «Бюджеты» для настройки. Тогда здесь появятся показатели освоения и burn rate.</span>
        </div>
      )}

      {/* Filters */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            className="input"
            style={{ width: 220, height: 32, padding: '4px 10px', fontSize: 12 }}
            placeholder="Поиск по ФИО, подрядчику, проекту…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <select className="input" style={{ height: 32, padding: '4px 8px', fontSize: 12, width: 160 }} value={fProject} onChange={e => setFProject(e.target.value)}>
            <option value="">Все проекты</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select className="input" style={{ height: 32, padding: '4px 8px', fontSize: 12, width: 150 }} value={fContractor} onChange={e => setFContractor(e.target.value)}>
            <option value="">Все подрядчики</option>
            {contractors.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select className="input" style={{ height: 32, padding: '4px 8px', fontSize: 12, width: 130 }} value={fRole} onChange={e => setFRole(e.target.value)}>
            <option value="">Все роли</option>
            {roles.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          <select className="input" style={{ height: 32, padding: '4px 8px', fontSize: 12, width: 130 }} value={fWorkStatus} onChange={e => setFWorkStatus(e.target.value)}>
            <option value="">Статус работы</option>
            {WORK_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select className="input" style={{ height: 32, padding: '4px 8px', fontSize: 12, width: 145 }} value={fExtStatus} onChange={e => setFExtStatus(e.target.value)}>
            <option value="">Статус продления</option>
            {EXT_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap', userSelect: 'none' }}>
            <input type="checkbox" checked={fOverrun} onChange={e => setFOverrun(e.target.checked)} />
            Перерасход
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap', userSelect: 'none' }}>
            <input type="checkbox" checked={fNoInvoice} onChange={e => setFNoInvoice(e.target.checked)} />
            Без счёта
          </label>
          {hasFilters && (
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => { setSearch(''); setFProject(''); setFContractor(''); setFRole(''); setFWorkStatus(''); setFExtStatus(''); setFOverrun(false); setFNoInvoice(false) }}
            >
              Сбросить
            </button>
          )}
          <div style={{ marginLeft: 'auto' }}>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => {
                if (window.confirm(`Предзаполнить плановые часы и суммы для ${year} года по производственному календарю?\nСуществующие значения не будут изменены.`)) {
                  prefillMut.mutate()
                }
              }}
              disabled={prefillMut.isPending}
              title="Заполнить план по часам из производственного календаря (настройки). Не перезаписывает уже заполненные ячейки."
            >
              {prefillMut.isPending ? <span className="spinner" style={{ width: 12, height: 12 }} /> : '↓ Заполнить план из календаря'}
            </button>
          </div>
        </div>
      </div>

      {/* Matrix table */}
      <div style={{ overflow: 'auto', maxHeight: 'calc(100vh - 380px)', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)' }}>
        {isLoading ? (
          <div style={{ padding: 60, textAlign: 'center' }}>
            <span className="spinner" />
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-3)', fontSize: 14 }}>
            {staffers.length === 0
              ? 'Стафферы не добавлены. Перейдите на вкладку «Стафферы» для добавления сотрудников.'
              : 'Нет данных по заданным фильтрам.'}
          </div>
        ) : (
          <table style={{ borderCollapse: 'collapse' }}>
            {renderHeader()}
            <tbody>
              {filtered.map((s, i) => renderStafferRow(s, i))}
              {renderTotalsRow()}
            </tbody>
          </table>
        )}
      </div>

      {/* Staffer drawer */}
      {drawerStaffer && (
        <StafferDrawer
          staffer={drawerStaffer}
          projects={projects}
          contractors={contractors}
          budgets={budgets}
          saving={updateStafferMut.isPending}
          onClose={() => setDrawerStaffer(null)}
          onSave={data => updateStafferMut.mutate({ id: drawerStaffer.id, data })}
        />
      )}

      {/* Invoice modal */}
      {invoiceModal && (
        <InvoiceModal
          staffer={invoiceModal.staffer}
          month={invoiceModal.month}
          year={year}
          expense={invoiceModal.expense}
          saving={upsertMut.isPending || uploadMut.isPending}
          onClose={() => setInvoiceModal(null)}
          onSave={data => {
            upsertMut.mutate({ stafferId: invoiceModal.staffer.id, month: invoiceModal.month, data })
            setInvoiceModal(null)
          }}
          onUploadFile={(expenseId, file) => {
            uploadMut.mutate({ expenseId, file })
            setInvoiceModal(null)
          }}
          onDeleteFile={fileId => {
            if (window.confirm('Удалить файл счёта?')) deleteFileMut.mutate(fileId)
          }}
        />
      )}
    </div>
  )
}

// ─── StafferDrawer ────────────────────────────────────────────────────────────

function StafferDrawer({ staffer, projects, contractors, budgets, saving, onClose, onSave }) {
  const [form, setForm] = useState({
    last_name:         staffer.last_name || '',
    first_name:        staffer.first_name || '',
    middle_name:       staffer.middle_name || '',
    contractor_id:     staffer.contractor_id || '',
    project_id:        staffer.project_id || '',
    staffing_budget_id: staffer.staffing_budget_id || '',
    specialization:    staffer.specialization || '',
    rating:            staffer.rating ? String(staffer.rating) : '',
    task_description:  staffer.task_description || '',
    valid_from:        staffer.valid_from || '',
    valid_to:          staffer.valid_to || '',
    hourly_rate:       String(staffer.hourly_rate ?? 0),
    work_status:       staffer.work_status || 'Активен',
    extension_status:  staffer.extension_status || 'Нет',
    extension_comment: staffer.extension_comment || '',
    pm_name:           staffer.pm_name || '',
    comment:           staffer.comment || '',
    display_order:     staffer.display_order ? String(staffer.display_order) : '',
  })

  function f(field) { return (e) => setForm(p => ({ ...p, [field]: e.target.value })) }

  function handleSubmit(e) {
    e.preventDefault()
    onSave({
      last_name:         form.last_name || null,
      first_name:        form.first_name || null,
      middle_name:       form.middle_name || null,
      contractor_id:     form.contractor_id || null,
      project_id:        form.project_id || null,
      staffing_budget_id: form.staffing_budget_id || null,
      specialization:    form.specialization || null,
      rating:            form.rating ? parseInt(form.rating) : null,
      task_description:  form.task_description || null,
      valid_from:        form.valid_from || undefined,
      valid_to:          form.valid_to || null,
      hourly_rate:       parseFloat(form.hourly_rate) || 0,
      work_status:       form.work_status || null,
      extension_status:  form.extension_status || null,
      extension_comment: form.extension_comment || null,
      pm_name:           form.pm_name || null,
      comment:           form.comment || null,
      display_order:     form.display_order ? parseInt(form.display_order) : null,
    })
  }

  const inp = { className: 'input', style: { marginTop: 3 } }
  const lbl = { className: 'label', style: { marginTop: 10, display: 'block' } }

  return (
    <div
      style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: 440,
        background: 'var(--surface)', borderLeft: '1px solid var(--border)',
        boxShadow: 'var(--shadow-md)', zIndex: 1000,
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}
      onClick={e => e.stopPropagation()}
    >
      {/* Header */}
      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 15 }}>{staffer.full_name}</div>
        <button type="button" className="btn btn-ghost btn-icon" onClick={onClose} style={{ fontSize: 16 }}>✕</button>
      </div>

      {/* Body */}
      <div style={{ overflow: 'auto', flex: 1, padding: '14px 20px' }}>
        <form onSubmit={handleSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label {...lbl} style={{ marginTop: 0 }}>Фамилия</label>
              <input {...inp} value={form.last_name} onChange={f('last_name')} />
            </div>
            <div>
              <label {...lbl} style={{ marginTop: 0 }}>Имя</label>
              <input {...inp} value={form.first_name} onChange={f('first_name')} />
            </div>
          </div>

          <label {...lbl}>Отчество</label>
          <input {...inp} value={form.middle_name} onChange={f('middle_name')} />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label {...lbl}>Подрядчик</label>
              <select {...inp} value={form.contractor_id} onChange={f('contractor_id')}>
                <option value="">—</option>
                {contractors.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label {...lbl}>Проект</label>
              <select {...inp} value={form.project_id} onChange={f('project_id')}>
                <option value="">—</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          </div>

          <label {...lbl}>Бюджет стаффинга</label>
          <select {...inp} value={form.staffing_budget_id} onChange={f('staffing_budget_id')}>
            <option value="">— не выбрано —</option>
            {(budgets || []).map(b => <option key={b.id} value={b.id}>{b.name} ({b.year})</option>)}
          </select>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label {...lbl}>Роль / специализация</label>
              <input {...inp} value={form.specialization} onChange={f('specialization')} />
            </div>
            <div>
              <label {...lbl}>Оценка (1–5)</label>
              <select {...inp} value={form.rating} onChange={f('rating')}>
                <option value="">—</option>
                {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n} {'★'.repeat(n)}</option>)}
              </select>
            </div>
          </div>

          <label {...lbl}>Задачи / описание работ</label>
          <textarea {...inp} rows={2} value={form.task_description} onChange={f('task_description')} style={{ ...inp.style, resize: 'vertical' }} />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label {...lbl}>Дата привлечения</label>
              <input {...inp} type="date" value={form.valid_from} onChange={f('valid_from')} />
            </div>
            <div>
              <label {...lbl}>Плановый вывод</label>
              <input {...inp} type="date" value={form.valid_to} onChange={f('valid_to')} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label {...lbl}>Статус работы</label>
              <select {...inp} value={form.work_status} onChange={f('work_status')}>
                {WORK_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label {...lbl}>Статус продления</label>
              <select {...inp} value={form.extension_status} onChange={f('extension_status')}>
                {EXT_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          {form.extension_status && form.extension_status !== 'Нет' && (
            <>
              <label {...lbl}>Комментарий по продлению</label>
              <input {...inp} value={form.extension_comment} onChange={f('extension_comment')} placeholder="Например: На согласовании у ПМ" />
            </>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label {...lbl}>Базовая ставка (час) ₽</label>
              <input {...inp} type="number" min="0" value={form.hourly_rate} onChange={f('hourly_rate')} />
            </div>
            <div>
              <label {...lbl}>№ в таблице</label>
              <input {...inp} type="number" min="1" value={form.display_order} onChange={f('display_order')} placeholder="авто" />
            </div>
          </div>

          <label {...lbl}>PM (ответственный)</label>
          <input {...inp} value={form.pm_name} onChange={f('pm_name')} />

          <label {...lbl}>Комментарий</label>
          <textarea {...inp} rows={2} value={form.comment} onChange={f('comment')} style={{ ...inp.style, resize: 'vertical' }} />

          <div style={{ marginTop: 18, display: 'flex', gap: 10 }}>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Сохранение…' : 'Сохранить'}
            </button>
            <button type="button" className="btn btn-secondary" onClick={onClose}>Отмена</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── InvoiceModal ─────────────────────────────────────────────────────────────

function InvoiceModal({ staffer, month, year, expense, saving, onClose, onSave, onUploadFile, onDeleteFile }) {
  const [form, setForm] = useState({
    invoice_text:   expense?.invoice_text || '',
    invoice_link:   expense?.invoice_link || '',
    invoice_status: expense?.invoice_status || '',
    comment:        expense?.comment || '',
  })
  const fileRef = useRef()

  function f(field) { return e => setForm(p => ({ ...p, [field]: e.target.value })) }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={onClose}
    >
      <div
        style={{ background: 'var(--surface)', borderRadius: 10, width: 500, maxHeight: '85vh', overflow: 'auto', boxShadow: 'var(--shadow-md)', padding: 24 }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>Счёт — {MONTHS_FULL[month - 1]} {year}</div>
          <button type="button" className="btn btn-ghost btn-icon" onClick={onClose} style={{ fontSize: 16 }}>✕</button>
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 16 }}>{staffer.full_name}</div>

        <label className="label">Номер / описание счёта</label>
        <input className="input" style={{ marginTop: 3 }} placeholder="Акт №123 от 15.01.2026" value={form.invoice_text} onChange={f('invoice_text')} />

        <label className="label" style={{ marginTop: 12, display: 'block' }}>Ссылка на счёт (URL)</label>
        <input className="input" style={{ marginTop: 3 }} placeholder="https://…" value={form.invoice_link} onChange={f('invoice_link')} />

        <label className="label" style={{ marginTop: 12, display: 'block' }}>Статус счёта</label>
        <select className="input" style={{ marginTop: 3 }} value={form.invoice_status} onChange={f('invoice_status')}>
          <option value="">— выберите —</option>
          {INVOICE_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>

        <label className="label" style={{ marginTop: 12, display: 'block' }}>Комментарий</label>
        <textarea className="input" rows={2} style={{ marginTop: 3, resize: 'vertical' }} value={form.comment} onChange={f('comment')} />

        {/* File attachments */}
        <div style={{ marginTop: 18, borderTop: '1px solid var(--border)', paddingTop: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', marginBottom: 8 }}>Прикреплённые файлы</div>
          {expense?.invoice_files?.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
              {expense.invoice_files.map(f => (
                <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--surface2)', padding: '6px 10px', borderRadius: 6 }}>
                  <span style={{ fontSize: 18 }}>📄</span>
                  <a
                    href={stafferInvoiceFileDownloadUrl(f.id)}
                    target="_blank"
                    rel="noreferrer"
                    style={{ fontSize: 12, color: 'var(--accent)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                  >
                    {f.filename}
                  </a>
                  <button type="button" className="btn btn-danger btn-sm" onClick={() => onDeleteFile(f.id)}>✕</button>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 10 }}>Файлы не прикреплены</div>
          )}

          {expense ? (
            <>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => fileRef.current?.click()}
              >
                + Загрузить PDF
              </button>
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,.png,.jpg,.jpeg"
                style={{ display: 'none' }}
                onChange={e => {
                  const file = e.target.files?.[0]
                  if (file) onUploadFile(expense.id, file)
                  e.target.value = ''
                }}
              />
            </>
          ) : (
            <div style={{ fontSize: 11, color: 'var(--text-3)' }}>Сохраните данные счёта, чтобы прикрепить файл.</div>
          )}
        </div>

        <div style={{ marginTop: 20, display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Отмена</button>
          <button type="button" className="btn btn-primary" disabled={saving} onClick={() => onSave(form)}>
            {saving ? 'Сохранение…' : 'Сохранить'}
          </button>
        </div>
      </div>
    </div>
  )
}
