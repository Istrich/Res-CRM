import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getProjects, createProject, deleteProject, getBudgetProjects } from '../api'
import { useYearStore } from '../store/year'
import { fmt, statusLabel, statusColor } from '../utils'
import Modal from '../components/ui/Modal'
import Confirm from '../components/ui/Confirm'

export default function ProjectsPage() {
  const { year } = useYearStore()
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [search, setSearch] = useState('')
  const [filterBP, setFilterBP] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [form, setForm] = useState({ name: '', budget_project_id: '' })

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ['projects', { search, budget_project_id: filterBP, year }],
    queryFn: () => getProjects({ search: search || undefined, budget_project_id: filterBP || undefined, year }),
  })

  const { data: budgetProjects = [] } = useQuery({
    queryKey: ['budget-projects-list'],
    queryFn: () => getBudgetProjects(),
  })

  const createMut = useMutation({
    mutationFn: createProject,
    onSuccess: () => { qc.invalidateQueries(['projects']); setShowModal(false); setForm({ name: '', budget_project_id: '' }) },
  })

  const deleteMut = useMutation({
    mutationFn: deleteProject,
    onSuccess: () => { qc.invalidateQueries(['projects']); setDeleteTarget(null) },
  })

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Проекты</div>
          <div className="page-subtitle">{projects.length} проектов</div>
        </div>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>+ Создать проект</button>
      </div>

      <div className="toolbar">
        <div className="toolbar-left">
          <div className="search-bar" style={{ width: 240 }}>
            🔍<input placeholder="Поиск..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <select className="select" value={filterBP} onChange={e => setFilterBP(e.target.value)}>
            <option value="">Все бюджетные проекты</option>
            {budgetProjects.map(bp => <option key={bp.id} value={bp.id}>{bp.name}</option>)}
          </select>
        </div>
      </div>

      <div className="card overflow-table">
        <table>
          <thead>
            <tr>
              <th className="th">Проект</th>
              <th className="th">Бюджетный проект</th>
              <th className="th text-right">Сотрудников</th>
              <th className="th text-right">Расход {year}</th>
              <th className="th text-right">Прогноз {year}</th>
              <th className="th">Статус</th>
              <th className="th" />
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td className="td" colSpan={7} style={{ textAlign: 'center' }}><span className="spinner" /></td></tr>}
            {!isLoading && projects.length === 0 && (
              <tr><td className="td" colSpan={7}><div className="empty-state">Нет проектов</div></td></tr>
            )}
            {projects.map(p => (
              <tr key={p.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/projects/${p.id}`)}>
                <td className="td fw-500">{p.name}</td>
                <td className="td text-muted">{p.budget_project_name || '—'}</td>
                <td className="td text-right">{p.employee_count}</td>
                <td className="td text-right">{fmt(p.spent)}</td>
                <td className="td text-right">{fmt(p.forecast)}</td>
                <td className="td">
                  <span className="badge" style={{ background: `${statusColor(p.status)}20`, color: statusColor(p.status) }}>
                    {statusLabel(p.status)}
                  </span>
                </td>
                <td className="td">
                  <button className="btn btn-ghost btn-sm btn-icon" onClick={e => { e.stopPropagation(); setDeleteTarget(p) }}>🗑</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <Modal
          title="Новый проект"
          onClose={() => setShowModal(false)}
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Отмена</button>
              <button className="btn btn-primary" onClick={() => createMut.mutate({ ...form, budget_project_id: form.budget_project_id || null })} disabled={!form.name || createMut.isPending}>
                {createMut.isPending ? <span className="spinner" /> : 'Создать'}
              </button>
            </>
          }
        >
          <div className="form-group">
            <label className="label">Название *</label>
            <input className="input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} autoFocus />
          </div>
          <div className="form-group">
            <label className="label">Бюджетный проект</label>
            <select className="select" style={{ width: '100%' }} value={form.budget_project_id} onChange={e => setForm({ ...form, budget_project_id: e.target.value })}>
              <option value="">— не выбрано —</option>
              {budgetProjects.map(bp => <option key={bp.id} value={bp.id}>{bp.name} ({bp.year})</option>)}
            </select>
          </div>
        </Modal>
      )}

      {deleteTarget && (
        <Confirm
          message={`Удалить проект «${deleteTarget.name}»?`}
          onConfirm={() => deleteMut.mutate(deleteTarget.id)}
          onCancel={() => setDeleteTarget(null)}
          loading={deleteMut.isPending}
        />
      )}
    </div>
  )
}
