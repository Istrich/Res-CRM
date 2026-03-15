import { useState, useEffect } from 'react'

const EMPTY = {
  is_position: false,
  first_name: '', last_name: '', middle_name: '',
  title: '', department: '', specialization: '', comment: '',
  hire_date: '', termination_date: '',
}

export default function EmployeeForm({ initial = {}, onSubmit, loading, submitLabel = 'Сохранить' }) {
  const [form, setForm] = useState({ ...EMPTY, ...initial })
  const [error, setError] = useState('')

  useEffect(() => { setForm({ ...EMPTY, ...initial }) }, [JSON.stringify(initial)])

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
    // Clean empty strings to null
    for (const k of ['first_name','last_name','middle_name','department','specialization','comment','hire_date','termination_date']) {
      if (!payload[k]) payload[k] = null
    }
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
