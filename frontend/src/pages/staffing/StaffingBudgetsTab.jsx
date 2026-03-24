import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getStaffingBudgets, createStaffingBudget, deleteStaffingBudget } from '../../api'
import { useYearStore } from '../../store/year'
import Modal from '../../components/ui/Modal'
import Confirm from '../../components/ui/Confirm'

function fmt(v) {
  return Number(v || 0).toLocaleString('ru-RU', { maximumFractionDigits: 0 })
}

function deltaColor(delta) {
  if (delta > 0) return 'var(--success, #22c55e)'
  if (delta < 0) return 'var(--danger, #ef4444)'
  return 'var(--text-2)'
}

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1)

export default function StaffingBudgetsTab() {
  const { year } = useYearStore()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [showModal, setShowModal] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [form, setForm] = useState({ name: '', year: String(year), total_budget: '', monthly: false, months: Array(12).fill('') })

  const { data: budgets = [], isLoading } = useQuery({
    queryKey: ['staffing-budgets', year],
    queryFn: () => getStaffingBudgets(year),
  })

  const createMut = useMutation({
    mutationFn: createStaffingBudget,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['staffing-budgets'] })
      setShowModal(false)
      resetForm()
    },
    onError: (e) => alert(e.response?.data?.detail || 'Ошибка создания'),
  })

  const deleteMut = useMutation({
    mutationFn: deleteStaffingBudget,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['staffing-budgets'] }); setDeleteTarget(null) },
    onError: (e) => alert(e.response?.data?.detail || 'Ошибка удаления'),
  })

  function resetForm() {
    setForm({ name: '', year: String(year), total_budget: '', monthly: false, months: Array(12).fill('') })
  }

  function handleCreate() {
    const payload = {
      name: form.name,
      year: parseInt(form.year, 10),
      total_budget: form.total_budget ? parseFloat(form.total_budget) : null,
    }
    createMut.mutate(payload)
  }

  function distributeEvenly() {
    const total = parseFloat(form.total_budget) || 0
    const perMonth = (total / 12).toFixed(2)
    setForm(f => ({ ...f, months: Array(12).fill(perMonth) }))
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <button type="button" className="btn btn-primary" onClick={() => setShowModal(true)}>
          + Создать бюджет
        </button>
      </div>

      <div className="card overflow-table">
        <table>
          <thead>
            <tr>
              <th className="th">Название</th>
              <th className="th text-right">Год</th>
              <th className="th text-right">Общий план</th>
              <th className="th text-right">Факт</th>
              <th className="th text-right">Дельта</th>
              <th className="th" />
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td className="td" colSpan={6} style={{ textAlign: 'center' }}><span className="spinner" /></td></tr>
            )}
            {!isLoading && budgets.length === 0 && (
              <tr><td className="td" colSpan={6}><div className="empty-state">Нет бюджетов стаффинга</div></td></tr>
            )}
            {budgets.map(b => (
              <tr key={b.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/staffing/budgets/${b.id}`)}>
                <td className="td fw-500">{b.name}</td>
                <td className="td text-right">{b.year}</td>
                <td className="td text-right">{fmt(b.plan_total || b.total_budget)}</td>
                <td className="td text-right">{fmt(b.fact_total)}</td>
                <td className="td text-right" style={{ color: deltaColor(b.delta), fontWeight: 600 }}>
                  {b.delta > 0 ? '+' : ''}{fmt(b.delta)}
                </td>
                <td className="td">
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm btn-icon"
                    onClick={e => { e.stopPropagation(); setDeleteTarget(b) }}
                  >🗑</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <Modal
          title="Новый бюджет стаффинга"
          onClose={() => { setShowModal(false); resetForm() }}
          footer={
            <>
              <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Отмена</button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleCreate}
                disabled={!form.name || createMut.isPending}
              >
                {createMut.isPending ? <span className="spinner" /> : 'Создать'}
              </button>
            </>
          }
        >
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label className="label">Название *</label>
              <input className="input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} autoFocus />
            </div>
            <div className="form-group">
              <label className="label">Год</label>
              <input className="input" type="number" value={form.year} onChange={e => setForm({ ...form, year: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="label">Общая сумма (₽)</label>
              <input className="input" type="number" min="0" value={form.total_budget} onChange={e => setForm({ ...form, total_budget: e.target.value })} placeholder="необязательно" />
            </div>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>
            Помесячный план можно задать после создания в карточке бюджета.
          </div>
        </Modal>
      )}

      {deleteTarget && (
        <Confirm
          message={`Удалить бюджет «${deleteTarget.name}»?`}
          onConfirm={() => deleteMut.mutate(deleteTarget.id)}
          onCancel={() => setDeleteTarget(null)}
          loading={deleteMut.isPending}
        />
      )}
    </div>
  )
}
