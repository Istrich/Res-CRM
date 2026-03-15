import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getEmployees, createEmployee, deleteEmployee, exportEmployees } from '../api'
import { useYearStore } from '../store/year'
import { MONTHS, fmtDate, downloadBlob } from '../utils'
import Modal from '../components/ui/Modal'
import Confirm from '../components/ui/Confirm'

const EMPTY_FORM = {
  is_position: false, first_name: '', last_name: '', middle_name: '',
  title: '', department: '', specialization: '', comment: '',
  hire_date: '', termination_date: '',
}

export default function EmployeesPage() {
  const { year } = useYearStore()
  const qc = useQueryClient()
  const navigate = useNavigate()

  const [search, setSearch] = useState('')
  const [filterDept, setFilterDept] = useState('')
  const [filterSpec, setFilterSpec] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [formError, setFormError] = useState('')

  const { data: employees = [], isLoading } = useQuery({
    queryKey: ['employees', { search, department: filterDept, specialization: filterSpec }],
    queryFn: () => getEmployees({ search: search || undefined, department: filterDept || undefined, specialization: filterSpec || undefined }),
  })

  const createMut = useMutation({
    mutationFn: createEmployee,
    onSuccess: () => { qc.invalidateQueries(['employees']); setShowModal(false); setForm(EMPTY_FORM) },
    onError: (e) => setFormError(e.response?.data?.detail || 'Ошибка'),
  })

  const deleteMut = useMutation({
    mutationFn: deleteEmployee,
    onSuccess: () => { qc.invalidateQueries(['employees']); setDeleteTarget(null) },
  })

  const handleExport = async () => {
    const blob = await exportEmployees(year)
    downloadBlob(blob, `employees_${year}.xlsx`)
  }

  // Collect unique depts/specs for filter dropdowns
  const depts = [...new Set(employees.map(e => e.department).filter(Boolean))]
  const specs = [...new Set(employees.map(e => e.specialization).filter(Boolean))]

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Сотрудники и позиции</div>
          <div className="page-subtitle">{employees.length} записей</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary btn-sm" onClick={handleExport}>⬇ Excel</button>
          <button className="btn btn-primary" onClick={() => setShowModal(true)}>+ Добавить</button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="toolbar">
        <div className="toolbar-left">
          <div className="search-bar" style={{ width: 260 }}>
            🔍
            <input
              placeholder="Поиск по ФИО..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select className="select" value={filterDept} onChange={e => setFilterDept(e.target.value)}>
            <option value="">Все подразделения</option>
            {depts.map(d => <option key={d}>{d}</option>)}
          </select>
          <select className="select" value={filterSpec} onChange={e => setFilterSpec(e.target.value)}>
            <option value="">Все специализации</option>
            {specs.map(s => <option key={s}>{s}</option>)}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-table">
        <table>
          <thead>
            <tr>
              <th className="th">Сотрудник / Позиция</th>
              <th className="th">Должность</th>
              <th className="th">Подразделение</th>
              <th className="th">Специализация</th>
              <th className="th">Проекты / Ставки</th>
              <th className="th">Найм</th>
              <th className="th">Увольнение</th>
              {MONTHS.map((m, i) => (
                <th className="th" key={i} style={{ minWidth: 70, textAlign: 'right' }}>{m}</th>
              ))}
              <th className="th" />
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td className="td" colSpan={20} style={{ textAlign: 'center' }}><span className="spinner" /></td></tr>
            )}
            {!isLoading && employees.length === 0 && (
              <tr><td className="td" colSpan={20}><div className="empty-state">Нет записей</div></td></tr>
            )}
            {employees.map(emp => (
              <EmployeeRow
                key={emp.id}
                emp={emp}
                year={year}
                onOpen={() => navigate(`/employees/${emp.id}`)}
                onDelete={() => setDeleteTarget(emp)}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* Create modal */}
      {showModal && (
        <Modal
          title="Новый сотрудник / позиция"
          onClose={() => { setShowModal(false); setFormError('') }}
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Отмена</button>
              <button className="btn btn-primary" onClick={() => createMut.mutate(form)} disabled={createMut.isPending}>
                {createMut.isPending ? <span className="spinner" /> : 'Создать'}
              </button>
            </>
          }
        >
          {formError && <div className="alert alert-error">{formError}</div>}
          <EmployeeForm form={form} setForm={setForm} />
        </Modal>
      )}

      {/* Delete confirm */}
      {deleteTarget && (
        <Confirm
          message={`Удалить «${deleteTarget.display_name}»? Все данные будут потеряны.`}
          onConfirm={() => deleteMut.mutate(deleteTarget.id)}
          onCancel={() => setDeleteTarget(null)}
          loading={deleteMut.isPending}
        />
      )}
    </div>
  )
}

function EmployeeRow({ emp, year, onOpen, onDelete }) {
  const isTerminated = emp.termination_date && new Date(emp.termination_date) < new Date()

  return (
    <tr style={{ cursor: 'pointer', opacity: isTerminated ? 0.6 : 1 }}>
      <td className="td" onClick={onOpen} style={{ minWidth: 180 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {emp.is_position
            ? <span className="badge badge-amber">Позиция</span>
            : isTerminated
              ? <span className="badge badge-gray">Уволен</span>
              : <span className="badge badge-blue">Сотрудник</span>
          }
          <span className="fw-500">{emp.display_name}</span>
        </div>
        {!emp.has_projects && !emp.is_position && (
          <div style={{ fontSize: 11, color: 'var(--amber)', marginTop: 2 }}>⚠ без проекта</div>
        )}
      </td>
      <td className="td" onClick={onOpen}>{emp.title}</td>
      <td className="td" onClick={onOpen}>{emp.department || '—'}</td>
      <td className="td" onClick={onOpen}>{emp.specialization || '—'}</td>
      <td className="td" onClick={onOpen} style={{ minWidth: 160 }}>
        {emp.assignments.length === 0
          ? <span className="text-muted">—</span>
          : emp.assignments.map(a => (
            <div key={a.id} style={{ fontSize: 12 }}>
              {a.project_name} <span className="text-muted">×{a.rate}</span>
            </div>
          ))
        }
      </td>
      <td className="td" onClick={onOpen} style={{ whiteSpace: 'nowrap' }}>{fmtDate(emp.hire_date)}</td>
      <td className="td" onClick={onOpen} style={{ whiteSpace: 'nowrap' }}>
        {emp.termination_date
          ? <span style={{ color: new Date(emp.termination_date) < new Date() ? 'var(--red)' : 'var(--amber)' }}>
              {fmtDate(emp.termination_date)}
            </span>
          : '—'}
      </td>
      {/* Monthly cells - just placeholder, detail on card */}
      {MONTHS.map((_, i) => (
        <td className="td text-right text-muted text-small" key={i} style={{ minWidth: 70 }}>
          —
        </td>
      ))}
      <td className="td">
        <button className="btn btn-ghost btn-sm btn-icon" onClick={(e) => { e.stopPropagation(); onDelete() }}>🗑</button>
      </td>
    </tr>
  )
}

export function EmployeeForm({ form, setForm }) {
  const f = (field) => (e) => setForm({ ...form, [field]: e.target.value })
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 }}>
          <input type="checkbox" checked={form.is_position} onChange={e => setForm({ ...form, is_position: e.target.checked })} />
          Это позиция (вакансия)
        </label>
      </div>
      {!form.is_position && (
        <div className="grid-3">
          <div className="form-group"><label className="label">Фамилия</label><input className="input" value={form.last_name} onChange={f('last_name')} /></div>
          <div className="form-group"><label className="label">Имя</label><input className="input" value={form.first_name} onChange={f('first_name')} /></div>
          <div className="form-group"><label className="label">Отчество</label><input className="input" value={form.middle_name} onChange={f('middle_name')} /></div>
        </div>
      )}
      <div className="grid-2">
        <div className="form-group">
          <label className="label">Должность *</label>
          <input className="input" value={form.title} onChange={f('title')} required />
        </div>
        <div className="form-group">
          <label className="label">Подразделение</label>
          <input className="input" value={form.department} onChange={f('department')} />
        </div>
      </div>
      <div className="form-group">
        <label className="label">Специализация</label>
        <input className="input" value={form.specialization} onChange={f('specialization')} />
      </div>
      <div className="grid-2">
        <div className="form-group">
          <label className="label">Дата найма</label>
          <input className="input" type="date" value={form.hire_date} onChange={f('hire_date')} />
        </div>
        <div className="form-group">
          <label className="label">Дата увольнения</label>
          <input className="input" type="date" value={form.termination_date} onChange={f('termination_date')} />
        </div>
      </div>
      <div className="form-group">
        <label className="label">Комментарий</label>
        <textarea className="input" rows={2} value={form.comment} onChange={f('comment')} />
      </div>
    </>
  )
}
