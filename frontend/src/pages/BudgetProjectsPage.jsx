import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getBudgetProjects, createBudgetProject, deleteBudgetProject,
  exportBudgetProjects,
} from '../api'
import { useYearStore } from '../store/year'
import { fmt, statusLabel, statusColor, downloadBlob } from '../utils'
import Modal from '../components/ui/Modal'
import Confirm from '../components/ui/Confirm'

export default function BudgetProjectsPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { year } = useYearStore()

  const [showCreate, setShowCreate] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [form, setForm] = useState({ name: '', year: String(year), total_budget: '' })
  const [formErr, setFormErr] = useState('')

  const { data: bps = [], isLoading } = useQuery({
    queryKey: ['budget-projects', year],
    queryFn: () => getBudgetProjects({ year }),
  })

  const createMut = useMutation({
    mutationFn: createBudgetProject,
    onSuccess: (bp) => {
      qc.invalidateQueries({ queryKey: ['budget-projects'] })
      setShowCreate(false)
      setForm({ name: '', year: String(year), total_budget: '' })
      navigate(`/budget-projects/${bp.id}`)
    },
    onError: (e) => setFormErr(e.response?.data?.detail || 'Ошибка'),
  })

  const deleteMut = useMutation({
    mutationFn: deleteBudgetProject,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['budget-projects'] }); setDeleteTarget(null) },
  })

  function handleCreate(e) {
    e.preventDefault()
    setFormErr('')
    if (!form.name.trim()) { setFormErr('Название обязательно'); return }
    createMut.mutate({
      name: form.name,
      year: Number(form.year),
      total_budget: form.total_budget ? Number(form.total_budget) : null,
    })
  }

  async function handleExport() {
    const blob = await exportBudgetProjects(year)
    downloadBlob(blob, `budget_projects_${year}.xlsx`)
  }

  const totalBudget = bps.reduce((s, bp) => s + (bp.total_budget || 0), 0)
  const totalSpent = bps.reduce((s, bp) => s + (bp.spent || 0), 0)

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Бюджетные проекты</div>
          <div className="page-subtitle">{bps.length} проектов · год {year}</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary btn-sm" onClick={handleExport}>⬇ Excel</button>
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}>+ Создать</button>
        </div>
      </div>

      {/* Summary */}
      {bps.length > 0 && (
        <div className="grid-3" style={{ marginBottom: 20 }}>
          <div className="stat-card">
            <div className="stat-value">{fmt(totalBudget)} ₽</div>
            <div className="stat-label">Общий бюджет</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{fmt(totalSpent)} ₽</div>
            <div className="stat-label">Расходовано</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{fmt(totalBudget - totalSpent)} ₽</div>
            <div className="stat-label">Остаток</div>
          </div>
        </div>
      )}

      <div className="card overflow-table">
        {isLoading ? (
          <div className="empty-state"><span className="spinner" /></div>
        ) : bps.length === 0 ? (
          <div className="empty-state">
            <span style={{ fontSize: 32 }}>💼</span>
            <span>Нет бюджетных проектов за {year} год</span>
            <button className="btn btn-primary btn-sm" onClick={() => setShowCreate(true)}>Создать первый</button>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th className="th">Название</th>
                <th className="th" style={{ textAlign: 'right' }}>Год</th>
                <th className="th" style={{ textAlign: 'right' }}>Бюджет</th>
                <th className="th" style={{ textAlign: 'right' }}>Расход</th>
                <th className="th" style={{ textAlign: 'right' }}>Прогноз</th>
                <th className="th" style={{ textAlign: 'right' }}>Остаток</th>
                <th className="th">Статус</th>
                <th className="th" style={{ textAlign: 'right' }}>Проектов</th>
                <th className="th" />
              </tr>
            </thead>
            <tbody>
              {bps.map(bp => (
                <tr key={bp.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/budget-projects/${bp.id}`)}>
                  <td className="td" style={{ fontWeight: 600 }}>{bp.name}</td>
                  <td className="td" style={{ textAlign: 'right' }}>{bp.year}</td>
                  <td className="td" style={{ textAlign: 'right' }}>
                    {bp.total_budget ? `${fmt(bp.total_budget)} ₽` : <span className="text-muted">—</span>}
                  </td>
                  <td className="td" style={{ textAlign: 'right' }}>{fmt(bp.spent)} ₽</td>
                  <td className="td" style={{ textAlign: 'right' }}>{fmt(bp.forecast)} ₽</td>
                  <td className="td" style={{ textAlign: 'right' }}>
                    {bp.remaining != null
                      ? <span style={{ color: bp.remaining < 0 ? 'var(--red)' : 'var(--green)' }}>
                          {fmt(bp.remaining)} ₽
                        </span>
                      : <span className="text-muted">—</span>
                    }
                  </td>
                  <td className="td">
                    <span className="badge" style={{
                      background: statusColor(bp.status) + '22',
                      color: statusColor(bp.status),
                    }}>
                      {statusLabel(bp.status)}
                    </span>
                  </td>
                  <td className="td" style={{ textAlign: 'right' }}>{bp.projects_count}</td>
                  <td className="td" onClick={e => e.stopPropagation()}>
                    <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setDeleteTarget(bp)}>🗑</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showCreate && (
        <Modal
          title="Новый бюджетный проект"
          onClose={() => { setShowCreate(false); setFormErr('') }}
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setShowCreate(false)}>Отмена</button>
              <button className="btn btn-primary" onClick={handleCreate} disabled={createMut.isPending}>
                {createMut.isPending ? <span className="spinner" /> : 'Создать'}
              </button>
            </>
          }
        >
          {formErr && <div className="alert alert-error">{formErr}</div>}
          <div className="form-group">
            <label className="label">Название *</label>
            <input className="input" autoFocus value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          </div>
          <div className="grid-2">
            <div className="form-group">
              <label className="label">Год</label>
              <input className="input" type="number" value={form.year}
                onChange={e => setForm(f => ({ ...f, year: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="label">Общий бюджет (₽)</label>
              <input className="input" type="number" placeholder="необязательно" value={form.total_budget}
                onChange={e => setForm(f => ({ ...f, total_budget: e.target.value }))} />
            </div>
          </div>
        </Modal>
      )}

      {deleteTarget && (
        <Confirm
          title="Удалить бюджетный проект"
          message={`Удалить «${deleteTarget.name}»? Проекты внутри останутся, но потеряют привязку к бюджету.`}
          onConfirm={() => deleteMut.mutate(deleteTarget.id)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  )
}
