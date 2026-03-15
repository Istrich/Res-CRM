import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getEmployee, updateEmployee, deleteEmployee,
  upsertSalary, deleteSalary,
  createAssignment, updateAssignment, deleteAssignment,
  getProjects,
} from '../api'
import { useYearStore } from '../store/year'
import { MONTHS, fmt, fmtDate } from '../utils'
import Modal from '../components/ui/Modal'
import Confirm from '../components/ui/Confirm'
import { EmployeeForm } from './EmployeesPage'

export default function EmployeeDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { year } = useYearStore()

  const [editModal, setEditModal] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [salaryModal, setSalaryModal] = useState(null) // { month } | null
  const [assignModal, setAssignModal] = useState(false)
  const [salaryForm, setSalaryForm] = useState({ salary: 0, kpi_bonus: 0, fixed_bonus: 0, one_time_bonus: 0 })
  const [editForm, setEditForm] = useState(null)

  const { data: emp, isLoading } = useQuery({
    queryKey: ['employee', id],
    queryFn: () => getEmployee(id),
  })

  useEffect(() => {
    if (emp && !editForm) setEditForm({
      first_name: emp.first_name || '',
      last_name: emp.last_name || '',
      middle_name: emp.middle_name || '',
      title: emp.title || '',
      department: emp.department || '',
      specialization: emp.specialization || '',
      comment: emp.comment || '',
      hire_date: emp.hire_date || '',
      termination_date: emp.termination_date || '',
    })
  }, [emp])

  const updateMut = useMutation({
    mutationFn: (data) => updateEmployee(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['employee', id] }); setEditModal(false) },
  })

  const deleteMut = useMutation({
    mutationFn: () => deleteEmployee(id),
    onSuccess: () => navigate('/employees'),
  })

  const salarySaveMut = useMutation({
    mutationFn: ({ month, data }) => upsertSalary(id, year, month, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['employee', id] }); setSalaryModal(null) },
  })

  const deleteAssignMut = useMutation({
    mutationFn: deleteAssignment,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['employee', id] }),
  })

  if (isLoading) return <div style={{ padding: 40, textAlign: 'center' }}><span className="spinner" /></div>
  if (!emp) return <div>Не найдено</div>

  const salaryByMonth = {}
  emp.salary_records?.forEach(r => { if (r.year === year) salaryByMonth[r.month] = r })

  const isTerminated = emp.termination_date && new Date(emp.termination_date) < new Date()

  return (
    <div>
      {/* Back + actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <button className="btn btn-ghost btn-sm" onClick={() => navigate('/employees')}>← Назад</button>
        <div style={{ flex: 1 }} />
        <button className="btn btn-secondary" onClick={() => { setEditForm({ ...emp }); setEditModal(true) }}>✏ Редактировать</button>
        <button className="btn btn-danger btn-sm" onClick={() => setDeleteConfirm(true)}>🗑 Удалить</button>
      </div>

      {/* Header card */}
      <div className="card" style={{ padding: '20px 24px', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
          <div style={{
            width: 52, height: 52, borderRadius: '50%',
            background: emp.is_position ? 'var(--amber-light)' : 'var(--accent-light)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 22, flexShrink: 0,
          }}>
            {emp.is_position ? '📋' : '👤'}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <span style={{ fontSize: 20, fontWeight: 700 }}>{emp.display_name}</span>
              {emp.is_position
                ? <span className="badge badge-amber">Позиция</span>
                : isTerminated
                  ? <span className="badge badge-gray">Уволен</span>
                  : <span className="badge badge-green">Активен</span>
              }
              {!emp.has_projects && <span className="badge badge-amber">⚠ без проекта</span>}
            </div>
            <div style={{ fontSize: 14, color: 'var(--text-2)' }}>{emp.title}</div>
            <div style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 4 }}>
              {[emp.department, emp.specialization].filter(Boolean).join(' · ')}
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 20px', fontSize: 13 }}>
            <span className="text-muted">Найм:</span><span>{fmtDate(emp.hire_date)}</span>
            <span className="text-muted">Увольнение:</span>
            <span style={{ color: isTerminated ? 'var(--red)' : emp.termination_date ? 'var(--amber)' : 'inherit' }}>
              {fmtDate(emp.termination_date)}
            </span>
          </div>
        </div>
        {emp.comment && (
          <div style={{ marginTop: 12, padding: '10px 14px', background: 'var(--surface2)', borderRadius: 6, fontSize: 13, color: 'var(--text-2)' }}>
            {emp.comment}
          </div>
        )}
      </div>

      {/* Assignments */}
      <div className="card" style={{ padding: '16px 20px', marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div className="fw-600">Проекты</div>
          <button className="btn btn-secondary btn-sm" onClick={() => setAssignModal(true)}>+ Добавить в проект</button>
        </div>
        {emp.assignments.length === 0
          ? <div className="text-muted text-small">Не привязан ни к одному проекту</div>
          : <table>
            <thead>
              <tr>
                <th className="th">Проект</th>
                <th className="th">Ставка</th>
                <th className="th">С</th>
                <th className="th">По</th>
                <th className="th" />
              </tr>
            </thead>
            <tbody>
              {emp.assignments.map(a => (
                <tr key={a.id}>
                  <td className="td fw-500">{a.project_name}</td>
                  <td className="td">{a.rate}</td>
                  <td className="td text-muted">{fmtDate(a.valid_from)}</td>
                  <td className="td text-muted">{a.valid_to ? fmtDate(a.valid_to) : 'по сей день'}</td>
                  <td className="td">
                    <button className="btn btn-ghost btn-sm" onClick={() => deleteAssignMut.mutate(a.id)}>✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        }
      </div>

      {/* Salary table */}
      <div className="card" style={{ padding: '16px 20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div className="fw-600">Вознаграждение {year}</div>
          <div className="text-muted text-small">Нажмите на месяц для редактирования</div>
        </div>
        <div className="overflow-table">
          <table>
            <thead>
              <tr>
                <th className="th">Компонент</th>
                {MONTHS.map((m, i) => (
                  <th className="th text-right" key={i} style={{ minWidth: 80 }}>{m}</th>
                ))}
                <th className="th text-right">Итого</th>
              </tr>
            </thead>
            <tbody>
              {[
                { key: 'salary', label: 'Оклад' },
                { key: 'kpi_bonus', label: 'KPI' },
                { key: 'fixed_bonus', label: 'Фикс. надбавка' },
                { key: 'one_time_bonus', label: 'Разовая премия' },
                { key: 'total', label: 'Итого', bold: true },
              ].map(({ key, label, bold }) => (
                <tr key={key}>
                  <td className="td" style={{ fontWeight: bold ? 600 : 400 }}>{label}</td>
                  {MONTHS.map((_, i) => {
                    const rec = salaryByMonth[i + 1]
                    const val = rec ? rec[key] : null
                    return (
                      <td
                        className="td text-right"
                        key={i}
                        style={{ cursor: key !== 'total' ? 'pointer' : 'default', fontWeight: bold ? 600 : 400 }}
                        onClick={() => {
                          if (key === 'total') return
                          const existing = salaryByMonth[i + 1]
                          setSalaryForm({
                            salary: existing?.salary ?? 0,
                            kpi_bonus: existing?.kpi_bonus ?? 0,
                            fixed_bonus: existing?.fixed_bonus ?? 0,
                            one_time_bonus: existing?.one_time_bonus ?? 0,
                          })
                          setSalaryModal({ month: i + 1 })
                        }}
                      >
                        {val != null && val !== 0 ? fmt(val) : <span className="text-muted">—</span>}
                      </td>
                    )
                  })}
                  <td className="td text-right" style={{ fontWeight: 600 }}>
                    {fmt(Object.values(salaryByMonth).reduce((s, r) => s + (r[key] || 0), 0))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit modal */}
      {editModal && editForm && (
        <Modal
          title="Редактировать"
          onClose={() => setEditModal(false)}
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setEditModal(false)}>Отмена</button>
              <button className="btn btn-primary" onClick={() => updateMut.mutate(editForm)} disabled={updateMut.isPending}>
                {updateMut.isPending ? <span className="spinner" /> : 'Сохранить'}
              </button>
            </>
          }
        >
          <EmployeeForm form={editForm} setForm={setEditForm} />
        </Modal>
      )}

      {/* Salary modal */}
      {salaryModal && (
        <SalaryModal
          month={salaryModal.month}
          year={year}
          form={salaryForm}
          setForm={setSalaryForm}
          onSave={() => salarySaveMut.mutate({ month: salaryModal.month, data: salaryForm })}
          onClose={() => setSalaryModal(null)}
          loading={salarySaveMut.isPending}
        />
      )}

      {/* Add assignment modal */}
      {assignModal && (
        <AddAssignmentModal
          employeeId={id}
          onClose={() => setAssignModal(false)}
          onDone={() => { qc.invalidateQueries(['employee', id]); setAssignModal(false) }}
        />
      )}

      {/* Delete confirm */}
      {deleteConfirm && (
        <Confirm
          message={`Удалить «${emp.display_name}»? Все данные будут удалены безвозвратно.`}
          onConfirm={() => deleteMut.mutate()}
          onCancel={() => setDeleteConfirm(false)}
          loading={deleteMut.isPending}
        />
      )}
    </div>
  )
}

function SalaryModal({ month, year, form, setForm, onSave, onClose, loading }) {
  const f = (field) => (e) => setForm({ ...form, [field]: Number(e.target.value) })
  const total = (form.salary || 0) + (form.kpi_bonus || 0) + (form.fixed_bonus || 0) + (form.one_time_bonus || 0)

  return (
    <Modal
      title={`Вознаграждение — ${MONTHS[month - 1]} ${year}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>Отмена</button>
          <button className="btn btn-primary" onClick={onSave} disabled={loading}>
            {loading ? <span className="spinner" /> : 'Сохранить'}
          </button>
        </>
      }
    >
      <div className="grid-2">
        <div className="form-group">
          <label className="label">Оклад (gross)</label>
          <input className="input" type="number" value={form.salary} onChange={f('salary')} />
        </div>
        <div className="form-group">
          <label className="label">KPI премия</label>
          <input className="input" type="number" value={form.kpi_bonus} onChange={f('kpi_bonus')} />
        </div>
        <div className="form-group">
          <label className="label">Фикс. надбавка</label>
          <input className="input" type="number" value={form.fixed_bonus} onChange={f('fixed_bonus')} />
        </div>
        <div className="form-group">
          <label className="label">Разовая премия</label>
          <input className="input" type="number" value={form.one_time_bonus} onChange={f('one_time_bonus')} />
        </div>
      </div>
      <div style={{ textAlign: 'right', fontWeight: 600, fontSize: 15 }}>
        Итого: {fmt(total)} ₽
      </div>
    </Modal>
  )
}

function AddAssignmentModal({ employeeId, onClose, onDone }) {
  const [projectId, setProjectId] = useState('')
  const [rate, setRate] = useState(1)
  const [validFrom, setValidFrom] = useState(new Date().toISOString().slice(0, 10))
  const [validTo, setValidTo] = useState('')
  const [error, setError] = useState('')

  const { data: projects = [] } = useQuery({ queryKey: ['projects-list'], queryFn: () => getProjects() })

  const mut = useMutation({
    mutationFn: createAssignment,
    onSuccess: onDone,
    onError: (e) => setError(e.response?.data?.detail || 'Ошибка'),
  })

  return (
    <Modal
      title="Добавить в проект"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>Отмена</button>
          <button
            className="btn btn-primary"
            disabled={!projectId || mut.isPending}
            onClick={() => mut.mutate({ employee_id: employeeId, project_id: projectId, rate: Number(rate), valid_from: validFrom, valid_to: validTo || null })}
          >
            {mut.isPending ? <span className="spinner" /> : 'Сохранить'}
          </button>
        </>
      }
    >
      {error && <div className="alert alert-error">{error}</div>}
      <div className="form-group">
        <label className="label">Проект *</label>
        <select className="select" style={{ width: '100%' }} value={projectId} onChange={e => setProjectId(e.target.value)}>
          <option value="">— выберите проект —</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
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
