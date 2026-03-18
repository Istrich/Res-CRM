import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getProjects } from '../api'

const EMPTY = {
  is_position: false,
  first_name: '', last_name: '', middle_name: '',
  title: '', department: '', specialization: '', comment: '',
  hire_date: '', termination_date: '',
  planned_exit_date: '', planned_salary: '', project_id: '', rate: '1',
  position_status: 'awaiting_assignment',
}

const POSITION_STATUS_OPTIONS = [
  { value: 'awaiting_assignment', label: 'Ожидает взятия в работу' },
  { value: 'hiring', label: 'Найм' },
  { value: 'awaiting_start', label: 'Ожидаем выход' },
]

/**
 * Use `key={emp?.id || 'new'}` on EmployeeForm in the parent to reset state
 * when the edited record changes — avoids the stale-closure / infinite-loop
 * problem of useEffect([initial]) when initial is a new object reference.
 */
export default function EmployeeForm({ initial = {}, onSubmit, loading, submitLabel = 'Сохранить' }) {
  const [form, setForm] = useState({ ...EMPTY, ...initial })
  const [error, setError] = useState('')

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => getProjects(),
    enabled: form.is_position,
  })

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!form.title.trim()) { setError('Должность обязательна'); return }
    if (!form.is_position && !form.last_name?.trim() && !form.first_name?.trim()) {
      setError('Укажите имя или фамилию сотрудника'); return
    }
    if (form.hire_date && form.termination_date && form.termination_date < form.hire_date) {
      setError('Дата увольнения не может быть раньше даты найма'); return
    }
    const payload = { ...form }
    const cleanKeys = ['first_name','last_name','middle_name','department','specialization','comment','hire_date','termination_date','planned_exit_date','planned_salary','project_id']
    for (const k of cleanKeys) {
      if (!payload[k]) payload[k] = null
    }
    if (payload.rate !== null && payload.rate !== '') payload.rate = Number(payload.rate)
    else payload.rate = null
    if (payload.planned_salary !== null && payload.planned_salary !== '') payload.planned_salary = Number(payload.planned_salary)
    else payload.planned_salary = null
    onSubmit(payload)
  }

  return (
    <form onSubmit={handleSubmit}>
      {error && <div className="alert alert-error">{error}</div>}

      <div className="form-group">
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={form.is_position}
            onChange={(e) => set('is_position', e.target.checked)}
          />
          <span className="label" style={{ marginBottom: 0 }}>Позиция (вакансия без сотрудника)</span>
        </label>
      </div>

      <div className="divider" />

      {!form.is_position && (
        <div className="grid-3" style={{ marginBottom: 16 }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="label">Фамилия</label>
            <input className="input" value={form.last_name || ''} onChange={e => set('last_name', e.target.value)} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="label">Имя</label>
            <input className="input" value={form.first_name || ''} onChange={e => set('first_name', e.target.value)} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="label">Отчество</label>
            <input className="input" value={form.middle_name || ''} onChange={e => set('middle_name', e.target.value)} />
          </div>
        </div>
      )}

      <div className="form-group">
        <label className="label">Должность *</label>
        <input className="input" value={form.title} onChange={e => set('title', e.target.value)} required />
      </div>

      <div className="grid-2">
        <div className="form-group">
          <label className="label">Подразделение</label>
          <input className="input" value={form.department || ''} onChange={e => set('department', e.target.value)} />
        </div>
        <div className="form-group">
          <label className="label">Специализация</label>
          <input className="input" value={form.specialization || ''} onChange={e => set('specialization', e.target.value)} />
        </div>
      </div>

      {form.is_position && (
        <>
          <div className="divider" />
          <div className="form-group">
            <label className="label">Статус позиции</label>
            <select className="select" value={form.position_status || 'awaiting_assignment'} onChange={e => set('position_status', e.target.value)}>
              {POSITION_STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div className="grid-2">
            <div className="form-group">
              <label className="label">Плановая дата выхода</label>
              <input type="date" className="input" value={form.planned_exit_date || ''} onChange={e => set('planned_exit_date', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="label">Оклад</label>
              <input type="number" className="input" step="0.01" min="0" value={form.planned_salary ?? ''} onChange={e => set('planned_salary', e.target.value)} placeholder="руб." />
            </div>
          </div>
          <div className="grid-2">
            <div className="form-group">
              <label className="label">Проект</label>
              <select className="select" value={form.project_id || ''} onChange={e => set('project_id', e.target.value)}>
                <option value="">— выберите —</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="label">Ставка в проекте</label>
              <input type="number" className="input" step="0.1" min="0.1" value={form.rate ?? '1'} onChange={e => set('rate', e.target.value)} />
            </div>
          </div>
          <div className="text-muted text-small" style={{ marginTop: -8, marginBottom: 16 }}>
            При создании позиция будет добавлена в проект с месяца выхода по конец года с указанным окладом и ставкой.
          </div>
        </>
      )}

      {!form.is_position && (
        <div className="grid-2">
          <div className="form-group">
            <label className="label">Дата найма</label>
            <input type="date" className="input" value={form.hire_date || ''} onChange={e => set('hire_date', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="label">Дата увольнения</label>
            <input type="date" className="input" value={form.termination_date || ''} onChange={e => set('termination_date', e.target.value)} />
          </div>
        </div>
      )}

      <div className="form-group">
        <label className="label">Комментарий</label>
        <textarea
          className="input"
          rows={2}
          value={form.comment || ''}
          onChange={e => set('comment', e.target.value)}
          style={{ resize: 'vertical' }}
        />
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
        <button className="btn btn-primary" type="submit" disabled={loading}>
          {loading ? <span className="spinner" /> : submitLabel}
        </button>
      </div>
    </form>
  )
}
