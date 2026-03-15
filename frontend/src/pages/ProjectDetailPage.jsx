import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getProject, updateProject, deleteProject,
  getProjectEmployees, removeEmployeeFromProject,
  getProjectBudget, getEmployees, createAssignment,
  getBudgetProjects,
} from '../api'
import { useYearStore } from '../store/year'
import { fmt, fmtDate, MONTHS, statusLabel, statusColor } from '../utils'
import Modal from '../components/ui/Modal'
import Confirm from '../components/ui/Confirm'

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

  const { data: project } = useQuery({
    queryKey: ['project', id, year],
    queryFn: () => getProject(id, { year }),
  })

  useEffect(() => {
    if (project && !editForm) setEditForm({ name: project.name, budget_project_id: project.budget_project_id || '' })
  }, [project])

  const { data: members = [] } = useQuery({
    queryKey: ['project-employees', id],
    queryFn: () => getProjectEmployees(id),
  })

  const { data: budget } = useQuery({
    queryKey: ['project-budget', id, year],
    queryFn: () => getProjectBudget(id, year),
  })

  const { data: budgetProjects = [] } = useQuery({
    queryKey: ['budget-projects-list'],
    queryFn: getBudgetProjects,
  })

  const updateMut = useMutation({
    mutationFn: (data) => updateProject(id, data),
    onSuccess: () => { qc.invalidateQueries(['project', id]); setEditModal(false) },
  })

  const deleteMut = useMutation({
    mutationFn: () => deleteProject(id),
    onSuccess: () => navigate('/projects'),
  })

  const removeMut = useMutation({
    mutationFn: ({ assignmentId }) => removeEmployeeFromProject(id, assignmentId),
    onSuccess: () => { qc.invalidateQueries(['project-employees', id]); setRemoveTarget(null) },
  })

  if (!project) return <div style={{ padding: 40, textAlign: 'center' }}><span className="spinner" /></div>

  const statusBadgeStyle = { background: `${statusColor(budget?.status)}20`, color: statusColor(budget?.status) }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <button className="btn btn-ghost btn-sm" onClick={() => navigate('/projects')}>← Назад</button>
        <div style={{ flex: 1 }} />
        <button className="btn btn-secondary" onClick={() => setEditModal(true)}>✏ Редактировать</button>
        <button className="btn btn-danger btn-sm" onClick={() => setDeleteConfirm(true)}>🗑</button>
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

      {/* Monthly budget breakdown */}
      {budget?.monthly?.length > 0 && (
        <div className="card" style={{ padding: '16px 20px', marginBottom: 20 }}>
          <div className="fw-600" style={{ marginBottom: 12 }}>Расходы по месяцам {year}</div>
          <div className="overflow-table">
            <table>
              <thead>
                <tr>
                  {MONTHS.map((m, i) => <th className="th text-right" key={i}>{m}</th>)}
                  <th className="th text-right fw-600">Итого</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  {budget.monthly.map(s => (
                    <td className="td text-right" key={s.month} style={{ color: s.is_forecast ? 'var(--text-3)' : 'inherit' }}>
                      {fmt(s.amount)}
                    </td>
                  ))}
                  <td className="td text-right fw-600">{fmt(budget.forecast)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="text-small text-muted" style={{ marginTop: 8 }}>
            Серым — прогноз. Последний расчёт: {budget.last_calculated_at ? new Date(budget.last_calculated_at).toLocaleString('ru-RU') : '—'}
          </div>
        </div>
      )}

      {/* Members table */}
      <div className="card" style={{ padding: '16px 20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div className="fw-600">Участники ({members.length})</div>
          <button className="btn btn-secondary btn-sm" onClick={() => setAddEmpModal(true)}>+ Добавить сотрудника</button>
        </div>
        {members.length === 0
          ? <div className="text-muted text-small">Нет участников</div>
          : <table>
            <thead>
              <tr>
                <th className="th">Сотрудник / Позиция</th>
                <th className="th">Должность</th>
                <th className="th">Подразделение</th>
                <th className="th text-right">Ставка</th>
                <th className="th">С</th>
                <th className="th">По</th>
                <th className="th" />
              </tr>
            </thead>
            <tbody>
              {members.map(m => (
                <tr key={m.assignment_id}>
                  <td className="td">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {m.is_position
                        ? <span className="badge badge-amber">Позиция</span>
                        : <span className="badge badge-blue">Сотрудник</span>
                      }
                      <span className="fw-500">{m.display_name}</span>
                    </div>
                  </td>
                  <td className="td">{m.title}</td>
                  <td className="td text-muted">{m.department || '—'}</td>
                  <td className="td text-right">{m.rate}</td>
                  <td className="td text-muted">{fmtDate(m.valid_from)}</td>
                  <td className="td text-muted">{m.valid_to ? fmtDate(m.valid_to) : 'по сей день'}</td>
                  <td className="td">
                    <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setRemoveTarget(m)}>✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        }
      </div>

      {editModal && editForm && (
        <Modal title="Редактировать проект" onClose={() => setEditModal(false)}
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setEditModal(false)}>Отмена</button>
              <button className="btn btn-primary" onClick={() => updateMut.mutate({ ...editForm, budget_project_id: editForm.budget_project_id || null })} disabled={updateMut.isPending}>
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
          onDone={() => { qc.invalidateQueries(['project-employees', id]); setAddEmpModal(false) }}
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
          <button className="btn btn-secondary" onClick={onClose}>Отмена</button>
          <button className="btn btn-primary" disabled={!employeeId || mut.isPending}
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
        </div>
      </div>
    </Modal>
  )
}
