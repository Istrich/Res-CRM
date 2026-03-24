import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getStaffingBudget, updateStaffingBudget, deleteStaffingBudget,
  getStaffingBudgetMonthPlan, putStaffingBudgetMonthPlan,
  getStaffingExpensesSummary,
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

  const { data: expSummary = [] } = useQuery({
    queryKey: ['staffing-expenses-summary', year],
    queryFn: () => getStaffingExpensesSummary(year),
  })

  // Fact total = sum of all project facts for the budget's year
  const factTotal = expSummary.reduce((s, e) => s + parseFloat(e.fact_total || 0), 0)

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
    onSuccess: () => qc.invalidateQueries({ queryKey: ['staffing-budget-plan', id, year] }),
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
  const delta = planTotal - factTotal

  return (
    <div style={{ maxWidth: 800 }}>
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
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'План (месячный)', value: fmt(planTotal) },
          { label: 'Факт', value: fmt(factTotal) },
          { label: 'Дельта', value: (delta >= 0 ? '+' : '') + fmt(delta), color: deltaColor(delta) },
        ].map(c => (
          <div key={c.label} className="card" style={{ padding: '12px 16px' }}>
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 4 }}>{c.label}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: c.color || 'inherit' }}>{c.value} ₽</div>
          </div>
        ))}
      </div>

      {/* Edit fields */}
      {editing && (
        <div className="card" style={{ padding: 16, marginBottom: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 12, alignItems: 'flex-end' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="label">Название</label>
              <input className="input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="label">Год</label>
              <input className="input" type="number" value={form.year} onChange={e => setForm({ ...form, year: e.target.value })} />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="label">Общая сумма (₽)</label>
              <input className="input" type="number" min="0" value={form.total_budget} onChange={e => setForm({ ...form, total_budget: e.target.value })} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => updateMut.mutate({ name: form.name, year: parseInt(form.year, 10), total_budget: form.total_budget ? parseFloat(form.total_budget) : null })}
              disabled={!form.name || updateMut.isPending}
            >
              {updateMut.isPending ? <span className="spinner" /> : 'Сохранить'}
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => setEditing(false)}>Отмена</button>
          </div>
        </div>
      )}

      {/* Monthly plan */}
      <div className="card" style={{ padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ fontWeight: 600, fontSize: 13 }}>Помесячный план / факт ({year})</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn btn-ghost btn-sm" onClick={distributeEvenly}>
              Равномерно
            </button>
            <button type="button" className="btn btn-primary btn-sm" onClick={handleSavePlan} disabled={savePlanMut.isPending}>
              {savePlanMut.isPending ? <span className="spinner" /> : 'Сохранить план'}
            </button>
          </div>
        </div>

        <div className="overflow-table">
          <table style={{ width: '100%' }}>
            <thead>
              <tr>
                <th className="th" style={{ width: 80 }}>Месяц</th>
                <th className="th text-right">План ₽</th>
                <th className="th text-right">Факт ₽</th>
                <th className="th text-right">Дельта</th>
              </tr>
            </thead>
            <tbody>
              {MONTH_NAMES.map((name, i) => {
                const planVal = parseFloat(monthAmounts[i]) || 0
                const factMonthTotal = expSummary.reduce((s, e) => s + parseFloat(e.fact_total || 0), 0) / 12
                const d = planVal - factMonthTotal
                return (
                  <tr key={i}>
                    <td className="td">{name}</td>
                    <td className="td text-right" style={{ padding: '4px 6px' }}>
                      <input
                        type="number"
                        min="0"
                        style={{
                          width: 100, textAlign: 'right', padding: '3px 6px',
                          border: '1px solid var(--border)', borderRadius: 4,
                          fontSize: 12, background: 'var(--bg)',
                        }}
                        value={monthAmounts[i]}
                        onChange={e => {
                          const arr = [...monthAmounts]
                          arr[i] = e.target.value
                          setMonthAmounts(arr)
                        }}
                      />
                    </td>
                    <td className="td text-right" style={{ fontSize: 12 }}>{fmt(factMonthTotal)}</td>
                    <td className="td text-right" style={{ fontSize: 12, color: deltaColor(d), fontWeight: 600 }}>
                      {d >= 0 ? '+' : ''}{fmt(d)}
                    </td>
                  </tr>
                )
              })}
              <tr style={{ fontWeight: 700, borderTop: '2px solid var(--border)' }}>
                <td className="td">Итого</td>
                <td className="td text-right">{fmt(planTotal)}</td>
                <td className="td text-right">{fmt(factTotal)}</td>
                <td className="td text-right" style={{ color: deltaColor(delta) }}>
                  {delta >= 0 ? '+' : ''}{fmt(delta)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

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
