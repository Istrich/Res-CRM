import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getEmployees, createEmployee, deleteEmployee, deleteAllEmployees, exportEmployees, importEmployees, importEmployeesExcel } from '../api'
import { useYearStore } from '../store/year'
import { MONTHS, fmt, fmtDate, downloadBlob } from '../utils'
import Modal from '../components/ui/Modal'
import Confirm from '../components/ui/Confirm'

const EMPTY_FORM = {
  is_position: false, first_name: '', last_name: '', middle_name: '',
  title: '', department: '', specialization: '', comment: '',
  hire_date: '', termination_date: '',
}

const IMPORT_HEADERS = [
  'Фамилия', 'Имя', 'Отчество', 'Специализация', 'Должность', 'Подразделение',
  'Дата найма', 'Дата увольнения', 'Комментарий',
]
const IMPORT_HEADER_MAP = {
  'фамилия': 'last_name', 'имя': 'first_name', 'отчество': 'middle_name',
  'специализация': 'specialization', 'должность': 'title', 'подразделение': 'department',
  'дата найма': 'hire_date', 'дата увольнения': 'termination_date', 'комментарий': 'comment',
}

function parseImportDate(s) {
  if (!s || typeof s !== 'string') return null
  const t = s.trim()
  if (!t) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t
  const d = t.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/)
  if (d) {
    const [, day, month, year] = d
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
  }
  const parsed = new Date(t)
  return isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10)
}

function parseImportTable(text) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  if (lines.length < 2) return { rows: [], error: 'Нужна строка заголовков и хотя бы одна строка данных' }
  const delim = lines[0].includes('\t') ? '\t' : ','
  const headerLine = lines[0].split(delim).map((c) => c.trim().toLowerCase())
  const colIndex = {}
  headerLine.forEach((h, i) => {
    const key = IMPORT_HEADER_MAP[h]
    if (key) colIndex[key] = i
  })
  const rows = []
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(delim).map((c) => c.trim())
    const row = {
      last_name: cells[colIndex.last_name] ?? null,
      first_name: cells[colIndex.first_name] ?? null,
      middle_name: cells[colIndex.middle_name] ?? null,
      specialization: cells[colIndex.specialization] ?? null,
      title: cells[colIndex.title] ?? null,
      department: cells[colIndex.department] ?? null,
      hire_date: parseImportDate(cells[colIndex.hire_date]),
      termination_date: parseImportDate(cells[colIndex.termination_date]),
      comment: cells[colIndex.comment] ?? null,
    }
    rows.push(row)
  }
  return { rows, error: null }
}

function formatApiError(detail) {
  if (detail == null) return 'Ошибка запроса'
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) return detail.map((x) => x.msg || x.loc?.join('.') || JSON.stringify(x)).join('; ')
  return String(detail)
}

function ImportModal({ paste, setPaste, parsed, setParsed, error, setError, successMessage, onImport, onImportExcel, onClose, loading, loadingExcel }) {
  const fileInputRef = useRef(null)
  const handleParse = () => {
    const { rows, error: err } = parseImportTable(paste)
    setParsed(err ? null : rows)
    setError(err || '')
  }
  const handleFileChange = (e) => {
    const file = e.target.files?.[0]
    if (file) onImportExcel(file)
    e.target.value = ''
    if (fileInputRef.current) fileInputRef.current.value = ''
  }
  return (
    <Modal
      title="Импорт сотрудников"
      onClose={onClose}
      wide
      footer={
        successMessage ? (
          <button className="btn btn-primary" onClick={onClose}>Закрыть</button>
        ) : (
          <>
            <button className="btn btn-secondary" onClick={onClose}>Отмена</button>
            {parsed ? (
              <button className="btn btn-primary" onClick={onImport} disabled={loading || parsed.length === 0}>
                {loading ? <span className="spinner" /> : `Импортировать ${parsed.length} записей`}
              </button>
            ) : (
              <button className="btn btn-primary" onClick={handleParse}>Проверить и показать превью</button>
            )}
          </>
        )
      }
    >
      {successMessage && (
        <div className="alert alert-success" style={{ marginBottom: 16 }}>
          {successMessage}
        </div>
      )}
      {error && (
        <div className="alert alert-error" style={{ marginBottom: 16 }}>
          {error}
        </div>
      )}
      <div style={{ marginBottom: 16 }}>
        <div className="fw-600" style={{ marginBottom: 6 }}>Файл Excel (.xlsx)</div>
        <label className="btn btn-secondary btn-sm" style={{ cursor: loadingExcel ? 'not-allowed' : 'pointer' }}>
          {loadingExcel ? <span className="spinner" /> : 'Выбрать файл и импортировать'}
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={handleFileChange}
            disabled={loadingExcel}
            style={{ display: 'none' }}
          />
        </label>
        <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 6 }}>Первая строка — заголовки: {IMPORT_HEADERS.join(', ')}.</p>
      </div>
      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16, marginTop: 16 }}>
        <div className="fw-600" style={{ marginBottom: 6 }}>Или вставьте таблицу</div>
        <p style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 12 }}>
          Столбцы: {IMPORT_HEADERS.join(', ')}. Разделитель: табуляция (из Excel) или запятая.
        </p>
      <textarea
        className="input"
        rows={8}
        placeholder={IMPORT_HEADERS.join('\t') + '\nИванов\tИван\tИванович\t...'}
        value={paste}
        onChange={(e) => setPaste(e.target.value)}
        style={{ width: '100%', fontFamily: 'monospace', fontSize: 12 }}
      />
      {parsed != null && parsed.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div className="fw-600" style={{ marginBottom: 8 }}>Превью ({parsed.length} строк)</div>
          <div className="overflow-table" style={{ maxHeight: 240 }}>
            <table>
              <thead>
                <tr>
                  {IMPORT_HEADERS.map((h) => <th className="th" key={h}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {parsed.slice(0, 15).map((row, idx) => (
                  <tr key={idx}>
                    <td className="td">{row.last_name || '—'}</td>
                    <td className="td">{row.first_name || '—'}</td>
                    <td className="td">{row.middle_name || '—'}</td>
                    <td className="td">{row.specialization || '—'}</td>
                    <td className="td">{row.title || '—'}</td>
                    <td className="td">{row.department || '—'}</td>
                    <td className="td">{row.hire_date || '—'}</td>
                    <td className="td">{row.termination_date || '—'}</td>
                    <td className="td text-small">{row.comment || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {parsed.length > 15 && <div className="text-muted text-small" style={{ marginTop: 4 }}>… и ещё {parsed.length - 15} строк</div>}
          <div className="text-small text-muted" style={{ marginTop: 8 }}>Строки с пустой должностью будут пропущены.</div>
        </div>
      )}
      </div>
    </Modal>
  )
}

export default function EmployeesPage() {
  const { year } = useYearStore()
  const qc = useQueryClient()
  const navigate = useNavigate()

  const [search, setSearch] = useState('')
  const [filterDept, setFilterDept] = useState('')
  const [filterSpec, setFilterSpec] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [importModal, setImportModal] = useState(false)
  const [importPaste, setImportPaste] = useState('')
  const [importParsed, setImportParsed] = useState(null)
  const [importError, setImportError] = useState('')
  const [importSuccessMessage, setImportSuccessMessage] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleteAllConfirm, setDeleteAllConfirm] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [formError, setFormError] = useState('')

  const { data: employees = [], isLoading } = useQuery({
    queryKey: ['employees', year, { search, department: filterDept, specialization: filterSpec }],
    queryFn: () => getEmployees({ year, search: search || undefined, department: filterDept || undefined, specialization: filterSpec || undefined }),
  })

  const createMut = useMutation({
    mutationFn: (data) => {
      const payload = {
        ...data,
        hire_date: data.hire_date?.trim() || null,
        termination_date: data.termination_date?.trim() || null,
      }
      return createEmployee(payload)
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['employees'] }); setShowModal(false); setForm(EMPTY_FORM) },
    onError: (e) => {
      const d = e.response?.data?.detail
      const msg = Array.isArray(d) ? d.map((x) => x.msg || x.loc?.join('.')).join(', ') : (d || 'Ошибка')
      setFormError(msg)
    },
  })

  const deleteMut = useMutation({
    mutationFn: deleteEmployee,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['employees'] }); setDeleteTarget(null) },
  })

  const deleteAllMut = useMutation({
    mutationFn: deleteAllEmployees,
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['employees'] })
      qc.invalidateQueries({ queryKey: ['employees', 'positions'] })
      setDeleteAllConfirm(false)
      const n = res?.deleted ?? 0
      alert(`Удалено записей: ${n}`)
    },
    onError: (e) => {
      alert(formatApiError(e.response?.data?.detail) || 'Ошибка')
    },
  })

  const importMut = useMutation({
    mutationFn: importEmployees,
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['employees'] })
      qc.invalidateQueries({ queryKey: ['employees', 'positions'] })
      setImportPaste('')
      setImportParsed(null)
      setImportError('')
      const created = res?.created ?? 0
      const skipped = res?.skipped ?? 0
      setImportSuccessMessage(`Импортировано: ${created} записей. Пропущено (пустая должность): ${skipped}.`)
    },
    onError: (e) => {
      setImportError(formatApiError(e.response?.data?.detail) || 'Ошибка')
    },
  })

  const importExcelMut = useMutation({
    mutationFn: importEmployeesExcel,
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['employees'] })
      qc.invalidateQueries({ queryKey: ['employees', 'positions'] })
      setImportError('')
      const created = res?.created ?? 0
      const skipped = res?.skipped ?? 0
      setImportSuccessMessage(`Импорт из Excel: создано ${created} записей, пропущено ${skipped}.`)
    },
    onError: (e) => {
      const detail = e.response?.data?.detail
      setImportError(formatApiError(detail) || 'Ошибка загрузки файла')
    },
  })

  const closeImportModal = () => {
    setImportModal(false)
    setImportPaste('')
    setImportParsed(null)
    setImportError('')
    setImportSuccessMessage(null)
  }

  const handleExport = async () => {
    const blob = await exportEmployees(year)
    downloadBlob(blob, `employees_${year}.xlsx`)
  }

  // Collect unique depts/specs for filter dropdowns
  const depts = [...new Set(employees.map(e => e.department).filter(Boolean))]
  const specs = [...new Set(employees.map(e => e.specialization).filter(Boolean))]

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Сотрудники и позиции</div>
          <div className="page-subtitle">{employees.length} записей</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="btn btn-secondary btn-sm" onClick={handleExport}>⬇ Excel</button>
          <button className="btn btn-secondary btn-sm" onClick={() => { setImportModal(true); setImportPaste(''); setImportParsed(null); setImportError('') }}>📥 Импорт</button>
          <button className="btn btn-primary" onClick={() => { setForm(EMPTY_FORM); setFormError(''); setShowModal(true) }}>+ Добавить</button>
          <button
            type="button"
            className="btn btn-danger btn-sm"
            style={{ marginLeft: 8 }}
            title="Временная кнопка для отладки импорта"
            onClick={() => setDeleteAllConfirm(true)}
          >
            Удалить всех сотрудников
          </button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="toolbar">
        <div className="toolbar-left">
          <div className="search-bar" style={{ width: 260 }}>
            🔍
            <input
              placeholder="Поиск по ФИО..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select className="select" value={filterDept} onChange={e => setFilterDept(e.target.value)}>
            <option value="">Все подразделения</option>
            {depts.map(d => <option key={d}>{d}</option>)}
          </select>
          <select className="select" value={filterSpec} onChange={e => setFilterSpec(e.target.value)}>
            <option value="">Все специализации</option>
            {specs.map(s => <option key={s}>{s}</option>)}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-table">
        <table>
          <thead>
            <tr>
              <th className="th">Сотрудник / Позиция</th>
              <th className="th">Должность</th>
              <th className="th">Подразделение</th>
              <th className="th">Специализация</th>
              <th className="th">Проекты / Ставки</th>
              <th className="th">Найм</th>
              <th className="th">Увольнение</th>
              {MONTHS.map((m, i) => (
                <th className="th" key={i} style={{ minWidth: 70, textAlign: 'right' }}>{m}</th>
              ))}
              <th className="th" />
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td className="td" colSpan={20} style={{ textAlign: 'center' }}><span className="spinner" /></td></tr>
            )}
            {!isLoading && employees.length === 0 && (
              <tr><td className="td" colSpan={20}><div className="empty-state">Нет записей</div></td></tr>
            )}
            {employees.map(emp => (
              <EmployeeRow
                key={emp.id}
                emp={emp}
                year={year}
                onOpen={() => navigate(`/employees/${emp.id}`)}
                onDelete={() => setDeleteTarget(emp)}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* Create modal */}
      {showModal && (
        <Modal
          title="Новый сотрудник / позиция"
          onClose={() => { setShowModal(false); setFormError('') }}
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Отмена</button>
              <button className="btn btn-primary" onClick={() => createMut.mutate(form)} disabled={createMut.isPending}>
                {createMut.isPending ? <span className="spinner" /> : 'Создать'}
              </button>
            </>
          }
        >
          {formError && <div className="alert alert-error">{formError}</div>}
          <EmployeeForm form={form} setForm={setForm} />
        </Modal>
      )}

      {/* Import modal */}
      {importModal && (
        <ImportModal
          paste={importPaste}
          setPaste={setImportPaste}
          parsed={importParsed}
          setParsed={setImportParsed}
          error={importError}
          setError={setImportError}
          successMessage={importSuccessMessage}
          onImport={() => importMut.mutate(importParsed)}
          onImportExcel={(file) => importExcelMut.mutate(file)}
          onClose={closeImportModal}
          loading={importMut.isPending}
          loadingExcel={importExcelMut.isPending}
        />
      )}

      {/* Delete confirm */}
      {deleteTarget && (
        <Confirm
          message={`Удалить «${deleteTarget.display_name}»? Все данные будут потеряны.`}
          onConfirm={() => deleteMut.mutate(deleteTarget.id)}
          onCancel={() => setDeleteTarget(null)}
          loading={deleteMut.isPending}
        />
      )}

      {/* Delete all (debug) */}
      {deleteAllConfirm && (
        <Confirm
          message="Удалить всех сотрудников и позиций? Все данные (в т.ч. назначения, зарплаты) будут удалены. Только для отладки импорта."
          onConfirm={() => deleteAllMut.mutate()}
          onCancel={() => setDeleteAllConfirm(false)}
          loading={deleteAllMut.isPending}
        />
      )}
    </div>
  )
}

function EmployeeRow({ emp, year, onOpen, onDelete }) {
  const isTerminated = emp.termination_date && new Date(emp.termination_date) < new Date()

  return (
    <tr style={{ cursor: 'pointer', opacity: isTerminated ? 0.6 : 1 }}>
      <td className="td" onClick={onOpen} style={{ minWidth: 180 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {emp.is_position
            ? <span className="badge badge-amber">Позиция</span>
            : isTerminated
              ? <span className="badge badge-gray">Уволен</span>
              : <span className="badge badge-blue">Сотрудник</span>
          }
          <span className="fw-500">{emp.display_name}</span>
        </div>
        {!emp.has_projects && !emp.is_position && (
          <div style={{ fontSize: 11, color: 'var(--amber)', marginTop: 2 }}>⚠ без проекта</div>
        )}
      </td>
      <td className="td" onClick={onOpen}>{emp.title}</td>
      <td className="td" onClick={onOpen}>{emp.department || '—'}</td>
      <td className="td" onClick={onOpen}>{emp.specialization || '—'}</td>
      <td className="td" onClick={onOpen} style={{ minWidth: 160 }}>
        {emp.assignments.length === 0
          ? <span className="text-muted">—</span>
          : emp.assignments.map(a => (
            <div key={a.id} style={{ fontSize: 12 }}>
              {a.project_name} <span className="text-muted">×{a.rate}</span>
            </div>
          ))
        }
      </td>
      <td className="td" onClick={onOpen} style={{ whiteSpace: 'nowrap' }}>{fmtDate(emp.hire_date)}</td>
      <td className="td" onClick={onOpen} style={{ whiteSpace: 'nowrap' }}>
        {emp.termination_date
          ? <span style={{ color: new Date(emp.termination_date) < new Date() ? 'var(--red)' : 'var(--amber)' }}>
              {fmtDate(emp.termination_date)}
            </span>
          : '—'}
      </td>
      {/* Monthly totals (year from context); green = raise month */}
      {MONTHS.map((_, i) => {
        const val = emp.monthly_totals?.[i]
        const isRaiseMonth = emp.monthly_is_raise?.[i] === true
        return (
          <td
            className="td text-right text-small"
            key={i}
            style={{
              minWidth: 70,
              ...(isRaiseMonth ? { background: 'var(--green-light, rgba(34, 197, 94, 0.12))' } : {}),
            }}
            title={isRaiseMonth ? 'Повышение с этого месяца' : undefined}
            onClick={onOpen}
          >
            {val != null && val > 0 ? fmt(val) : <span className="text-muted">—</span>}
          </td>
        )
      })}
      <td className="td">
        <button className="btn btn-ghost btn-sm btn-icon" onClick={(e) => { e.stopPropagation(); onDelete() }}>🗑</button>
      </td>
    </tr>
  )
}

export function EmployeeForm({ form, setForm }) {
  const safeForm = form || EMPTY_FORM
  const f = (field) => (e) => setForm({ ...safeForm, [field]: e.target.value })
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 }}>
          <input type="checkbox" checked={safeForm.is_position} onChange={e => setForm({ ...safeForm, is_position: e.target.checked })} />
          Это позиция (вакансия)
        </label>
      </div>
      {!safeForm.is_position && (
        <div className="grid-3">
          <div className="form-group"><label className="label">Фамилия</label><input className="input" value={safeForm.last_name} onChange={f('last_name')} /></div>
          <div className="form-group"><label className="label">Имя</label><input className="input" value={safeForm.first_name} onChange={f('first_name')} /></div>
          <div className="form-group"><label className="label">Отчество</label><input className="input" value={safeForm.middle_name} onChange={f('middle_name')} /></div>
        </div>
      )}
      <div className="grid-2">
        <div className="form-group">
          <label className="label">Должность *</label>
          <input className="input" value={safeForm.title} onChange={f('title')} required />
        </div>
        <div className="form-group">
          <label className="label">Подразделение</label>
          <input className="input" value={safeForm.department} onChange={f('department')} />
        </div>
      </div>
      <div className="form-group">
        <label className="label">Специализация</label>
        <input className="input" value={safeForm.specialization} onChange={f('specialization')} />
      </div>
      <div className="grid-2">
        <div className="form-group">
          <label className="label">Дата найма</label>
          <input className="input" type="date" value={safeForm.hire_date} onChange={f('hire_date')} />
        </div>
        <div className="form-group">
          <label className="label">Дата увольнения</label>
          <input className="input" type="date" value={safeForm.termination_date} onChange={f('termination_date')} />
        </div>
      </div>
      <div className="form-group">
        <label className="label">Комментарий</label>
        <textarea className="input" rows={2} value={safeForm.comment} onChange={f('comment')} />
      </div>
    </>
  )
}
