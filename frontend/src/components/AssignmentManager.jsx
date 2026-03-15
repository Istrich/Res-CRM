import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getProjects, createAssignment, deleteAssignment } from '../api'
import { fmtDate } from '../utils'

export default function AssignmentManager({ employeeId, assignments = [], onRefresh }) {
  const qc = useQueryClient()
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ project_id: '', rate: '1.0', valid_from: '', valid_to: '' })
  const [err, setErr] = useState('')

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => getProjects(),
  })

  const createMut = useMutation({
    mutationFn: (data) => createAssignment(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['employee', employeeId] })
      setAdding(false)
      setForm({ project_id: '', rate: '1.0', valid_from: '', valid_to: '' })
      setErr('')
      onRefresh?.()
    },
    onError: (e) => setErr(e.response?.data?.detail || 'Ошибка'),
  })

  const deleteMut = useMutation({
    mutationFn: (id) => deleteAssignment(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['employee', employeeId] })
      onRefresh?.()
    },
  })

  function handleAdd(e) {
    e.preventDefault()
    setErr('')
    if (!form.project_id) { setErr('Выберите проект'); return }
    if (!form.valid_from) { setErr('Укажите дату начала'); return }
    createMut.mutate({
      employee_id: employeeId,
      project_id: form.project_id,
      rate: Number(form.rate),
      valid_from: form.valid_from,
      valid_to: form.valid_to || null,
    })
  }

  // Total rate warning
  const totalRate = assignments.reduce((s, a) => s + a.rate, 0)
  const rateWarning = totalRate > 0 && Math.abs(totalRate - 1.0) > 0.001

  return (
    <div>
      {rateWarning && (
        <div className="alert alert-warning" style={{ marginBottom: 12 }}>
          Сумма ставок: {totalRate.toFixed(2)} (рекомендуется 1.00)
        </div>
      )}

      {assignments.length > 0 ? (
        <table style={{ marginBottom: 12 }}>
          <thead>
            <tr>
              <th className="th">Проект</th>
              <th className="th" style={{ textAlign: 'right' }}>Ставка</th>
              <th className="th">С</th>
              <th className="th">По</th>
              <th className="th" />
            </tr>
          </thead>
          <tbody>
            {assignments.map(a => (
              <tr key={a.id}>
                <td className="td" style={{ fontWeight: 500 }}>{a.project_name}</td>
                <td className="td" style={{ textAlign: 'right' }}>
                  <span className="badge badge-blue">{a.rate}</span>
                </td>
                <td className="td">{fmtDate(a.valid_from)}</td>
                <td className="td">{a.valid_to ? fmtDate(a.valid_to) : <span className="text-muted">—</span>}</td>
                <td className="td">
                  <button
                    type="button"
                    className="btn btn-danger btn-sm"
                    onClick={() => confirm('Убрать сотрудника из проекта?') && deleteMut.mutate(a.id)}
                  >
                    Убрать
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="empty-state" style={{ padding: '20px 0' }}>
          <span>Нет привязок к проектам</span>
        </div>
      )}

      {adding ? (
        <form onSubmit={handleAdd} style={{ background: 'var(--surface2)', padding: 14, borderRadius: 6, border: '1px solid var(--border)' }}>
          {err && <div className="alert alert-error">{err}</div>}
          <div className="grid-2" style={{ marginBottom: 10 }}>
            <div>
              <label className="label">Проект *</label>
              <select className="select" style={{ width: '100%' }} value={form.project_id} onChange={e => setForm(f => ({ ...f, project_id: e.target.value }))}>
                <option value="">— выберите —</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Ставка *</label>
              <input type="number" step="0.1" min="0.1" className="input" value={form.rate} onChange={e => setForm(f => ({ ...f, rate: e.target.value }))} />
            </div>
          </div>
          <div className="grid-2" style={{ marginBottom: 10 }}>
            <div>
              <label className="label">Дата начала *</label>
              <input type="date" className="input" value={form.valid_from} onChange={e => setForm(f => ({ ...f, valid_from: e.target.value }))} />
            </div>
            <div>
              <label className="label">Дата окончания</label>
              <input type="date" className="input" value={form.valid_to} onChange={e => setForm(f => ({ ...f, valid_to: e.target.value }))} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary btn-sm" type="submit" disabled={createMut.isPending}>Добавить</button>
            <button className="btn btn-secondary btn-sm" type="button" onClick={() => { setAdding(false); setErr('') }}>Отмена</button>
          </div>
        </form>
      ) : (
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setAdding(true)}>
          + Добавить проект
        </button>
      )}
    </div>
  )
}
