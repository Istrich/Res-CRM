import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getProject, updateProject, deleteProject,
  getProjectEmployees, removeEmployeeFromProject, setAssignmentRate, updateAssignment,
  getProjectBudget, getEmployees, createAssignment,
  getBudgetProjects, getProjectMonthPlan, putProjectMonthPlan,
} from '../api'
import { useYearStore } from '../store/year'
import { fmt, fmtDate, MONTHS, statusLabel, statusColor } from '../utils'
import Modal from '../components/ui/Modal'
import Confirm from '../components/ui/Confirm'
import MembersTable from '../components/MembersTable'

export default function ProjectDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { year } = useYearStore()

  const [editModal, setEditModal] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [addEmpModal, setAddEmpModal] = useState(false)
  const [removeTarget, setRemoveTarget] = useState(null)
  const [editForm, setEditForm] = useState(null)
  const [rateWarning, setRateWarning] = useState(null) // { displayName, monthName, total }
  const [monthPlanDraft, setMonthPlanDraft] = useState(null)
  const [monthPlanSaving, setMonthPlanSaving] = useState(false)

  const { data: project } = useQuery({
    queryKey: ['project', id, year],
    queryFn: () => getProject(id, { year }),
  })

  useEffect(() => {
    if (project && !editForm) setEditForm({ name: project.name, budget_project_id: project.budget_project_id || '' })
  }, [project])

  const { data: members = [] } = useQuery({
    queryKey: ['project-employees', id, year],
    queryFn: () => getProjectEmployees(id, year != null ? { year } : {}),
  })

  const { data: budget } = useQuery({
    queryKey: ['project-budget', id, year],
    queryFn: () => getProjectBudget(id, year),
  })

  const { data: budgetProjects = [] } = useQuery({
    queryKey: ['budget-projects-list'],
    queryFn: getBudgetProjects,
  })

  const { data: projectMonthPlanData } = useQuery({
    queryKey: ['project-month-plan', id, year],
    queryFn: () => getProjectMonthPlan(id, year),
    enabled: Boolean(id && year),
  })

  useEffect(() => {
    if (monthPlanDraft === null && (projectMonthPlanData?.items?.length || budget?.monthly_plan?.length)) {
      const src = projectMonthPlanData?.items || budget?.monthly_plan || []
      const arr = Array(12).fill(0)
      src.forEach(({ month, amount }) => { if (month >= 1 && month <= 12) arr[month - 1] = amount })
      setMonthPlanDraft(arr)
    }
  }, [projectMonthPlanData?.items, budget?.monthly_plan, monthPlanDraft])

  function distributeProjectPlanEvenly() {
    const total = monthPlanDraft
      ? monthPlanDraft.reduce((s, v) => s + (Number(v) || 0), 0)
      : 0
    if (total <= 0) return
    const perMonth = Math.round((total / 12) * 100) / 100
    const rest = Math.round((total - perMonth * 12) * 100) / 100
    setMonthPlanDraft(Array(12).fill(perMonth).map((v, i) => (i === 0 ? v + rest : v)))
  }

  async function saveProjectMonthPlan() {
    if (!monthPlanDraft || monthPlanDraft.length !== 12) return
    setMonthPlanSaving(true)
    try {
      const items = monthPlanDraft.map((amount, i) => ({ month: i + 1, amount: Number(amount) || 0 }))
      await putProjectMonthPlan(id, year, items)
      qc.invalidateQueries({ queryKey: ['project-budget', id, year] })
      qc.invalidateQueries({ queryKey: ['project-month-plan', id, year] })
    } catch (e) {
      alert(e.response?.data?.detail || 'Не удалось сохранить план проекта')
    } finally {
      setMonthPlanSaving(false)
    }
  }

  const updateMut = useMutation({
    mutationFn: (data) => updateProject(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['project', id, year] }); setEditModal(false) },
  })

  const deleteMut = useMutation({
    mutationFn: () => deleteProject(id),
    onSuccess: () => navigate('/projects'),
    onError: (e) => { alert(e.response?.data?.detail || 'Не удалось удалить проект') },
  })

  const removeMut = useMutation({
    mutationFn: ({ assignmentId }) => removeEmployeeFromProject(id, assignmentId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project-employees', id, year] })
      qc.invalidateQueries({ queryKey: ['project-budget', id, year] })
      setRemoveTarget(null)
    },
  })

  const setRateMut = useMutation({
    mutationFn: ({ assignmentId, month, rate }) => setAssignmentRate({ assignmentId, year, month, rate }),
    onSuccess: (data, { displayName, month: monthNum }) => {
      qc.invalidateQueries({ queryKey: ['project-employees', id, year] })
      qc.invalidateQueries({ queryKey: ['project-budget', id, year] })
      const total = data?.total_rate_in_month
      if (total != null && (total < 1 || total > 1)) {
        setRateWarning({
          displayName: displayName || 'Сотрудник',
          monthName: MONTHS[monthNum - 1] || monthNum,
          total,
        })
      } else {
        setRateWarning(null)
      }
    },
  })

  const updateBaseRateMut = useMutation({
    mutationFn: ({ assignmentId, rate }) => updateAssignment(assignmentId, { rate }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project-employees', id, year] })
      qc.invalidateQueries({ queryKey: ['project-budget', id, year] })
    },
  })

  const updateAssignmentDatesMut = useMutation({
    mutationFn: ({ assignmentId, valid_from, valid_to }) =>
      updateAssignment(assignmentId, { ...(valid_from !== undefined && { valid_from }), ...(valid_to !== undefined && { valid_to }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project-employees', id, year] })
      qc.invalidateQueries({ queryKey: ['project-budget', id, year] })
    },
  })

  if (!project) return <div style={{ padding: 40, textAlign: 'center' }}><span className="spinner" /></div>

  const statusBadgeStyle = { background: `${statusColor(budget?.status)}20`, color: statusColor(budget?.status) }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => navigate('/projects')}>← Назад</button>
        <div style={{ flex: 1 }} />
        <button type="button" className="btn btn-secondary" onClick={() => setEditModal(true)}>✏ Редактировать</button>
        <button type="button" className="btn btn-danger btn-sm" onClick={() => setDeleteConfirm(true)}>🗑</button>
      </div>

      {/* Header */}
      <div className="card" style={{ padding: '20px 24px', marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>{project.name}</div>
            <div style={{ fontSize: 13, color: 'var(--text-2)' }}>
              📁 {project.budget_project_name || 'Без бюджетного проекта'}
            </div>
          </div>
          {budget && (
            <span className="badge" style={statusBadgeStyle}>{statusLabel(budget.status)}</span>
          )}
        </div>

        {budget && (
          <div className="grid-4" style={{ marginTop: 20 }}>
            {[
              { label: 'Сотрудников', value: project.employee_count },
              { label: 'Расход факт', value: fmt(budget.spent) + ' ₽' },
              { label: 'Прогноз год', value: fmt(budget.forecast) + ' ₽' },
              { label: 'Остаток', value: budget.remaining != null ? fmt(budget.remaining) + ' ₽' : '—' },
            ].map(({ label, value }) => (
              <div key={label} className="stat-card">
                <div className="stat-value" style={{ fontSize: 18 }}>{value}</div>
                <div className="stat-label">{label}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Monthly budget breakdown: plan, fact, deviation */}
      {budget?.monthly?.length > 0 && (
        <div className="card" style={{ padding: '16px 20px', marginBottom: 20 }}>
          <div className="fw-600" style={{ marginBottom: 12 }}>Расходы по месяцам {year}</div>
          {year && (
            <div className="text-small text-muted" style={{ marginBottom: 8 }}>
              Если задать помесячный план ниже, он будет иметь приоритет над планом бюджетного проекта.
            </div>
          )}
          <div className="overflow-table">
            <table>
              <thead>
                <tr>
                  <th className="th"> </th>
                  {MONTHS.map((m, i) => <th className="th text-right" key={i} style={i === new Date().getMonth() ? { background: '#fef9c3' } : undefined}>{m}</th>)}
                  <th className="th text-right fw-600">Итого</th>
                </tr>
              </thead>
              <tbody>
                {budget.monthly_plan && budget.monthly_plan.length === 12 && (
                  <tr>
                    <td className="td fw-500">План</td>
                    {budget.monthly_plan.map(p => (
                      <td className="td text-right" key={p.month}>{fmt(p.amount)}</td>
                    ))}
                    <td className="td text-right fw-600">{fmt(budget.monthly_plan.reduce((s, p) => s + (p?.amount || 0), 0))}</td>
                  </tr>
                )}
                <tr>
                  <td className="td fw-500">Факт / прогноз</td>
                  {[1,2,3,4,5,6,7,8,9,10,11,12].map(month => {
                    const s = budget.monthly?.find(m => m.month === month)
                    return (
                      <td className="td text-right" key={month} style={{ color: s?.is_forecast ? 'var(--text-3)' : 'inherit' }}>
                        {s ? fmt(s.amount) : '—'}
                      </td>
                    )
                  })}
                  <td className="td text-right fw-600">{fmt(budget.forecast)}</td>
                </tr>
                {budget.monthly_diff && budget.monthly_diff.length === 12 && (
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
                )}
              </tbody>
            </table>
          </div>
          <div className="text-small text-muted" style={{ marginTop: 8 }}>
            Серым — прогноз. Последний расчёт: {budget.last_calculated_at ? new Date(budget.last_calculated_at).toLocaleString('ru-RU') : '—'}
          </div>

          {/* Project-level plan editor */}
          {year != null && (
            <div style={{ marginTop: 16 }}>
              <div className="fw-600" style={{ marginBottom: 8 }}>План проекта по месяцам</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                {MONTHS.map((label, i) => (
                  <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ minWidth: 28, fontSize: 12 }}>{label}</span>
                    <input
                      type="number"
                      className="input"
                      style={{ width: 88 }}
                      value={monthPlanDraft?.[i] ?? (projectMonthPlanData?.items?.[i]?.amount ?? '')}
                      onChange={e => {
                        const v = e.target.value
                        setMonthPlanDraft(prev => {
                          const base = prev || (projectMonthPlanData?.items
                            ? projectMonthPlanData.items.map(p => p.amount)
                            : Array(12).fill(0))
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
                <button type="button" className="btn btn-secondary btn-sm" onClick={distributeProjectPlanEvenly}>
                  Равномерно
                </button>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={monthPlanSaving || !monthPlanDraft}
                  onClick={saveProjectMonthPlan}
                >
                  {monthPlanSaving ? <span className="spinner" /> : 'Сохранить план проекта'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Members table */}
      <div className="card" style={{ padding: '16px 20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div className="fw-600">Участники ({members.length})</div>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setAddEmpModal(true)}>+ Добавить сотрудника</button>
        </div>
        <div className="text-muted text-small" style={{ marginBottom: 8 }}>
          Нажмите на ставку для редактирования{year != null ? ', по месяцам или базовая' : ''}.
        </div>
        <MembersTable
          members={members}
          year={year}
          withRates={Boolean(year != null && members[0]?.monthly_rates)}
          setRateMut={setRateMut}
          updateBaseRateMut={updateBaseRateMut}
          updateAssignmentDatesMut={updateAssignmentDatesMut}
          setRemoveTarget={setRemoveTarget}
          rateWarning={rateWarning}
          setRateWarning={setRateWarning}
        />
      </div>

      {editModal && editForm && (
        <Modal title="Редактировать проект" onClose={() => setEditModal(false)}
          footer={
            <>
              <button type="button" className="btn btn-secondary" onClick={() => setEditModal(false)}>Отмена</button>
              <button type="button" className="btn btn-primary" onClick={() => updateMut.mutate({ ...editForm, budget_project_id: editForm.budget_project_id || null })} disabled={updateMut.isPending}>
                {updateMut.isPending ? <span className="spinner" /> : 'Сохранить'}
              </button>
            </>
          }
        >
          <div className="form-group">
            <label className="label">Название</label>
            <input className="input" value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} />
          </div>
          <div className="form-group">
            <label className="label">Бюджетный проект</label>
            <select className="select" style={{ width: '100%' }} value={editForm.budget_project_id} onChange={e => setEditForm({ ...editForm, budget_project_id: e.target.value })}>
              <option value="">— не выбрано —</option>
              {budgetProjects.map(bp => <option key={bp.id} value={bp.id}>{bp.name} ({bp.year})</option>)}
            </select>
          </div>
        </Modal>
      )}

      {addEmpModal && (
        <AddEmployeeModal
          projectId={id}
          onClose={() => setAddEmpModal(false)}
          onDone={() => { qc.invalidateQueries({ queryKey: ['project-employees', id, year] }); qc.invalidateQueries({ queryKey: ['project-budget', id, year] }); setAddEmpModal(false) }}
        />
      )}

      {removeTarget && (
        <Confirm
          message={`Убрать «${removeTarget.display_name}» из проекта?`}
          onConfirm={() => removeMut.mutate({ assignmentId: removeTarget.assignment_id })}
          onCancel={() => setRemoveTarget(null)}
          loading={removeMut.isPending}
        />
      )}

      {deleteConfirm && (
        <Confirm
          message={`Удалить проект «${project.name}»?`}
          onConfirm={() => deleteMut.mutate()}
          onCancel={() => setDeleteConfirm(false)}
          loading={deleteMut.isPending}
        />
      )}
    </div>
  )
}

function AddEmployeeModal({ projectId, onClose, onDone }) {
  const [employeeId, setEmployeeId] = useState('')
  const [rate, setRate] = useState(1)
  const [validFrom, setValidFrom] = useState(new Date().toISOString().slice(0, 10))
  const [validTo, setValidTo] = useState('')
  const [error, setError] = useState('')

  const { data: employees = [] } = useQuery({ queryKey: ['employees-list'], queryFn: () => getEmployees() })

  const mut = useMutation({
    mutationFn: createAssignment,
    onSuccess: onDone,
    onError: (e) => setError(e.response?.data?.detail || 'Ошибка'),
  })

  return (
    <Modal title="Добавить участника" onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Отмена</button>
          <button type="button" className="btn btn-primary" disabled={!employeeId || mut.isPending}
            onClick={() => mut.mutate({ employee_id: employeeId, project_id: projectId, rate: Number(rate), valid_from: validFrom, valid_to: validTo || null })}
          >
            {mut.isPending ? <span className="spinner" /> : 'Добавить'}
          </button>
        </>
      }
    >
      {error && <div className="alert alert-error">{error}</div>}
      <div className="form-group">
        <label className="label">Сотрудник / Позиция *</label>
        <select className="select" style={{ width: '100%' }} value={employeeId} onChange={e => setEmployeeId(e.target.value)}>
          <option value="">— выберите —</option>
          {employees.map(e => <option key={e.id} value={e.id}>{e.display_name} — {e.title}</option>)}
        </select>
      </div>
      <div className="grid-3">
        <div className="form-group">
          <label className="label">Ставка</label>
          <input className="input" type="number" step="0.1" min="0.1" value={rate} onChange={e => setRate(e.target.value)} />
        </div>
        <div className="form-group">
          <label className="label">С</label>
          <input className="input" type="date" value={validFrom} onChange={e => setValidFrom(e.target.value)} />
        </div>
        <div className="form-group">
          <label className="label">По</label>
          <input className="input" type="date" value={validTo} onChange={e => setValidTo(e.target.value)} />
          <div className="text-muted text-small" style={{ marginTop: 4 }}>Необязательно; если пусто — по сей день</div>
        </div>
      </div>
    </Modal>
  )
}
