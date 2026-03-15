import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getBudgetProject, updateBudgetProject, deleteBudgetProject,
  getBudgetProjectBudget,
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

  const { data: bp, isLoading: bpLoading } = useQuery({
    queryKey: ['budget-project', id, year],
    queryFn: () => getBudgetProject(id, { year }),
  })

  const { data: budget, isLoading: budgetLoading } = useQuery({
    queryKey: ['budget-project-budget', id, year],
    queryFn: () => getBudgetProjectBudget(id, year),
  })

  useEffect(() => {
    if (bp && !editForm) {
      setEditForm({ name: bp.name, year: bp.year, total_budget: bp.total_budget || '' })
    }
  }, [bp])

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
  })

  if (bpLoading) return <div style={{ padding: 40, textAlign: 'center' }}><span className="spinner" /></div>
  if (!bp) return <div className="empty-state">Бюджетный проект не найден</div>

  const sc = statusColor(budget?.status)

  return (
    <div>
      {/* Nav */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <button className="btn btn-ghost btn-sm" onClick={() => navigate('/budget-projects')}>← Назад</button>
        <div style={{ flex: 1 }} />
        <button className="btn btn-secondary btn-sm" onClick={() => { setEditForm({ name: bp.name, year: bp.year, total_budget: bp.total_budget || '' }); setEditModal(true) }}>
          ✏ Редактировать
        </button>
        <button className="btn btn-danger btn-sm" onClick={() => setDeleteConfirm(true)}>🗑</button>
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
                <th className="th">Статус</th>
              </tr>
            </thead>
            <tbody>
              {budget.projects.map(p => (
                <tr
                  key={p.project_id}
                  style={{ cursor: 'pointer' }}
                  onClick={() => navigate(`/projects/${p.project_id}`)}
                >
                  <td className="td fw-500">{p.project_name}</td>
                  <td className="td" style={{ textAlign: 'right' }}>{fmt(p.spent)} ₽</td>
                  <td className="td" style={{ textAlign: 'right' }}>{fmt(p.forecast)} ₽</td>
                  <td className="td" style={{ textAlign: 'right' }}>
                    {p.remaining != null
                      ? <span style={{ color: p.remaining < 0 ? 'var(--red)' : 'var(--green)' }}>
                          {fmt(p.remaining)} ₽
                        </span>
                      : '—'}
                  </td>
                  <td className="td">
                    <span className="badge" style={{ background: statusColor(p.status) + '22', color: statusColor(p.status) }}>
                      {statusLabel(p.status)}
                    </span>
                  </td>
                </tr>
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
              <button className="btn btn-secondary" onClick={() => setEditModal(false)}>Отмена</button>
              <button
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
          title="Удалить бюджетный проект"
          message={`Удалить «${bp.name}»?`}
          onConfirm={() => deleteMut.mutate()}
          onCancel={() => setDeleteConfirm(false)}
        />
      )}
    </div>
  )
}
