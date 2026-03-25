import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getStaffingBudget, updateStaffingBudget, deleteStaffingBudget,
  getStaffingBudgetMonthPlan, putStaffingBudgetMonthPlan,
  getStaffingBudgetMonthDetail,
} from '../../api'
import { useYearStore } from '../../store/year'
import Confirm from '../../components/ui/Confirm'

const MONTH_NAMES = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек']

function fmt(v) {
  return Number(v || 0).toLocaleString('ru-RU', { maximumFractionDigits: 0 })
}

function deltaColor(delta) {
  if (delta > 0) return 'var(--success, #22c55e)'
  if (delta < 0) return 'var(--danger, #ef4444)'
  return 'var(--text-2)'
}

export default function StaffingBudgetDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { year } = useYearStore()
  const qc = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ name: '', year: '', total_budget: '' })
  const [monthAmounts, setMonthAmounts] = useState(Array(12).fill(''))
  const [showDelete, setShowDelete] = useState(false)

  const { data: budget, isLoading } = useQuery({
    queryKey: ['staffing-budget', id],
    queryFn: () => getStaffingBudget(id),
  })

  const { data: monthPlan = [] } = useQuery({
    queryKey: ['staffing-budget-plan', id, year],
    queryFn: () => getStaffingBudgetMonthPlan(id, year),
    enabled: !!id,
  })

  // Per-month detail: plan + fact from linked staffers
  const { data: monthDetail = [] } = useQuery({
    queryKey: ['staffing-budget-month-detail', id, year],
    queryFn: () => getStaffingBudgetMonthDetail(id, year),
    enabled: !!id,
  })

  // Build per-month map from detail
  const monthMap = useMemo(() => {
    const m = {}
    monthDetail.forEach(d => { m[d.month] = d })
    return m
  }, [monthDetail])

  useEffect(() => {
    if (monthPlan.length > 0) {
      const arr = Array(12).fill('')
      monthPlan.forEach(mp => { arr[mp.month - 1] = String(mp.amount) })
      setMonthAmounts(arr)
    }
  }, [monthPlan])

  useEffect(() => {
    if (budget && !editing) {
      setForm({ name: budget.name, year: String(budget.year), total_budget: budget.total_budget != null ? String(budget.total_budget) : '' })
    }
  }, [budget, editing])

  const updateMut = useMutation({
    mutationFn: (data) => updateStaffingBudget(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['staffing-budget', id] })
      qc.invalidateQueries({ queryKey: ['staffing-budgets'] })
      setEditing(false)
    },
    onError: (e) => alert(e.response?.data?.detail || 'Ошибка сохранения'),
  })

  const deleteMut = useMutation({
    mutationFn: () => deleteStaffingBudget(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['staffing-budgets'] }); navigate('/staffing') },
    onError: (e) => alert(e.response?.data?.detail || 'Ошибка удаления'),
  })

  const savePlanMut = useMutation({
    mutationFn: (items) => putStaffingBudgetMonthPlan(id, year, items),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['staffing-budget-plan', id, year] })
      qc.invalidateQueries({ queryKey: ['staffing-budget-month-detail', id, year] })
      qc.invalidateQueries({ queryKey: ['staffing-budget', id] })
    },
    onError: (e) => alert(e.response?.data?.detail || 'Ошибка сохранения плана'),
  })

  function handleSavePlan() {
    const items = monthAmounts.map((a, i) => ({ month: i + 1, amount: parseFloat(a) || 0 }))
    savePlanMut.mutate(items)
  }

  function distributeEvenly() {
    const total = parseFloat(form.total_budget) || (budget?.total_budget ?? 0)
    const per = (total / 12).toFixed(2)
    setMonthAmounts(Array(12).fill(per))
  }

  if (isLoading) return <div className="spinner" style={{ margin: '40px auto', display: 'block' }} />
  if (!budget) return <div>Бюджет не найден</div>

  const planTotal = monthAmounts.reduce((s, v) => s + (parseFloat(v) || 0), 0)
  const factTotal = budget.fact_total || 0
  const delta = planTotal - factTotal

  return (
    <div style={{ maxWidth: 900 }}>
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => navigate('/staffing')}>← Назад</button>
          <div>
            <div className="page-title">{budget.name}</div>
            <div className="page-subtitle">Бюджет стаффинга · {budget.year}</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {!editing && (
            <button type="button" className="btn btn-secondary" onClick={() => setEditing(true)}>
              Редактировать
            </button>
          )}
          <button type="button" className="btn btn-danger" onClick={() => setShowDelete(true)}>Удалить</button>
        </div>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Общий бюджет', value: budget.total_budget != null ? fmt(budget.total_budget) + ' ₽' : '—' },
          { label: 'План (месячный)', value: fmt(planTotal) + ' ₽' },
          { label: 'Факт', value: fmt(factTotal) + ' ₽' },
          { label: 'Дельта', value: (delta >= 0 ? '+' : '') + fmt(delta) + ' ₽', color: deltaColor(delta) },
        ].map((c, i) => (
          <div key={i} className="stat-card" style={{ textAlign: 'center' }}>
            <div className="stat-value" style={{ color: c.color || 'var(--text)' }}>{c.value}</div>
            <div className="stat-label">{c.label}</div>
          </div>
        ))}
      </div>

      {/* Linked staffers count */}
      {budget.staffer_count != null && (
        <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 16 }}>
          Привязано стафферов: <strong>{budget.staffer_count}</strong>
          {budget.staffer_count === 0 && (
            <span style={{ color: 'var(--amber)', marginLeft: 8 }}>
              ⚠ Привяжите стафферов к бюджету для расчёта факта
            </span>
          )}
        </div>
      )}

      {/* Edit form */}
      {editing && (
        <div className="card" style={{ padding: 16, marginBottom: 20 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label className="label">Название</label>
              <input className="input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="label">Год</label>
              <input className="input" type="number" value={form.year} onChange={e => setForm({ ...form, year: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="label">Общий бюджет</label>
              <input className="input" type="number" value={form.total_budget} onChange={e => setForm({ ...form, total_budget: e.target.value })} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button type="button" className="btn btn-primary" onClick={() => {
              updateMut.mutate({
                name: form.name,
                year: parseInt(form.year, 10),
                total_budget: form.total_budget ? parseFloat(form.total_budget) : null,
              })
            }} disabled={updateMut.isPending}>
              {updateMut.isPending ? <span className="spinner" /> : 'Сохранить'}
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => setEditing(false)}>Отмена</button>
          </div>
        </div>
      )}

      {/* Monthly plan / fact table */}
      <div className="card" style={{ padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: 15 }}>Помесячный план / факт</h3>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn btn-ghost btn-sm" onClick={distributeEvenly}>
              Распределить равномерно
            </button>
            <button type="button" className="btn btn-primary btn-sm" onClick={handleSavePlan} disabled={savePlanMut.isPending}>
              {savePlanMut.isPending ? <span className="spinner" /> : 'Сохранить план'}
            </button>
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table className="table" style={{ width: '100%', fontSize: 12 }}>
            <thead>
              <tr>
                <th style={{ padding: '6px 8px', textAlign: 'left' }}>Месяц</th>
                <th style={{ padding: '6px 8px', textAlign: 'right' }}>План бюджета</th>
                <th style={{ padding: '6px 8px', textAlign: 'right' }}>Факт расходов</th>
                <th style={{ padding: '6px 8px', textAlign: 'right' }}>Итого (факт или план)</th>
                <th style={{ padding: '6px 8px', textAlign: 'right' }}>Дельта</th>
              </tr>
            </thead>
            <tbody>
              {MONTH_NAMES.map((name, i) => {
                const month = i + 1
                const planVal = parseFloat(monthAmounts[i]) || 0
                const md = monthMap[month]
                const factVal = md ? md.fact_amount : 0
                const hasFact = md ? md.has_fact : false
                // "Итого" column: if fact exists, show fact; otherwise show plan
                const effectiveVal = hasFact ? factVal : planVal
                const monthDelta = planVal - effectiveVal

                return (
                  <tr key={month}>
                    <td style={{ padding: '6px 8px', fontWeight: 500 }}>{name}</td>
                    <td style={{ padding: '4px 8px', textAlign: 'right' }}>
                      <input
                        type="number"
                        className="input"
                        style={{ width: 120, textAlign: 'right', padding: '4px 8px', fontSize: 12 }}
                        value={monthAmounts[i]}
                        onChange={e => {
                          const arr = [...monthAmounts]
                          arr[i] = e.target.value
                          setMonthAmounts(arr)
                        }}
                      />
                    </td>
                    <td style={{
                      padding: '6px 8px', textAlign: 'right',
                      color: hasFact ? 'var(--text)' : 'var(--text-3)',
                      fontStyle: hasFact ? 'normal' : 'italic',
                    }}>
                      {hasFact ? fmt(factVal) + ' ₽' : '— нет данных'}
                    </td>
                    <td style={{
                      padding: '6px 8px', textAlign: 'right', fontWeight: 600,
                      color: hasFact ? 'var(--text)' : 'var(--text-3)',
                    }}>
                      {fmt(effectiveVal)} ₽
                      {!hasFact && <span style={{ fontSize: 10, marginLeft: 4, color: 'var(--text-3)' }}>(план)</span>}
                    </td>
                    <td style={{
                      padding: '6px 8px', textAlign: 'right', fontWeight: 500,
                      color: deltaColor(monthDelta),
                    }}>
                      {(monthDelta >= 0 ? '+' : '') + fmt(monthDelta)} ₽
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: '2px solid var(--border)', fontWeight: 700 }}>
                <td style={{ padding: '8px' }}>Итого</td>
                <td style={{ padding: '8px', textAlign: 'right' }}>{fmt(planTotal)} ₽</td>
                <td style={{ padding: '8px', textAlign: 'right' }}>{fmt(factTotal)} ₽</td>
                <td style={{ padding: '8px', textAlign: 'right' }}>
                  {fmt(monthDetail.reduce((s, d) => s + (d.has_fact ? d.fact_amount : (parseFloat(monthAmounts[d.month - 1]) || 0)), 0))} ₽
                </td>
                <td style={{ padding: '8px', textAlign: 'right', color: deltaColor(delta) }}>
                  {(delta >= 0 ? '+' : '') + fmt(delta)} ₽
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Linked staffers list */}
      {budget.staffers && budget.staffers.length > 0 && (
        <div className="card" style={{ padding: 16, marginTop: 16 }}>
          <h3 style={{ margin: '0 0 12px', fontSize: 15 }}>Привязанные стафферы</h3>
          <table className="table" style={{ width: '100%', fontSize: 12 }}>
            <thead>
              <tr>
                <th style={{ padding: '6px 8px' }}>ФИО</th>
                <th style={{ padding: '6px 8px' }}>Проект</th>
                <th style={{ padding: '6px 8px', textAlign: 'right' }}>Ставка ₽/ч</th>
                <th style={{ padding: '6px 8px' }}>Период</th>
              </tr>
            </thead>
            <tbody>
              {budget.staffers.map(s => (
                <tr key={s.id}>
                  <td className="td fw-500">{s.full_name}</td>
                  <td className="td text-muted">{s.project_name || '—'}</td>
                  <td className="td text-right">{Number(s.hourly_rate).toLocaleString('ru-RU')}</td>
                  <td className="td text-muted">
                    {s.valid_from} — {s.valid_to || '∞'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showDelete && (
        <Confirm
          message={`Удалить бюджет «${budget.name}»?`}
          onConfirm={() => deleteMut.mutate()}
          onCancel={() => setShowDelete(false)}
          loading={deleteMut.isPending}
        />
      )}
    </div>
  )
}
