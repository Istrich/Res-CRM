import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getContractors, createContractor, deleteContractor } from '../../api'
import Modal from '../../components/ui/Modal'
import Confirm from '../../components/ui/Confirm'

export default function ContractorsTab() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [showModal, setShowModal] = useState(false)
  const [name, setName] = useState('')
  const [deleteTarget, setDeleteTarget] = useState(null)

  const { data: contractors = [], isLoading } = useQuery({
    queryKey: ['contractors'],
    queryFn: getContractors,
  })

  const createMut = useMutation({
    mutationFn: createContractor,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contractors'] })
      qc.invalidateQueries({ queryKey: ['contractors-list'] })
      setShowModal(false)
      setName('')
    },
    onError: (e) => alert(e.response?.data?.detail || 'Ошибка создания'),
  })

  const deleteMut = useMutation({
    mutationFn: deleteContractor,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contractors'] })
      qc.invalidateQueries({ queryKey: ['contractors-list'] })
      setDeleteTarget(null)
    },
    onError: (e) => alert(e.response?.data?.detail || 'Ошибка удаления'),
  })

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <button type="button" className="btn btn-primary" onClick={() => setShowModal(true)}>
          + Добавить подрядчика
        </button>
      </div>

      <div className="card overflow-table">
        <table>
          <thead>
            <tr>
              <th className="th">Название</th>
              <th className="th text-right">Стафферов</th>
              <th className="th">Стафферы</th>
              <th className="th" />
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td className="td" colSpan={4} style={{ textAlign: 'center' }}><span className="spinner" /></td></tr>
            )}
            {!isLoading && contractors.length === 0 && (
              <tr><td className="td" colSpan={4}><div className="empty-state">Нет подрядчиков</div></td></tr>
            )}
            {contractors.map(c => (
              <tr key={c.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/staffing/contractors/${c.id}`)}>
                <td className="td fw-500">{c.name}</td>
                <td className="td text-right">{c.staffer_count}</td>
                <td className="td" style={{ color: 'var(--text-2)', fontSize: 12 }}>
                  {c.staffers_preview.slice(0, 3).map(s => (
                    <span key={s.id} style={{ marginRight: 8 }}>
                      {s.full_name} ({s.valid_from}{s.valid_to ? ` — ${s.valid_to}` : ''})
                    </span>
                  ))}
                  {c.staffers_preview.length > 3 && <span>+{c.staffers_preview.length - 3} ещё</span>}
                </td>
                <td className="td">
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm btn-icon"
                    onClick={e => { e.stopPropagation(); setDeleteTarget(c) }}
                  >🗑</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <Modal
          title="Новый подрядчик"
          onClose={() => { setShowModal(false); setName('') }}
          footer={
            <>
              <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Отмена</button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => createMut.mutate({ name })}
                disabled={!name.trim() || createMut.isPending}
              >
                {createMut.isPending ? <span className="spinner" /> : 'Создать'}
              </button>
            </>
          }
        >
          <div className="form-group">
            <label className="label">Название *</label>
            <input
              className="input"
              value={name}
              onChange={e => setName(e.target.value)}
              autoFocus
              onKeyDown={e => e.key === 'Enter' && name.trim() && createMut.mutate({ name })}
            />
          </div>
        </Modal>
      )}

      {deleteTarget && (
        <Confirm
          message={`Удалить подрядчика «${deleteTarget.name}»? Также будут удалены все связанные файлы договоров.`}
          onConfirm={() => deleteMut.mutate(deleteTarget.id)}
          onCancel={() => setDeleteTarget(null)}
          loading={deleteMut.isPending}
        />
      )}
    </div>
  )
}
