import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getStaffers, createStaffer, deleteStaffer, getProjects, getContractors, getStaffingBudgets } from '../../api'
import { useYearStore } from '../../store/year'
import Modal from '../../components/ui/Modal'
import Confirm from '../../components/ui/Confirm'

const EMPTY_FORM = {
  first_name: '', last_name: '', middle_name: '',
  specialization: '', hourly_rate: '', valid_from: '', valid_to: '',
  pm_name: '', comment: '', contractor_id: '', project_id: '',
  staffing_budget_id: '',
}

export default function StaffersTab() {
  const { year } = useYearStore()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [showModal, setShowModal] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)

  const { data: staffers = [], isLoading } = useQuery({
    queryKey: ['staffers', { year }],
    queryFn: () => getStaffers({ year }),
  })
  const { data: projects = [] } = useQuery({ queryKey: ['projects-list'], queryFn: () => getProjects() })
  const { data: contractors = [] } = useQuery({ queryKey: ['contractors-list'], queryFn: getContractors })
  const { data: budgets = [] } = useQuery({
    queryKey: ['staffing-budgets'],
    queryFn: () => getStaffingBudgets(),
  })

  const createMut = useMutation({
    mutationFn: createStaffer,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['staffers'] })
      setShowModal(false)
      setForm(EMPTY_FORM)
    },
    onError: (e) => alert(e.response?.data?.detail || 'Ошибка создания'),
  })

  const deleteMut = useMutation({
    mutationFn: deleteStaffer,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['staffers'] }); setDeleteTarget(null) },
    onError: (e) => alert(e.response?.data?.detail || 'Ошибка удаления'),
  })

  function handleCreate() {
    const payload = {
      ...form,
      hourly_rate: parseFloat(form.hourly_rate) || 0,
      contractor_id: form.contractor_id || null,
      project_id: form.project_id || null,
      staffing_budget_id: form.staffing_budget_id || null,
      valid_to: form.valid_to || null,
      middle_name: form.middle_name || null,
      pm_name: form.pm_name || null,
      comment: form.comment || null,
    }
    createMut.mutate(payload)
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <button type="button" className="btn btn-primary" onClick={() => setShowModal(true)}>
          + Добавить стаффера
        </button>
      </div>

      <div className="card overflow-table">
        <table>
          <thead>
            <tr>
              <th className="th">ФИО</th>
              <th className="th">Специализация</th>
              <th className="th">Проект</th>
              <th className="th">Бюджет</th>
              <th className="th text-right">Ставка (₽/ч)</th>
              <th className="th">Подрядчик</th>
              <th className="th">Дата до</th>
              <th className="th">ПМ</th>
              <th className="th" />
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td className="td" colSpan={9} style={{ textAlign: 'center' }}><span className="spinner" /></td></tr>
            )}
            {!isLoading && staffers.length === 0 && (
              <tr><td className="td" colSpan={9}><div className="empty-state">Нет стафферов</div></td></tr>
            )}
            {staffers.map(s => (
              <tr key={s.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/staffing/staffers/${s.id}`)}>
                <td className="td fw-500">{s.full_name}</td>
                <td className="td text-muted">{s.specialization || '—'}</td>
                <td className="td">{s.project_name || '—'}</td>
                <td className="td">{s.staffing_budget_name || '—'}</td>
                <td className="td text-right">{Number(s.hourly_rate).toLocaleString('ru-RU')}</td>
                <td className="td">{s.contractor_name || '—'}</td>
                <td className="td">{s.valid_to || '∞'}</td>
                <td className="td text-muted">{s.pm_name || '—'}</td>
                <td className="td">
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm btn-icon"
                    onClick={e => { e.stopPropagation(); setDeleteTarget(s) }}
                  >🗑</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <Modal
          title="Новый стаффер"
          onClose={() => { setShowModal(false); setForm(EMPTY_FORM) }}
          footer={
            <>
              <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Отмена</button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleCreate}
                disabled={!form.last_name || !form.valid_from || createMut.isPending}
              >
                {createMut.isPending ? <span className="spinner" /> : 'Создать'}
              </button>
            </>
          }
        >
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label className="label">Фамилия *</label>
              <input className="input" value={form.last_name} onChange={e => setForm({ ...form, last_name: e.target.value })} autoFocus />
            </div>
            <div className="form-group">
              <label className="label">Имя</label>
              <input className="input" value={form.first_name} onChange={e => setForm({ ...form, first_name: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="label">Отчество</label>
              <input className="input" value={form.middle_name} onChange={e => setForm({ ...form, middle_name: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="label">Специализация</label>
              <input className="input" value={form.specialization} onChange={e => setForm({ ...form, specialization: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="label">Ставка ₽/ч *</label>
              <input className="input" type="number" min="0" value={form.hourly_rate} onChange={e => setForm({ ...form, hourly_rate: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="label">ПМ</label>
              <input className="input" value={form.pm_name} onChange={e => setForm({ ...form, pm_name: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="label">Дата начала *</label>
              <input className="input" type="date" value={form.valid_from} onChange={e => setForm({ ...form, valid_from: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="label">Дата окончания</label>
              <input className="input" type="date" value={form.valid_to} onChange={e => setForm({ ...form, valid_to: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="label">Проект</label>
              <select className="select" style={{ width: '100%' }} value={form.project_id} onChange={e => setForm({ ...form, project_id: e.target.value })}>
                <option value="">— не выбрано —</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="label">Подрядчик</label>
              <select className="select" style={{ width: '100%' }} value={form.contractor_id} onChange={e => setForm({ ...form, contractor_id: e.target.value })}>
                <option value="">— не выбрано —</option>
                {contractors.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="label">Бюджет стаффинга</label>
              <select className="select" style={{ width: '100%' }}
                value={form.staffing_budget_id}
                onChange={e => setForm({ ...form, staffing_budget_id: e.target.value })}
              >
                <option value="">— не выбрано —</option>
                {budgets.map(b => <option key={b.id} value={b.id}>{b.name} ({b.year})</option>)}
              </select>
            </div>
          </div>
          <div className="form-group" style={{ marginTop: 8 }}>
            <label className="label">Комментарий</label>
            <textarea className="input" rows={2} value={form.comment} onChange={e => setForm({ ...form, comment: e.target.value })} />
          </div>
        </Modal>
      )}

      {deleteTarget && (
        <Confirm
          message={`Удалить стаффера «${deleteTarget.full_name}»?`}
          onConfirm={() => deleteMut.mutate(deleteTarget.id)}
          onCancel={() => setDeleteTarget(null)}
          loading={deleteMut.isPending}
        />
      )}
    </div>
  )
}
