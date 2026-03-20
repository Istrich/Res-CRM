import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getEmployee, updateEmployee, deleteEmployee, hireFromPosition,
  upsertSalary, deleteSalary,
  createAssignment, deleteAssignment, setAssignmentRate, updateAssignment,
  getProjects,
} from '../api'
import { useYearStore } from '../store/year'
import { MONTHS, fmt, fmtDate } from '../utils'
import Modal from '../components/ui/Modal'

const POSITION_STATUS_LABELS = {
  awaiting_assignment: 'Ожидает взятия в работу',
  hiring: 'Найм',
  awaiting_start: 'Ожидаем выход',
}
import Confirm from '../components/ui/Confirm'
import EmployeeForm from '../components/EmployeeForm'
import SalaryModal from '../components/SalaryModal'
import AddAssignmentModal from '../components/AddAssignmentModal'
import { MemberRateCell, EditableDateCell } from '../components/MembersTable'

function empToEditForm(emp) {
  return {
    ...emp,
    first_name: emp.first_name || '',
    last_name: emp.last_name || '',
    middle_name: emp.middle_name || '',
    title: emp.title || '',
    department: emp.department || '',
    specialization: emp.specialization || '',
    comment: emp.comment || '',
    hire_date: emp.hire_date || '',
    termination_date: emp.termination_date || '',
    planned_exit_date: emp.planned_exit_date || '',
    planned_salary: emp.planned_salary ?? '',
    position_status: emp.position_status || 'awaiting_assignment',
  }
}

function formatSaveError(err) {
  const d = err?.response?.data?.detail
  if (Array.isArray(d)) {
    return d.map((x) => (typeof x?.msg === 'string' ? x.msg : JSON.stringify(x))).join('; ')
  }
  if (typeof d === 'string') return d
  return err?.message || 'Не удалось сохранить'
}

export default function EmployeeDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { year } = useYearStore()

  const [editModal, setEditModal] = useState(false)
  const [hireModal, setHireModal] = useState(false)
  const [hireForm, setHireForm] = useState({ first_name: '', last_name: '', middle_name: '', hire_date: '', department: '', specialization: '', comment: '' })
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [salaryModal, setSalaryModal] = useState(null) // { month } | null
  const [salaryExtend, setSalaryExtend] = useState({ salary: false, kpi_bonus: false, fixed_bonus: false, one_time_bonus: false })
  const [assignModal, setAssignModal] = useState(false)
  const [salaryForm, setSalaryForm] = useState({ salary: 0, kpi_bonus: 0, fixed_bonus: 0, one_time_bonus: 0, is_raise: false })
  const [editForm, setEditForm] = useState(null)

  const { data: emp, isLoading } = useQuery({
    queryKey: ['employee', id, year],
    queryFn: () => getEmployee(id, { year }),
  })

  // Держим черновик формы в актуальном состоянии с сервером, пока модалка закрыта.
  // Раньше editForm заполнялся только один раз (!editForm) — после сохранения при повторном
  // открытии «Редактировать» показывались старые данные (казалось, что сохранение не сработало).
  useEffect(() => {
    if (!emp) return
    if (editModal) return
    setEditForm(empToEditForm(emp))
  }, [emp, editModal])

  const updateMut = useMutation({
    mutationFn: (data) => updateEmployee(id, data),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['employee', id] })
      setEditModal(false)
    },
  })

  const deleteMut = useMutation({
    mutationFn: () => deleteEmployee(id),
    onSuccess: () => navigate('/employees'),
  })

  const salarySaveMut = useMutation({
    mutationFn: async ({ month, data, extend, byMonth }) => {
      const hasExtend = extend.salary || extend.kpi_bonus || extend.fixed_bonus || extend.one_time_bonus
      const months = hasExtend ? Array.from({ length: 13 - month }, (_, i) => month + i) : [month]
      for (const m of months) {
        let payload
        if (m === month) {
          payload = { salary: data.salary, kpi_bonus: data.kpi_bonus, fixed_bonus: data.fixed_bonus, one_time_bonus: data.one_time_bonus, is_raise: Boolean(data.is_raise) }
        } else {
          const rec = byMonth[m]
          payload = {
            salary: extend.salary ? Number(data.salary ?? 0) : Number(rec?.salary ?? 0),
            kpi_bonus: extend.kpi_bonus ? Number(data.kpi_bonus ?? 0) : Number(rec?.kpi_bonus ?? 0),
            fixed_bonus: extend.fixed_bonus ? Number(data.fixed_bonus ?? 0) : Number(rec?.fixed_bonus ?? 0),
            one_time_bonus: extend.one_time_bonus ? Number(data.one_time_bonus ?? 0) : Number(rec?.one_time_bonus ?? 0),
            is_raise: false,
          }
        }
        await upsertSalary(id, year, m, payload)
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['employee', id] }); setSalaryModal(null) },
  })

  const deleteAssignMut = useMutation({
    mutationFn: deleteAssignment,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['employee', id] }),
  })

  const setRateMut = useMutation({
    mutationFn: ({ assignmentId, month, rate }) => setAssignmentRate({ assignmentId, year, month, rate }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['employee', id, year] }),
  })

  const updateBaseRateMut = useMutation({
    mutationFn: ({ assignmentId, rate }) => updateAssignment(assignmentId, { rate }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['employee', id, year] }),
  })

  const updateAssignmentDatesMut = useMutation({
    mutationFn: ({ assignmentId, valid_from, valid_to }) =>
      updateAssignment(assignmentId, { ...(valid_from !== undefined && { valid_from }), ...(valid_to !== undefined && { valid_to }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['employee', id, year] }),
  })

  const hireMut = useMutation({
    mutationFn: (data) => hireFromPosition(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['employee', id] })
      qc.invalidateQueries({ queryKey: ['employees', 'positions'] })
      setHireModal(false)
    },
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
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => navigate('/employees')}>← Назад</button>
        <div style={{ flex: 1 }} />
        {emp.is_position && (
          <button type="button" className="btn btn-primary" onClick={() => setHireModal(true)}>✓ Нанять</button>
        )}
        <button type="button" className="btn btn-secondary" onClick={() => { setEditForm({ ...emp, planned_exit_date: emp.planned_exit_date || '', planned_salary: emp.planned_salary ?? '', position_status: emp.position_status || 'awaiting_assignment' }); setEditModal(true) }}>✏ Редактировать</button>
        <button type="button" className="btn btn-danger btn-sm" onClick={() => setDeleteConfirm(true)}>🗑 Удалить</button>
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
            {!emp.is_position && (
              <>
                <span className="text-muted">Найм:</span><span>{fmtDate(emp.hire_date)}</span>
                <span className="text-muted">Увольнение:</span>
                <span style={{ color: isTerminated ? 'var(--red)' : emp.termination_date ? 'var(--amber)' : 'inherit' }}>
                  {fmtDate(emp.termination_date)}
                </span>
              </>
            )}
            {emp.is_position && (emp.planned_exit_date != null || emp.planned_salary != null || emp.position_status) && (
              <>
                <span className="text-muted">Статус:</span>
                <span>{POSITION_STATUS_LABELS[emp.position_status] || emp.position_status || '—'}</span>
                <span className="text-muted">Плановая дата выхода:</span><span>{fmtDate(emp.planned_exit_date)}</span>
                <span className="text-muted">Оклад:</span><span>{emp.planned_salary != null ? fmt(emp.planned_salary) : '—'}</span>
                {emp.assignments?.[0] && (
                  <>
                    <span className="text-muted">Проект:</span><span>{emp.assignments[0].project_name}</span>
                    <span className="text-muted">Ставка:</span><span>×{emp.assignments[0].rate}</span>
                  </>
                )}
              </>
            )}
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
          <div className="fw-600">Проекты {year}</div>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setAssignModal(true)}>+ Добавить в проект</button>
        </div>
        <div className="text-muted text-small" style={{ marginBottom: 10 }}>
          Можно указать несколько проектов с разными периодами. Нажмите на ставку или дату для редактирования.
        </div>
        {emp.assignments.length === 0
          ? <div className="text-muted text-small">Не привязан ни к одному проекту</div>
          : emp.assignments[0].monthly_rates != null
            ? (
              <>
                <div className="overflow-table">
                  <table>
                    <thead>
                      <tr>
                        <th className="th">Проект</th>
                        {MONTHS.map((m, i) => (
                          <th className="th text-right" key={i} style={{ minWidth: 64, ...(i === new Date().getMonth() && { background: '#fef9c3' }) }}>{m}</th>
                        ))}
                        <th className="th">С</th>
                        <th className="th">По</th>
                        <th className="th" />
                      </tr>
                    </thead>
                    <tbody>
                      {emp.assignments.map(a => (
                        <tr key={a.id}>
                          <td className="td fw-500">{a.project_name}</td>
                          {(a.monthly_rates || Array(12).fill(a.rate)).map((r, i) => (
                            <td
                              className="td text-right"
                              key={i}
                              style={emp.assignments_monthly_total_rates && (emp.assignments_monthly_total_rates[i] < 1 || emp.assignments_monthly_total_rates[i] > 1)
                                ? { background: 'var(--warning-bg, rgba(220, 150, 0, 0.12))' }
                                : undefined}
                              title={emp.assignments_monthly_total_rates ? `Сумма ставок по всем проектам: ${emp.assignments_monthly_total_rates[i]}` : undefined}
                            >
                              <MemberRateCell
                                value={r}
                                assignmentId={a.id}
                                month={i + 1}
                                year={year}
                                onSave={(rate) => setRateMut.mutate({ assignmentId: a.id, month: i + 1, rate })}
                                saving={setRateMut.isPending}
                              />
                            </td>
                          ))}
                          <td className="td text-muted">
                            <EditableDateCell
                              value={a.valid_from}
                              nullable={false}
                              onSave={(v) => updateAssignmentDatesMut.mutate({ assignmentId: a.id, valid_from: v })}
                              saving={updateAssignmentDatesMut.isPending}
                            />
                          </td>
                          <td className="td text-muted">
                            <EditableDateCell
                              value={a.valid_to}
                              nullable
                              onSave={(v) => updateAssignmentDatesMut.mutate({ assignmentId: a.id, valid_to: v })}
                              saving={updateAssignmentDatesMut.isPending}
                            />
                          </td>
                          <td className="td">
                            <button type="button" className="btn btn-ghost btn-sm" onClick={() => deleteAssignMut.mutate(a.id)}>✕</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {emp.assignments_monthly_total_rates && emp.assignments_monthly_total_rates.some((t, i) => Math.abs(t - 1) > 0.001) && (
                  <div className="alert alert-warning" style={{ marginTop: 12 }}>
                    В некоторых месяцах сумма ставок по проектам не равна 1. Проверьте значения в таблице выше.
                  </div>
                )}
              </>
            )
            : (
              <table>
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
                      <td className="td">
                        <MemberRateCell
                          value={a.rate}
                          assignmentId={a.id}
                          month={null}
                          year={year}
                          onSave={(rate) => updateBaseRateMut.mutate({ assignmentId: a.id, rate })}
                          saving={updateBaseRateMut.isPending}
                        />
                      </td>
                      <td className="td text-muted">
                        <EditableDateCell
                          value={a.valid_from}
                          nullable={false}
                          onSave={(v) => updateAssignmentDatesMut.mutate({ assignmentId: a.id, valid_from: v })}
                          saving={updateAssignmentDatesMut.isPending}
                        />
                      </td>
                      <td className="td text-muted">
                        <EditableDateCell
                          value={a.valid_to}
                          nullable
                          onSave={(v) => updateAssignmentDatesMut.mutate({ assignmentId: a.id, valid_to: v })}
                          saving={updateAssignmentDatesMut.isPending}
                        />
                      </td>
                      <td className="td">
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => deleteAssignMut.mutate(a.id)}>✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
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
                  <th className="th text-right" key={i} style={{ minWidth: 80, ...(i === new Date().getMonth() && { background: '#fef9c3' }) }}>{m}</th>
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
                { key: 'hourly_rate', label: 'Ч/ставка, ₽/ч', isHourly: true },
              ].map(({ key, label, bold, isHourly }) => (
                <tr key={key}>
                  <td className="td" style={{ fontWeight: bold ? 600 : 400 }}>{label}</td>
                  {MONTHS.map((_, i) => {
                    if (isHourly) {
                      const hr = emp.monthly_hourly_rates?.[i]
                      return (
                        <td className="td text-right" key={i} style={{ fontWeight: 400, color: 'var(--text-2)' }}>
                          {hr != null ? fmt(hr) : <span className="text-muted">—</span>}
                        </td>
                      )
                    }
                    const rec = salaryByMonth[i + 1]
                    const val = rec ? rec[key] : null
                    const isRaiseMonth = rec?.is_raise === true
                    return (
                      <td
                        className="td text-right"
                        key={i}
                        style={{
                          cursor: key !== 'total' ? 'pointer' : 'default',
                          fontWeight: bold ? 600 : 400,
                          ...(isRaiseMonth ? { background: 'var(--green-light, rgba(34, 197, 94, 0.12))' } : {}),
                        }}
                        title={isRaiseMonth ? 'Повышение с этого месяца' : undefined}
                        onClick={() => {
                          if (key === 'total') return
                          const existing = salaryByMonth[i + 1]
                          setSalaryForm({
                            salary: existing?.salary ?? 0,
                            kpi_bonus: existing?.kpi_bonus ?? 0,
                            fixed_bonus: existing?.fixed_bonus ?? 0,
                            one_time_bonus: existing?.one_time_bonus ?? 0,
                            is_raise: existing?.is_raise ?? false,
                          })
                          setSalaryExtend({ salary: false, kpi_bonus: false, fixed_bonus: false, one_time_bonus: false }); setSalaryModal({ month: i + 1 })
                        }}
                      >
                        {val != null && val !== 0 ? fmt(val) : <span className="text-muted">—</span>}
                      </td>
                    )
                  })}
                  <td className="td text-right" style={{ fontWeight: isHourly ? 400 : 600, color: isHourly ? 'var(--text-3)' : undefined }}>
                    {isHourly ? '—' : fmt(Object.values(salaryByMonth).reduce((s, r) => s + (r[key] || 0), 0))}
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
          onClose={() => {
            updateMut.reset()
            setEditModal(false)
          }}
          footer={
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                updateMut.reset()
                setEditModal(false)
              }}
            >
              Отмена
            </button>
          }
        >
          {updateMut.isError && (
            <div className="alert alert-error" style={{ marginBottom: 12 }}>
              {formatSaveError(updateMut.error)}
            </div>
          )}
          <EmployeeForm
            key={emp.updated_at}
            initial={editForm}
            onSubmit={(payload) => updateMut.mutate(payload)}
            loading={updateMut.isPending}
            submitLabel="Сохранить"
          />
        </Modal>
      )}

      {/* Salary modal */}
      {salaryModal && (
        <SalaryModal
          month={salaryModal.month}
          year={year}
          form={salaryForm}
          setForm={setSalaryForm}
          extend={salaryExtend}
          setExtend={setSalaryExtend}
          onSave={() => salarySaveMut.mutate({
            month: salaryModal.month,
            data: salaryForm,
            extend: salaryExtend,
            byMonth: salaryByMonth,
          })}
          onClose={() => setSalaryModal(null)}
          loading={salarySaveMut.isPending}
        />
      )}

      {/* Add assignment modal */}
      {assignModal && (
        <AddAssignmentModal
          employeeId={id}
          onClose={() => setAssignModal(false)}
          onDone={() => { qc.invalidateQueries({ queryKey: ['employee', id] }); setAssignModal(false) }}
        />
      )}

      {/* Hire modal (position -> employee) */}
      {hireModal && emp?.is_position && (
        <Modal
          title="Нанять на позицию"
          onClose={() => setHireModal(false)}
          footer={
            <>
              <button type="button" className="btn btn-secondary" onClick={() => setHireModal(false)}>Отмена</button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={(!hireForm.last_name?.trim() && !hireForm.first_name?.trim()) || hireMut.isPending}
                onClick={() => hireMut.mutate({
                  first_name: hireForm.first_name || null,
                  last_name: hireForm.last_name || null,
                  middle_name: hireForm.middle_name || null,
                  hire_date: hireForm.hire_date || null,
                  department: hireForm.department || null,
                  specialization: hireForm.specialization || null,
                  comment: hireForm.comment || null,
                })}
              >
                {hireMut.isPending ? <span className="spinner" /> : 'Нанять'}
              </button>
            </>
          }
        >
          <p style={{ marginBottom: 16, color: 'var(--text-2)' }}>
            Укажите ФИО и дату выхода. Позиция станет сотрудником и исчезнет из вкладки «Найм».
          </p>
          <div className="grid-3" style={{ marginBottom: 16 }}>
            <div className="form-group">
              <label className="label">Фамилия *</label>
              <input className="input" value={hireForm.last_name} onChange={e => setHireForm(f => ({ ...f, last_name: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="label">Имя *</label>
              <input className="input" value={hireForm.first_name} onChange={e => setHireForm(f => ({ ...f, first_name: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="label">Отчество</label>
              <input className="input" value={hireForm.middle_name} onChange={e => setHireForm(f => ({ ...f, middle_name: e.target.value }))} />
            </div>
          </div>
          <div className="form-group">
            <label className="label">Дата выхода</label>
            <input type="date" className="input" value={hireForm.hire_date} onChange={e => setHireForm(f => ({ ...f, hire_date: e.target.value }))} />
          </div>
          <div className="grid-2">
            <div className="form-group">
              <label className="label">Подразделение</label>
              <input className="input" value={hireForm.department} onChange={e => setHireForm(f => ({ ...f, department: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="label">Специализация</label>
              <input className="input" value={hireForm.specialization} onChange={e => setHireForm(f => ({ ...f, specialization: e.target.value }))} />
            </div>
          </div>
          <div className="form-group">
            <label className="label">Комментарий</label>
            <textarea className="input" rows={2} value={hireForm.comment} onChange={e => setHireForm(f => ({ ...f, comment: e.target.value }))} />
          </div>
        </Modal>
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
