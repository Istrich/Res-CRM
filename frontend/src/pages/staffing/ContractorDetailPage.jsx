import { useState, useRef, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getContractor, updateContractor, deleteContractor,
  getContractorDocuments, uploadContractorDocument, deleteContractorDocument,
  contractorDocumentDownloadUrl,
} from '../../api'
import Confirm from '../../components/ui/Confirm'

export default function ContractorDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const fileRef = useRef(null)

  const [editing, setEditing] = useState(false)
  const [name, setName] = useState('')
  const [showDelete, setShowDelete] = useState(false)
  const [docToDelete, setDocToDelete] = useState(null)

  const { data: contractor, isLoading } = useQuery({
    queryKey: ['contractor', id],
    queryFn: () => getContractor(id),
  })

  useEffect(() => {
    if (contractor && !editing) setName(contractor.name)
  }, [contractor, editing])

  const { data: docs = [], isLoading: docsLoading } = useQuery({
    queryKey: ['contractor-docs', id],
    queryFn: () => getContractorDocuments(id),
  })

  const updateMut = useMutation({
    mutationFn: (data) => updateContractor(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contractor', id] })
      qc.invalidateQueries({ queryKey: ['contractors'] })
      setEditing(false)
    },
    onError: (e) => alert(e.response?.data?.detail || 'Ошибка сохранения'),
  })

  const deleteMut = useMutation({
    mutationFn: () => deleteContractor(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['contractors'] }); navigate('/staffing') },
    onError: (e) => alert(e.response?.data?.detail || 'Ошибка удаления'),
  })

  const uploadMut = useMutation({
    mutationFn: (file) => uploadContractorDocument(id, file),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['contractor-docs', id] }),
    onError: (e) => alert(e.response?.data?.detail || 'Ошибка загрузки'),
  })

  const deleteDocMut = useMutation({
    mutationFn: ({ docId }) => deleteContractorDocument(id, docId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['contractor-docs', id] }); setDocToDelete(null) },
    onError: (e) => alert(e.response?.data?.detail || 'Ошибка удаления'),
  })

  if (isLoading) return <div className="spinner" style={{ margin: '40px auto', display: 'block' }} />
  if (!contractor) return <div>Подрядчик не найден</div>

  return (
    <div style={{ maxWidth: 720 }}>
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => navigate('/staffing')}>← Назад</button>
          <div>
            <div className="page-title">{contractor.name}</div>
            <div className="page-subtitle">{contractor.staffer_count} стафферов</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {!editing && (
            <button type="button" className="btn btn-secondary" onClick={() => { setName(contractor.name); setEditing(true) }}>
              Переименовать
            </button>
          )}
          <button type="button" className="btn btn-danger" onClick={() => setShowDelete(true)}>Удалить</button>
        </div>
      </div>

      {editing && (
        <div className="card" style={{ padding: 16, marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
              <label className="label">Название</label>
              <input className="input" value={name} onChange={e => setName(e.target.value)} autoFocus />
            </div>
            <button type="button" className="btn btn-primary" onClick={() => updateMut.mutate({ name })} disabled={!name.trim() || updateMut.isPending}>
              {updateMut.isPending ? <span className="spinner" /> : 'Сохранить'}
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => setEditing(false)}>Отмена</button>
          </div>
        </div>
      )}

      {/* Staffers preview */}
      {contractor.staffers_preview.length > 0 && (
        <div className="card" style={{ padding: 16, marginBottom: 16 }}>
          <div style={{ fontWeight: 600, marginBottom: 10, fontSize: 13 }}>Стафферы ({contractor.staffer_count})</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {contractor.staffers_preview.map(s => (
              <span
                key={s.id}
                className="badge"
                style={{ background: 'var(--accent-light)', color: 'var(--accent)', cursor: 'pointer' }}
                onClick={() => navigate(`/staffing/staffers/${s.id}`)}
              >
                {s.full_name} · {s.valid_from}{s.valid_to ? ` — ${s.valid_to}` : ''}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Documents */}
      <div className="card" style={{ padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ fontWeight: 600, fontSize: 13 }}>Договоры и документы</div>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => fileRef.current?.click()}>
            + Загрузить файл
          </button>
          <input
            ref={fileRef}
            type="file"
            style={{ display: 'none' }}
            accept=".pdf,.docx,.doc"
            onChange={e => {
              const file = e.target.files?.[0]
              if (file) uploadMut.mutate(file)
              e.target.value = ''
            }}
          />
        </div>

        {docsLoading && <div style={{ textAlign: 'center' }}><span className="spinner" /></div>}
        {!docsLoading && docs.length === 0 && (
          <div className="empty-state" style={{ padding: '16px 0' }}>Файлы не загружены</div>
        )}
        {docs.map(doc => (
          <div
            key={doc.id}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '8px 0', borderBottom: '1px solid var(--border)',
            }}
          >
            <span style={{ fontSize: 13 }}>📄 {doc.filename}</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <a
                href={contractorDocumentDownloadUrl(id, doc.id)}
                target="_blank"
                rel="noreferrer"
                className="btn btn-ghost btn-sm"
              >
                Скачать
              </a>
              <button
                type="button"
                className="btn btn-ghost btn-sm btn-icon"
                onClick={() => setDocToDelete(doc)}
              >🗑</button>
            </div>
          </div>
        ))}

        {uploadMut.isPending && (
          <div style={{ textAlign: 'center', marginTop: 8, fontSize: 12, color: 'var(--text-3)' }}>
            <span className="spinner" /> Загрузка...
          </div>
        )}
      </div>

      {showDelete && (
        <Confirm
          message={`Удалить подрядчика «${contractor.name}»? Также будут удалены все файлы договоров.`}
          onConfirm={() => deleteMut.mutate()}
          onCancel={() => setShowDelete(false)}
          loading={deleteMut.isPending}
        />
      )}

      {docToDelete && (
        <Confirm
          message={`Удалить файл «${docToDelete.filename}»?`}
          onConfirm={() => deleteDocMut.mutate({ docId: docToDelete.id })}
          onCancel={() => setDocToDelete(null)}
          loading={deleteDocMut.isPending}
        />
      )}
    </div>
  )
}
