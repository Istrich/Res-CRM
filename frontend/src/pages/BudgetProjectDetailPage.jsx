import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getBudgetProject, updateBudgetProject, deleteBudgetProject,
  getBudgetProjectBudget, getBudgetProjectMonthPlan, putBudgetProjectMonthPlan,
  getBudgetProjectMonthFactForecast, putBudgetProjectMonthFactForecast,
} from '../api'
import { useYearStore } from '../store/year'
import { fmt, MONTHS, statusLabel, statusColor } from '../utils'
import Modal from '../components/ui/Modal'
import Confirm from '../components/ui/Confirm'

export default function BudgetProjectDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { year } = useYearStore()

  const [editModal, setEditModal] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [editForm, setEditForm] = useState(null)
  const [monthPlanDraft, setMonthPlanDraft] = useState(null) // [a1..a12] or null
  const [monthPlanSaving, setMonthPlanSaving] = useState(false)
  const [factForecastEditMode, setFactForecastEditMode] = useState(false)
  const [monthFactDraft, setMonthFactDraft] = useState(null) // [a1..a12] or null
  const [monthFactTouched, setMonthFactTouched] = useState(Array(12).fill(false))
  const [monthFactSaving, setMonthFactSaving] = useState(false)

  const { data: bp, isLoading: bpLoading } = useQuery({
    queryKey: ['budget-project', id, year],
    queryFn: () => getBudgetProject(id, { year }),
  })

  const { data: budget, isLoading: budgetLoading } = useQuery({
    queryKey: ['budget-project-budget', id, year],
    queryFn: () => getBudgetProjectBudget(id, year),
  })
  const { data: monthPlanData } = useQuery({
    queryKey: ['budget-project-month-plan', id, year],
    queryFn: () => getBudgetProjectMonthPlan(id, year),
    enabled: Boolean(id && year),
  })

  const { data: monthFactForecastData } = useQuery({
    queryKey: ['budget-project-month-fact-forecast', id, year],
    queryFn: () => getBudgetProjectMonthFactForecast(id, year),
    enabled: Boolean(id && year && factForecastEditMode),
  })

  useEffect(() => {
    if (bp && !editForm) {
      setEditForm({ name: bp.name, year: bp.year, total_budget: bp.total_budget || '' })
    }
  }, [bp])
  useEffect(() => {
    if (monthPlanDraft === null && (budget?.monthly_plan?.length || monthPlanData?.items?.length)) {
      const src = budget?.monthly_plan || monthPlanData?.items || []
      const arr = Array(12).fill(0)
      src.forEach(({ month, amount }) => { if (month >= 1 && month <= 12) arr[month - 1] = amount })
      setMonthPlanDraft(arr)
    }
  }, [budget?.monthly_plan, monthPlanData?.items, monthPlanDraft])

  useEffect(() => {
    if (!factForecastEditMode) return
    const items = monthFactForecastData?.items
    if (!Array.isArray(items) || items.length !== 12) return
    setMonthFactDraft(items.map(it => String(it.amount)))
    setMonthFactTouched(Array(12).fill(false))
  }, [factForecastEditMode, monthFactForecastData?.items])

  const updateMut = useMutation({
    mutationFn: (data) => updateBudgetProject(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['budget-project', id] })
      qc.invalidateQueries({ queryKey: ['budget-projects'] })
      setEditModal(false)
    },
  })

  const deleteMut = useMutation({
    mutationFn: () => deleteBudgetProject(id),
    onSuccess: () => navigate('/budget-projects'),
    onError: (e) => { alert(e.response?.data?.detail || 'Не удалось удалить') },
  })
  function distributeEvenly() {
    const total = monthPlanDraft
      ? monthPlanDraft.reduce((s, v) => s + (Number(v) || 0), 0)
      : (bp?.total_budget || 0)
    if (total <= 0) return
    const perMonth = Math.round((total / 12) * 100) / 100
    const rest = Math.round((total - perMonth * 12) * 100) / 100
    setMonthPlanDraft(Array(12).fill(perMonth).map((v, i) => (i === 0 ? v + rest : v)))
  }

  async function saveMonthPlan() {
    if (!monthPlanDraft || monthPlanDraft.length !== 12) return
    setMonthPlanSaving(true)
    try {
      const items = monthPlanDraft.map((amount, i) => ({ month: i + 1, amount: Number(amount) || 0 }))
      await putBudgetProjectMonthPlan(id, year, items)
      qc.invalidateQueries({ queryKey: ['budget-project', id] })
      qc.invalidateQueries({ queryKey: ['budget-project-budget', id, year] })
      qc.invalidateQueries({ queryKey: ['budget-project-month-plan', id, year] })
      qc.invalidateQueries({ queryKey: ['budget-projects'] })
    } catch (e) {
      alert(e.response?.data?.detail || 'Не удалось сохранить план')
    } finally {
      setMonthPlanSaving(false)
    }
  }

  async function saveMonthFactForecast() {
    if (!monthFactDraft || monthFactDraft.length !== 12) return
    if (!monthFactForecastData?.items || monthFactForecastData.items.length !== 12) return

    setMonthFactSaving(true)
    try {
      const items = monthFactDraft.map((v, i) => {
        const initial = monthFactForecastData.items[i]
        const touched = monthFactTouched[i]
        const parsed = v === '' ? 0 : Number(v)

        if (touched) {
          return { month: i + 1, amount: Number.isFinite(parsed) ? parsed : 0 }
        }

        if (initial?.is_manual) {
          return { month: i + 1, amount: initial.amount }
        }

        // Keep auto-calculated value by not creating manual override.
        return { month: i + 1, amount: null }
      })

      await putBudgetProjectMonthFactForecast(id, year, items)

      qc.invalidateQueries({ queryKey: ['budget-project-budget', id, year] })
      qc.invalidateQueries({ queryKey: ['budget-project-month-fact-forecast', id, year] })
    } catch (e) {
      alert(e.response?.data?.detail || 'Не удалось сохранить факт/прогноз')
    } finally {
      setMonthFactSaving(false)
      setFactForecastEditMode(false)
    }
  }

  if (bpLoading) return <div style={{ padding: 40, textAlign: 'center' }}><span className="spinner" /></div>
  if (!bp) return <div className="empty-state">Бюджетный проект не найден</div>

  const sc = statusColor(budget?.status)

  return (
    <div>
      {/* Nav */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => navigate('/budget-projects')}>← Назад</button>
        <div style={{ flex: 1 }} />
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setEditForm({ name: bp.name, year: bp.year, total_budget: bp.total_budget || '' }); setEditModal(true) }}>
          ✏ Редактировать
        </button>
        <button type="button" className="btn btn-danger btn-sm" onClick={() => setDeleteConfirm(true)}>🗑</button>
      </div>

      {/* Header card */}
      <div className="card" style={{ padding: '20px 24px', marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>{bp.name}</div>
            <div className="text-muted" style={{ fontSize: 13 }}>Год: {bp.year} · Проектов: {bp.projects_count}</div>
          </div>
          {budget?.status && (
            <span className="badge" style={{ background: sc + '22', color: sc }}>
              {statusLabel(budget.status)}
            </span>
          )}
        </div>

        <div className="grid-4" style={{ marginTop: 20 }}>
          {[
            { label: 'Бюджет на год', value: bp.total_budget ? fmt(bp.total_budget) + ' ₽' : '—' },
            { label: 'Фактический расход', value: fmt(budget?.spent || 0) + ' ₽' },
            { label: 'Прогноз на год', value: fmt(budget?.forecast || 0) + ' ₽' },
            {
              label: 'Остаток',
              value: budget?.remaining != null ? fmt(budget.remaining) + ' ₽' : '—',
              color: budget?.remaining < 0 ? 'var(--red)' : budget?.remaining > 0 ? 'var(--green)' : undefined,
            },
          ].map(({ label, value, color }) => (
            <div key={label} className="stat-card">
              <div className="stat-value" style={{ fontSize: 18, color }}>{value}</div>
              <div className="stat-label">{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Month plan edit */}
      <div className="card" style={{ padding: '16px 20px', marginBottom: 20 }}>
        <div className="fw-600" style={{ marginBottom: 12 }}>План по месяцам ({year})</div>
        <p className="text-muted text-small" style={{ marginBottom: 12 }}>
          Распределите бюджет по месяцам. Годовой бюджет обновится как сумма помесячных планов.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 12 }}>
          {MONTHS.map((label, i) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ minWidth: 28, fontSize: 12 }}>{label}</span>
              <input
                type="number"
                className="input"
                style={{ width: 88 }}
                value={monthPlanDraft?.[i] ?? (budget?.monthly_plan?.[i]?.amount ?? '')}
                onChange={e => {
                  const v = e.target.value
                  setMonthPlanDraft(prev => {
                    const base = prev || (budget?.monthly_plan ? budget.monthly_plan.map(p => p.amount) : Array(12).fill(0))
                    const arr = [...base]
                    arr[i] = v
                    return arr
                  })
                }}
              />
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn btn-secondary btn-sm" onClick={distributeEvenly}>
            Равномерно
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={saveMonthPlan} disabled={monthPlanSaving || !monthPlanDraft}>
            {monthPlanSaving ? <span className="spinner" /> : 'Сохранить план'}
          </button>
        </div>
      </div>

      {/* Manual Fact/Forecast override */}
      <div className="card" style={{ padding: '16px 20px', marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div>
            <div className="fw-600" style={{ marginBottom: 4 }}>Факт / прогноз по месяцам</div>
            <div className="text-muted text-small" style={{ marginBottom: 0 }}>
              {factForecastEditMode ? 'Введите значения вручную — они заменят автосчёт.' : 'Значения берутся из расчёта. Можно переключиться на ручной ввод.'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setFactForecastEditMode(v => !v)}
            >
              {factForecastEditMode ? 'Закрыть' : 'Редактировать'}
            </button>
            {factForecastEditMode && (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={saveMonthFactForecast}
                disabled={monthFactSaving}
              >
                {monthFactSaving ? <span className="spinner" /> : 'Сохранить'}
              </button>
            )}
          </div>
        </div>

        {!factForecastEditMode ? (
          <div className="overflow-table">
            <table>
              <thead>
                <tr>
                  <th className="th">Месяц</th>
                  <th className="th text-right">Факт / прогноз</th>
                </tr>
              </thead>
              <tbody>
                {budget?.monthly_fact?.map((f, i) => (
                  <tr key={i}>
                    <td className="td" style={{ fontWeight: 500 }}>{MONTHS[i]}</td>
                    <td className="td text-right fw-600">{fmt(f.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            {MONTHS.map((label, i) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ minWidth: 28, fontSize: 12 }}>{label}</span>
                <input
                  type="number"
                  className="input"
                  style={{ width: 88 }}
                  value={monthFactDraft?.[i] ?? ''}
                  onChange={e => {
                    const v = e.target.value
                    setMonthFactDraft(prev => {
                      const base = prev || Array(12).fill('0')
                      const arr = [...base]
                      arr[i] = v
                      return arr
                    })
                    setMonthFactTouched(prev => {
                      const arr = [...prev]
                      arr[i] = true
                      return arr
                    })
                  }}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Plan vs Fact by month */}
      {budget?.monthly_diff && budget.monthly_diff.length > 0 && (
        <div className="card" style={{ padding: '16px 20px', marginBottom: 20 }}>
          <div className="fw-600" style={{ marginBottom: 12 }}>План и факт по месяцам</div>
          <div className="overflow-table">
            <table>
              <thead>
                <tr>
                  <th className="th">Месяц</th>
                  {MONTHS.map((m, i) => <th className="th text-right" key={i}>{m}</th>)}
                  <th className="th text-right fw-600">Итого</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="td fw-500">План</td>
                  {budget.monthly_plan?.map(p => (
                    <td className="td text-right" key={p.month}>{fmt(p.amount)}</td>
                  ))}
                  <td className="td text-right fw-600">{fmt(budget.monthly_plan?.reduce((s, p) => s + (p?.amount || 0), 0))}</td>
                </tr>
                <tr>
                  <td className="td fw-500">Факт / прогноз</td>
                  {budget?.monthly_fact?.map(f => (
                    <td className="td text-right" key={f.month}>{fmt(f.amount)}</td>
                  ))}
                  <td className="td text-right fw-600">{fmt(budget.forecast)}</td>
                </tr>
                <tr>
                  <td className="td fw-500">Отклонение</td>
                  {budget.monthly_diff.map(d => (
                    <td className="td text-right" key={d.month} style={{ color: d.diff > 0 ? 'var(--red)' : d.diff < 0 ? 'var(--green)' : undefined }}>
                      {d.diff > 0 ? '+' : ''}{fmt(d.diff)}
                    </td>
                  ))}
                  <td className="td text-right fw-600" style={{ color: budget.remaining != null && budget.remaining < 0 ? 'var(--red)' : budget.remaining > 0 ? 'var(--green)' : undefined }}>
                    {budget.remaining != null ? fmt(budget.remaining) : '—'}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Projects breakdown */}
      {budget?.projects?.length > 0 && (
        <div className="card" style={{ padding: '16px 20px', marginBottom: 20 }}>
          <div className="fw-600" style={{ marginBottom: 14 }}>Проекты</div>
          <table>
            <thead>
              <tr>
                <th className="th">Проект</th>
                <th className="th" style={{ textAlign: 'right' }}>Расход</th>
                <th className="th" style={{ textAlign: 'right' }}>Прогноз</th>
                <th className="th" style={{ textAlign: 'right' }}>Остаток</th>
              </tr>
            </thead>
            <tbody>
              {budget.projects.map(p => (
                (() => {
                  const remaining = (p?.forecast != null && p?.spent != null) ? (p.forecast - p.spent) : null
                  return (
                <tr
                  key={p.project_id}
                  style={{ cursor: 'pointer' }}
                  onClick={() => navigate(`/projects/${p.project_id}`)}
                >
                  <td className="td fw-500">{p.project_name}</td>
                  <td className="td" style={{ textAlign: 'right' }}>{fmt(p.spent)} ₽</td>
                  <td className="td" style={{ textAlign: 'right' }}>{fmt(p.forecast)} ₽</td>
                  <td className="td" style={{ textAlign: 'right' }}>
                    {remaining != null
                      ? <span style={{ color: remaining < 0 ? 'var(--red)' : 'var(--green)' }}>
                          {fmt(remaining)} ₽
                        </span>
                      : '—'}
                  </td>
                </tr>
                  )
                })()
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Monthly totals across all projects */}
      {budget?.projects?.length > 0 && (() => {
        // Aggregate monthly across all sub-projects — we use forecast field
        const months = MONTHS.map((m, i) => {
          const monthNum = i + 1
          // We don't have per-month data here, just totals — show spent / forecast summary
          return { label: m, monthNum }
        })
        return (
          <div className="card" style={{ padding: '16px 20px' }}>
            <div className="fw-600" style={{ marginBottom: 8 }}>
              Итоги по году {year}
            </div>
            <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
              <div>
                <div className="stat-label">Всего проектов</div>
                <div className="fw-600" style={{ fontSize: 18 }}>{budget.projects.length}</div>
              </div>
              <div>
                <div className="stat-label">Суммарный расход</div>
                <div className="fw-600" style={{ fontSize: 18 }}>{fmt(budget.spent)} ₽</div>
              </div>
              <div>
                <div className="stat-label">Суммарный прогноз</div>
                <div className="fw-600" style={{ fontSize: 18 }}>{fmt(budget.forecast)} ₽</div>
              </div>
              {budget.total_budget && (
                <div>
                  <div className="stat-label">Утверждённый бюджет</div>
                  <div className="fw-600" style={{ fontSize: 18 }}>{fmt(budget.total_budget)} ₽</div>
                </div>
              )}
            </div>
          </div>
        )
      })()}

      {/* Edit modal */}
      {editModal && editForm && (
        <Modal
          title="Редактировать бюджетный проект"
          onClose={() => setEditModal(false)}
          footer={
            <>
              <button type="button" className="btn btn-secondary" onClick={() => setEditModal(false)}>Отмена</button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={updateMut.isPending}
                onClick={() => updateMut.mutate({
                  name: editForm.name,
                  year: Number(editForm.year),
                  total_budget: editForm.total_budget ? Number(editForm.total_budget) : null,
                })}
              >
                {updateMut.isPending ? <span className="spinner" /> : 'Сохранить'}
              </button>
            </>
          }
        >
          <div className="form-group">
            <label className="label">Название</label>
            <input className="input" value={editForm.name}
              onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} />
          </div>
          <div className="grid-2">
            <div className="form-group">
              <label className="label">Год</label>
              <input className="input" type="number" value={editForm.year}
                onChange={e => setEditForm(f => ({ ...f, year: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="label">Бюджет (₽)</label>
              <input className="input" type="number" value={editForm.total_budget}
                onChange={e => setEditForm(f => ({ ...f, total_budget: e.target.value }))} />
            </div>
          </div>
        </Modal>
      )}

      {deleteConfirm && (
        <Confirm
          message={`Удалить «${bp.name}»?`}
          onConfirm={() => deleteMut.mutate()}
          onCancel={() => setDeleteConfirm(false)}
          loading={deleteMut.isPending}
        />
      )}
    </div>
  )
}
