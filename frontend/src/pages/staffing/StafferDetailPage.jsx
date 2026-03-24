import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getStaffer, updateStaffer, deleteStaffer, getProjects, getContractors,
  getStafferMonthRates, upsertStafferMonthRate, deleteStafferMonthRate,
} from '../../api'
import Confirm from '../../components/ui/Confirm'
import { useYearStore } from '../../store/year'

const MONTH_LABELS = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек']

function StafferRateGrid({ defaultRate, rateByMonth, onSave, onDelete, saving }) {
  const [editing, setEditing] = useState(null)
  const [editVal, setEditVal] = useState('')

  function startEdit(month) {
    const explicit = rateByMonth[month]
    setEditing(month)
    setEditVal(explicit != null ? String(explicit) : String(defaultRate ?? 0))
  }

  function commit() {
    if (editing === null) return
    const val = parseFloat(editVal)
    if (!isNaN(val) && val >= 0) onSave(editing, val)
    setEditing(null)
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') commit()
    if (e.key === 'Escape') setEditing(null)
  }

  const th = { padding: '7px 10px', fontSize: 11, fontWeight: 500, color: 'var(--text-2)', background: 'var(--surface2)', borderBottom: '1px solid var(--border)', borderRight: '1px solid var(--border-light)', textAlign: 'right', whiteSpace: 'nowrap' }
  const td = { padding: '7px 10px', borderBottom: '1px solid var(--border-light)', borderRight: '1px solid var(--border-light)', textAlign: 'right', fontSize: 13, cursor: 'pointer', minWidth: 72 }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', minWidth: 780 }}>
        <thead>
          <tr>
            <th style={{ ...th, textAlign: 'left', minWidth: 100, position: 'sticky', left: 0 }}>Компонент</th>
            {MONTH_LABELS.map((m, i) => (
              <th key={i} style={{ ...th, ...(i === new Date().getMonth() && { background: '#fef9c3' }) }}>{m}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={{ ...td, textAlign: 'left', background: 'var(--surface)', fontWeight: 500, color: 'var(--text)', position: 'sticky', left: 0 }}>
              Ставка ₽/ч
            </td>
            {Array.from({ length: 12 }, (_, i) => i + 1).map(month => {
              const explicit = rateByMonth[month]
              const isEditing = editing === month
              return (
                <td
                  key={month}
                  style={{
                    ...td,
                    background: isEditing ? 'var(--accent-light, #eff6ff)' : 'var(--surface)',
                    color: explicit != null ? 'var(--text)' : 'var(--text-3)',
                    fontWeight: explicit != null ? 600 : 400,
                  }}
                  onClick={() => !isEditing && startEdit(month)}
                  title={explicit != null
                    ? `Явная ставка: ${explicit} ₽/ч. Правой кнопкой — сбросить к базовой.`
                    : `Базовая ставка: ${defaultRate} ₽/ч. Нажмите для переопределения.`}
                  onContextMenu={e => { e.preventDefault(); if (explicit != null) onDelete(month) }}
                >
                  {isEditing ? (
                    <input
                      autoFocus
                      type="number"
                      min="0"
                      value={editVal}
                      onChange={e => setEditVal(e.target.value)}
                      onBlur={commit}
                      onKeyDown={handleKeyDown}
                      style={{ width: '100%', border: 'none', background: 'transparent', textAlign: 'right', fontSize: 13, outline: 'none', color: 'var(--accent)' }}
                    />
                  ) : explicit != null ? (
                    Number(explicit).toLocaleString('ru-RU')
                  ) : (
                    <span style={{ color: 'var(--text-3)', fontSize: 11 }}>{Number(defaultRate ?? 0).toLocaleString('ru-RU')}</span>
                  )}
                </td>
              )
            })}
          </tr>
        </tbody>
      </table>
      <div style={{ padding: '6px 10px', fontSize: 11, color: 'var(--text-3)' }}>
        <strong>Жирные</strong> значения — явная ставка для месяца. <span style={{ color: 'var(--text-3)' }}>Серые</span> — базовая ставка.
        Нажмите на ячейку для изменения. ПКМ — сбросить к базовой. Enter — сохранить, Esc — отмена.
      </div>
    </div>
  )
}

export default function StafferDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState(null)
  const [showDelete, setShowDelete] = useState(false)
  const { year, setYear } = useYearStore()

  const { data: staffer, isLoading } = useQuery({
    queryKey: ['staffer', id],
    queryFn: () => getStaffer(id),
  })

  useEffect(() => {
    if (staffer && !editing) setForm(toForm(staffer))
  }, [staffer, editing])

  const { data: projects = [] } = useQuery({ queryKey: ['projects-list'], queryFn: getProjects })
  const { data: contractors = [] } = useQuery({ queryKey: ['contractors-list'], queryFn: getContractors })

  const { data: monthRates = [] } = useQuery({
    queryKey: ['staffer-month-rates', id, year],
    queryFn: () => getStafferMonthRates(id, year),
    enabled: !!id,
  })

  const rateMut = useMutation({
    mutationFn: ({ month, hourly_rate }) => upsertStafferMonthRate(id, year, month, { hourly_rate }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['staffer-month-rates', id, year] })
      qc.invalidateQueries({ queryKey: ['staffer-matrix', year] })
    },
    onError: (e) => alert(e.response?.data?.detail || 'Ошибка сохранения ставки'),
  })

  const deleteRateMut = useMutation({
    mutationFn: ({ month }) => deleteStafferMonthRate(id, year, month),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['staffer-month-rates', id, year] })
      qc.invalidateQueries({ queryKey: ['staffer-matrix', year] })
    },
    onError: (e) => alert(e.response?.data?.detail || 'Ошибка сброса ставки'),
  })

  const rateByMonth = {}
  monthRates.forEach(r => { rateByMonth[r.month] = r.hourly_rate })

  function toForm(d) {
    return {
      first_name: d.first_name || '',
      last_name: d.last_name || '',
      middle_name: d.middle_name || '',
      specialization: d.specialization || '',
      hourly_rate: String(d.hourly_rate),
      valid_from: d.valid_from || '',
      valid_to: d.valid_to || '',
      pm_name: d.pm_name || '',
      comment: d.comment || '',
      contractor_id: d.contractor_id || '',
      project_id: d.project_id || '',
    }
  }

  const updateMut = useMutation({
    mutationFn: (data) => updateStaffer(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['staffer', id] })
      qc.invalidateQueries({ queryKey: ['staffers'] })
      setEditing(false)
    },
    onError: (e) => alert(e.response?.data?.detail || 'Ошибка сохранения'),
  })

  const deleteMut = useMutation({
    mutationFn: () => deleteStaffer(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['staffers'] }); navigate('/staffing') },
    onError: (e) => alert(e.response?.data?.detail || 'Ошибка удаления'),
  })

  if (isLoading) return <div className="spinner" style={{ margin: '40px auto', display: 'block' }} />
  if (!staffer) return <div>Стаффер не найден</div>

  const f = form || toForm(staffer)

  function handleSave() {
    updateMut.mutate({
      ...f,
      hourly_rate: parseFloat(f.hourly_rate) || 0,
      contractor_id: f.contractor_id || null,
      project_id: f.project_id || null,
      valid_to: f.valid_to || null,
      middle_name: f.middle_name || null,
      pm_name: f.pm_name || null,
      comment: f.comment || null,
    })
  }

  return (
    <div style={{ maxWidth: 720 }}>
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => navigate('/staffing')}>← Назад</button>
          <div>
            <div className="page-title">{staffer.full_name}</div>
            <div className="page-subtitle">{staffer.specialization || 'Стаффер'}</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {!editing && (
            <button type="button" className="btn btn-secondary" onClick={() => { setForm(toForm(staffer)); setEditing(true) }}>
              Редактировать
            </button>
          )}
          <button type="button" className="btn btn-danger" onClick={() => setShowDelete(true)}>Удалить</button>
        </div>
      </div>

      <div className="card" style={{ padding: 24 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {[
            { label: 'Фамилия', key: 'last_name' },
            { label: 'Имя', key: 'first_name' },
            { label: 'Отчество', key: 'middle_name' },
            { label: 'Специализация', key: 'specialization' },
            { label: 'ПМ', key: 'pm_name' },
          ].map(({ label, key }) => (
            <div className="form-group" key={key}>
              <label className="label">{label}</label>
              {editing
                ? <input className="input" value={f[key]} onChange={e => setForm({ ...f, [key]: e.target.value })} />
                : <div style={{ padding: '6px 0', fontSize: 14 }}>{staffer[key] || '—'}</div>
              }
            </div>
          ))}

          <div className="form-group">
            <label className="label">Ставка ₽/ч</label>
            {editing
              ? <input className="input" type="number" min="0" value={f.hourly_rate} onChange={e => setForm({ ...f, hourly_rate: e.target.value })} />
              : <div style={{ padding: '6px 0', fontSize: 14, fontWeight: 600 }}>{Number(staffer.hourly_rate).toLocaleString('ru-RU')} ₽/ч</div>
            }
          </div>

          <div className="form-group">
            <label className="label">Дата начала</label>
            {editing
              ? <input className="input" type="date" value={f.valid_from} onChange={e => setForm({ ...f, valid_from: e.target.value })} />
              : <div style={{ padding: '6px 0', fontSize: 14 }}>{staffer.valid_from}</div>
            }
          </div>

          <div className="form-group">
            <label className="label">Дата окончания</label>
            {editing
              ? <input className="input" type="date" value={f.valid_to} onChange={e => setForm({ ...f, valid_to: e.target.value })} />
              : <div style={{ padding: '6px 0', fontSize: 14 }}>{staffer.valid_to || '∞'}</div>
            }
          </div>

          <div className="form-group">
            <label className="label">Проект</label>
            {editing
              ? (
                <select className="select" style={{ width: '100%' }} value={f.project_id} onChange={e => setForm({ ...f, project_id: e.target.value })}>
                  <option value="">— не выбрано —</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              )
              : <div style={{ padding: '6px 0', fontSize: 14 }}>{staffer.project_name || '—'}</div>
            }
          </div>

          <div className="form-group">
            <label className="label">Подрядчик</label>
            {editing
              ? (
                <select className="select" style={{ width: '100%' }} value={f.contractor_id} onChange={e => setForm({ ...f, contractor_id: e.target.value })}>
                  <option value="">— не выбрано —</option>
                  {contractors.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              )
              : <div style={{ padding: '6px 0', fontSize: 14 }}>{staffer.contractor_name || '—'}</div>
            }
          </div>
        </div>

        <div className="form-group" style={{ marginTop: 8 }}>
          <label className="label">Комментарий</label>
          {editing
            ? <textarea className="input" rows={3} value={f.comment} onChange={e => setForm({ ...f, comment: e.target.value })} />
            : <div style={{ padding: '6px 0', fontSize: 14, color: 'var(--text-2)' }}>{staffer.comment || '—'}</div>
          }
        </div>

        {editing && (
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button type="button" className="btn btn-primary" onClick={handleSave} disabled={updateMut.isPending}>
              {updateMut.isPending ? <span className="spinner" /> : 'Сохранить'}
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => setEditing(false)}>Отмена</button>
          </div>
        )}
      </div>

      {/* Monthly rates section */}
      <div className="card" style={{ padding: 24, marginTop: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 15 }}>Ставки по месяцам</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
              Базовая ставка: <strong>{Number(staffer.hourly_rate).toLocaleString('ru-RU')} ₽/ч</strong>.
              {' '}Укажите ставку для месяцев, в которых она отличается от базовой.
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setYear(year - 1)}>‹</button>
            <span style={{ fontWeight: 600, minWidth: 40, textAlign: 'center' }}>{year}</span>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setYear(year + 1)}>›</button>
          </div>
        </div>
        <StafferRateGrid
          defaultRate={staffer.hourly_rate}
          rateByMonth={rateByMonth}
          onSave={(month, hourly_rate) => rateMut.mutate({ month, hourly_rate })}
          onDelete={(month) => deleteRateMut.mutate({ month })}
          saving={rateMut.isPending || deleteRateMut.isPending}
        />
      </div>

      {showDelete && (
        <Confirm
          message={`Удалить стаффера «${staffer.full_name}»?`}
          onConfirm={() => deleteMut.mutate()}
          onCancel={() => setShowDelete(false)}
          loading={deleteMut.isPending}
        />
      )}
    </div>
  )
}
