import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import Modal from './ui/Modal'
import { getProjects, createAssignment } from '../api'

export default function AddAssignmentModal({ employeeId, onClose, onDone }) {
  const [projectId, setProjectId] = useState('')
  const [rate, setRate] = useState(1)
  const [validFrom, setValidFrom] = useState(new Date().toISOString().slice(0, 10))
  const [validTo, setValidTo] = useState('')
  const [error, setError] = useState('')

  const { data: projects = [] } = useQuery({ queryKey: ['projects-list'], queryFn: () => getProjects() })

  const mut = useMutation({
    mutationFn: createAssignment,
    onSuccess: onDone,
    onError: (e) => setError(e.response?.data?.detail || 'Ошибка'),
  })

  return (
    <Modal
      title="Добавить в проект"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Отмена</button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!projectId || mut.isPending}
            onClick={() => mut.mutate({ employee_id: employeeId, project_id: projectId, rate: Number(rate), valid_from: validFrom, valid_to: validTo || null })}
          >
            {mut.isPending ? <span className="spinner" /> : 'Сохранить'}
          </button>
        </>
      }
    >
      {error && <div className="alert alert-error">{error}</div>}
      <div className="form-group">
        <label className="label">Проект *</label>
        <select className="select" style={{ width: '100%' }} value={projectId} onChange={e => setProjectId(e.target.value)}>
          <option value="">— выберите проект —</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>
      <div className="grid-3">
        <div className="form-group">
          <label className="label">Ставка</label>
          <input className="input" type="number" step="0.1" min="0.1" value={rate} onChange={e => setRate(e.target.value)} />
        </div>
        <div className="form-group">
          <label className="label">С</label>
          <input className="input" type="date" value={validFrom} onChange={e => setValidFrom(e.target.value)} />
        </div>
        <div className="form-group">
          <label className="label">По</label>
          <input className="input" type="date" value={validTo} onChange={e => setValidTo(e.target.value)} />
          <div className="text-muted text-small" style={{ marginTop: 4 }}>Необязательно; если пусто — по сей день</div>
        </div>
      </div>
    </Modal>
  )
}

