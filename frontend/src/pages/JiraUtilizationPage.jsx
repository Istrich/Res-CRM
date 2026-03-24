import { useState, useRef, useCallback, useEffect } from 'react'
import * as XLSX from 'xlsx'
import { useQuery } from '@tanstack/react-query'
import { getWorkingHours } from '../api'
import { useYearStore } from '../store/year'
import { downloadBlob } from '../utils'

// ─── Default mapping (mirrors n8n workflow) ──────────────────────────────────

const DEFAULT_MAPPING = [
  { issueKey: 'PMO-48', category: 'Отпуск/больничный' },
  { issueKey: 'AN-4506', category: 'Отпуск/больничный' },
  { issueKey: 'COURT-3584', category: 'Отпуск/больничный' },
  { issueKey: 'PMO-72', category: 'Административные и кадровые вопросы' },
  { issueKey: 'COURT-3585', category: 'Административные и кадровые вопросы' },
  { issueKey: 'PMO-46', category: 'Командные активности' },
  { issueKey: 'AN-4504', category: 'Командные активности' },
  { issueKey: 'DSGN-431', category: 'Командные активности' },
  { issueKey: 'JMRU-14066', category: 'Командные активности' },
  { issueKey: 'COURT-3582', category: 'Командные активности' },
  { issueKey: 'JMOP-2158', category: 'Командные активности' },
  { issueKey: 'NR-4544', category: 'Командные активности' },
  { issueKey: 'BILL-1009', category: 'Командные активности' },
  { issueKey: 'PMO-47', category: 'Консультации и поддержка' },
  { issueKey: 'AN-4503', category: 'Консультации и поддержка' },
  { issueKey: 'DSGN-432', category: 'Консультации и поддержка' },
  { issueKey: 'JMRU-14065', category: 'Консультации и поддержка' },
  { issueKey: 'COURT-3581', category: 'Консультации и поддержка' },
  { issueKey: 'JMOP-2157', category: 'Консультации и поддержка' },
  { issueKey: 'BILL-1008', category: 'Консультации и поддержка' },
  { issueKey: 'PMO-51', category: 'Обучение / общение с лидом' },
  { issueKey: 'COURT-3583', category: 'Обучение / общение с лидом' },
  { issueKey: 'PMO-94', category: 'Задачи по развитию направления, общих процессов' },
  { issueKey: 'PMO-93', category: 'Работа лидов' },
]

const CATEGORIES = [
  'Административные и кадровые вопросы',
  'Задачи по развитию направления, общих процессов',
  'Командные активности',
  'Консультации и поддержка',
  'Обучение / общение с лидом',
  'Отпуск/больничный',
  'Работа лидов',
  'Рабочие задачи',
]

const STORAGE_KEY = 'jira_util_mapping_v1'

function loadMapping() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch (_) {}
  return DEFAULT_MAPPING
}

function saveMapping(mapping) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(mapping)) } catch (_) {}
}

// ─── Calc helpers ─────────────────────────────────────────────────────────────

function r1(n) { return Math.round((n + Number.EPSILON) * 10) / 10 }
function r2(n) { return Math.round((n + Number.EPSILON) * 100) / 100 }

function buildIssueMap(mapping) {
  const m = {}
  for (const { issueKey, category } of mapping) {
    if (issueKey && category) m[issueKey.trim().toUpperCase()] = category
  }
  return m
}

function normalizeRows(rawRows, issueMap) {
  return rawRows.map(row => {
    const user = String(row['User'] || row['Assignee'] || '').trim() || 'Без пользователя'
    const issueKey = String(row['Issue key'] || row['Issue Key'] || '').trim()
    const projectRaw = String(row['Project'] || '').trim()
    const project = projectRaw === 'COURT_DEV' ? 'Бустер ру' : (projectRaw || 'Без проекта')
    const hoursRaw = row['Time spent (hours)'] ?? row['Hours'] ?? row['Time Spent'] ?? 0
    const hours = Number(String(hoursRaw).replace(/\s+/g, '').replace(',', '.')) || 0
    const comment = String(row['Comment'] || row['Worklog comment'] || '').trim()
    const forced = issueMap[issueKey.toUpperCase()]
    const labels = forced || 'Рабочие задачи'
    return { user, project, issueKey, labels, hours, comment }
  })
}

function calcEmployees(rows, norm) {
  const byUser = new Map()
  for (const row of rows) {
    if (!byUser.has(row.user)) {
      const rec = { Сотрудник: row.user }
      for (const c of CATEGORIES) rec[c] = 0
      byUser.set(row.user, rec)
    }
    const rec = byUser.get(row.user)
    if (rec[row.labels] !== undefined) rec[row.labels] += row.hours
    else rec['Рабочие задачи'] += row.hours
  }
  return Array.from(byUser.values()).map(rec => {
    const total = CATEGORIES.reduce((s, c) => s + (rec[c] || 0), 0)
    const work = rec['Рабочие задачи'] || 0
    const vac = rec['Отпуск/больничный'] || 0
    const markedPct = norm > 0 ? (total / norm) * 100 : 0
    const utilPct = norm > 0 ? (work / norm) * 100 : 0
    const parts = []
    if (utilPct < 75) parts.push(vac > 0 ? 'Был отпуск/больничный' : 'Низкая фактическая утилизация')
    else if (vac > 0) parts.push('Был отпуск/больничный')
    if (total < norm - 1) parts.push(`Недоотмечено ${r1(norm - total)} ч`)
    return { ...rec, Итого: norm, 'Всего часов': r2(total), 'Отмечено %': r1(markedPct), 'Фактическая Утилизация %': r1(utilPct), Отклонения: parts.join('; ') }
  }).sort((a, b) => a.Сотрудник.localeCompare(b.Сотрудник, 'ru'))
}

function calcUnderX(empRows, norm) {
  return empRows
    .filter(r => Number(r['Всего часов']) < norm)
    .map(r => ({ ФИО: r.Сотрудник, 'Кол-во не отмеченных часов': r2(norm - Number(r['Всего часов'])) }))
    .sort((a, b) => b['Кол-во не отмеченных часов'] - a['Кол-во не отмеченных часов'])
}

function calcProjects(rows) {
  const byProject = new Map()
  for (const row of rows) {
    if (!byProject.has(row.project)) {
      const rec = { Проект: row.project }
      for (const c of CATEGORIES) rec[c] = 0
      byProject.set(row.project, rec)
    }
    const rec = byProject.get(row.project)
    if (rec[row.labels] !== undefined) rec[row.labels] += row.hours
    else rec['Рабочие задачи'] += row.hours
  }
  return Array.from(byProject.values()).map(rec => {
    const total = CATEGORIES.reduce((s, c) => s + (rec[c] || 0), 0)
    const work = rec['Рабочие задачи'] || 0
    return { ...rec, Итого: r2(total), 'Фактическая Утилизация %': r1(total > 0 ? (work / total) * 100 : 0) }
  }).sort((a, b) => a.Проект.localeCompare(b.Проект, 'ru'))
}

function calcLogs(rows) {
  const byUser = new Map()
  for (const row of rows) {
    if (!byUser.has(row.user)) byUser.set(row.user, { ФИО: row.user, 'Кол-во логов': 0, 'Кол-во логов без комментария': 0 })
    const rec = byUser.get(row.user)
    rec['Кол-во логов'] += 1
    if (!row.comment) rec['Кол-во логов без комментария'] += 1
  }
  return Array.from(byUser.values())
    .map(r => ({ ...r, '% логов без комментариев': r['Кол-во логов'] > 0 ? r1(r['Кол-во логов без комментария'] / r['Кол-во логов'] * 100) : 0 }))
    .filter(r => r['Кол-во логов без комментария'] > 0)
    .sort((a, b) => b['% логов без комментариев'] - a['% логов без комментариев'])
}

// ─── Excel export ─────────────────────────────────────────────────────────────

function exportSheet(data, sheetName, filename) {
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), sheetName)
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
  downloadBlob(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), filename)
}

function exportAll(results, filename) {
  const wb = XLSX.utils.book_new()
  const empCols = ['Сотрудник', ...CATEGORIES, 'Итого', 'Всего часов', 'Отмечено %', 'Фактическая Утилизация %', 'Отклонения']
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(results.empRows.map(r => Object.fromEntries(empCols.map(c => [c, r[c] ?? ''])))), 'Сотрудники')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(results.underRows), 'Недоотметившие')
  const projCols = ['Проект', ...CATEGORIES, 'Итого', 'Фактическая Утилизация %']
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(results.projRows.map(r => Object.fromEntries(projCols.map(c => [c, r[c] ?? ''])))), 'Проекты')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(results.logsRows), 'Логи без комментариев')
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
  downloadBlob(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${filename} — Утилизация_все_отчёты.xlsx`)
}

// ─── UI Components ────────────────────────────────────────────────────────────

function UtilPct({ pct }) {
  const n = Number(pct)
  const color = n >= 75 ? '#16a34a' : n >= 50 ? '#b45309' : '#ef4444'
  return <span style={{ color, fontWeight: 600 }}>{n}%</span>
}

// Mapping editor modal
function MappingModal({ mapping, onSave, onClose }) {
  const [rows, setRows] = useState(mapping.map(r => ({ ...r })))
  const [newKey, setNewKey] = useState('')
  const [newCat, setNewCat] = useState(CATEGORIES[0])

  const update = (i, field, val) => setRows(prev => prev.map((r, idx) => idx === i ? { ...r, [field]: val } : r))
  const remove = (i) => setRows(prev => prev.filter((_, idx) => idx !== i))
  const add = () => {
    if (!newKey.trim()) return
    setRows(prev => [...prev, { issueKey: newKey.trim().toUpperCase(), category: newCat }])
    setNewKey('')
  }
  const reset = () => setRows(DEFAULT_MAPPING.map(r => ({ ...r })))
  const handleSave = () => { onSave(rows.filter(r => r.issueKey && r.category)); onClose() }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 680 }}>
        <div className="modal-header">
          <span className="modal-title">Маппинг: Issue Key → Категория</span>
          <button type="button" className="btn btn-ghost btn-icon" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
          <p className="text-muted text-small" style={{ marginBottom: 12 }}>
            Задачи из этого списка будут отнесены к указанной категории. Всё остальное → «Рабочие задачи».
          </p>
          <div className="overflow-table">
            <table>
              <thead>
                <tr>
                  <th className="th" style={{ minWidth: 130 }}>Issue Key</th>
                  <th className="th" style={{ minWidth: 260 }}>Категория</th>
                  <th className="th" style={{ width: 40 }} />
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={i}>
                    <td className="td">
                      <input
                        className="input"
                        style={{ padding: '4px 8px', fontSize: 12 }}
                        value={row.issueKey}
                        onChange={e => update(i, 'issueKey', e.target.value.toUpperCase())}
                      />
                    </td>
                    <td className="td">
                      <select
                        className="select"
                        style={{ fontSize: 12, height: 30, padding: '2px 8px' }}
                        value={row.category}
                        onChange={e => update(i, 'category', e.target.value)}
                      >
                        {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </td>
                    <td className="td">
                      <button type="button" className="btn btn-ghost btn-sm btn-icon" onClick={() => remove(i)}>✕</button>
                    </td>
                  </tr>
                ))}
                {/* Add row */}
                <tr style={{ background: 'var(--surface2)' }}>
                  <td className="td">
                    <input
                      className="input"
                      style={{ padding: '4px 8px', fontSize: 12 }}
                      placeholder="PMO-123"
                      value={newKey}
                      onChange={e => setNewKey(e.target.value.toUpperCase())}
                      onKeyDown={e => e.key === 'Enter' && add()}
                    />
                  </td>
                  <td className="td">
                    <select className="select" style={{ fontSize: 12, height: 30, padding: '2px 8px' }} value={newCat} onChange={e => setNewCat(e.target.value)}>
                      {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </td>
                  <td className="td">
                    <button type="button" className="btn btn-primary btn-sm" onClick={add} disabled={!newKey.trim()}>+</button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        <div className="modal-footer" style={{ justifyContent: 'space-between' }}>
          <button type="button" className="btn btn-ghost btn-sm" onClick={reset}>↺ Сбросить к умолчаниям</button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>Отмена</button>
            <button type="button" className="btn btn-primary" onClick={handleSave}>Сохранить</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'employees', label: '👤 По сотрудникам' },
  { id: 'underx', label: '⚠️ Недоотмеченные' },
  { id: 'projects', label: '📁 По проектам' },
  { id: 'logs', label: '💬 Логи без комм.' },
]

export default function JiraUtilizationPage() {
  const { year } = useYearStore()
  const [mapping, setMapping] = useState(loadMapping)
  const [showMapping, setShowMapping] = useState(false)
  const [results, setResults] = useState(null)
  const [filename, setFilename] = useState('')
  const [activeTab, setActiveTab] = useState('employees')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [isDragOver, setIsDragOver] = useState(false)
  const fileInputRef = useRef(null)

  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1)
  const [manualNorm, setManualNorm] = useState(null) // null = auto from settings

  const { data: workingHoursData } = useQuery({
    queryKey: ['working-hours', year],
    queryFn: () => getWorkingHours(year),
  })

  const normFromSettings = workingHoursData?.items?.find(it => it.month === selectedMonth)?.hours ?? null
  const autoNorm = normFromSettings ?? 40
  const effectiveNorm = manualNorm !== null ? manualNorm : autoNorm
  const normHoursConfigured = normFromSettings !== null && normFromSettings !== undefined
  const isManualOverride = manualNorm !== null

  const handleNormInput = (val) => {
    const n = Number(val)
    setManualNorm(Number.isFinite(n) && n > 0 ? n : null)
  }
  const resetNorm = () => setManualNorm(null)

  const handleSaveMapping = (newMapping) => {
    setMapping(newMapping)
    saveMapping(newMapping)
    // Reprocess if we have data
    if (results) {
      const issueMap = buildIssueMap(newMapping)
      const normalized = normalizeRows(results._rawNormalized.map(r => r._original || r), issueMap)
      recompute(normalized, effectiveNorm)
    }
  }

  const recompute = useCallback((normalized, norm) => {
    const empRows = calcEmployees(normalized, norm)
    setResults({
      empRows,
      underRows: calcUnderX(empRows, norm),
      projRows: calcProjects(normalized),
      logsRows: calcLogs(normalized),
      rawCount: normalized.length,
      _normalized: normalized,
    })
  }, [])

  // Recompute when month or mapping changes (if file already loaded)
  useEffect(() => {
    if (results?._normalized) {
      recompute(results._normalized, effectiveNorm)
    }
  }, [selectedMonth, effectiveNorm])

  const processFile = useCallback(async (file) => {
    if (!file) return
    setError('')
    setLoading(true)
    setResults(null)

    try {
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array' })
      const sheetName = wb.SheetNames.find(n => n.toLowerCase() === 'details') || wb.SheetNames[0]
      if (!sheetName) throw new Error('Не найден лист в файле')

      const ws = wb.Sheets[sheetName]
      const rawRows = XLSX.utils.sheet_to_json(ws, { defval: '' })
      if (rawRows.length === 0) throw new Error('Лист пустой или нет строк данных')

      const firstRow = rawRows[0]
      const hasUser = 'User' in firstRow || 'Assignee' in firstRow
      const hasHours = 'Time spent (hours)' in firstRow || 'Hours' in firstRow || 'Time Spent' in firstRow
      if (!hasUser || !hasHours) {
        throw new Error('Не найдены обязательные колонки: User/Assignee и Time spent (hours)/Hours. Убедитесь, что загружена выгрузка Jira с листом Details.')
      }

      const issueMap = buildIssueMap(mapping)
      const normalized = normalizeRows(rawRows, issueMap)
      const empRows = calcEmployees(normalized, effectiveNorm)

      setResults({
        empRows,
        underRows: calcUnderX(empRows, effectiveNorm),
        projRows: calcProjects(normalized),
        logsRows: calcLogs(normalized),
        rawCount: rawRows.length,
        _normalized: normalized,
      })
      setFilename(file.name.replace(/\.[^/.]+$/, ''))
      setActiveTab('employees')
    } catch (e) {
      setError(e.message || 'Ошибка при обработке файла')
    } finally {
      setLoading(false)
    }
  }, [mapping, effectiveNorm])

  const handleFileChange = (e) => {
    const file = e.target.files?.[0]
    if (file) processFile(file)
    e.target.value = ''
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setIsDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file && (file.name.endsWith('.xlsx') || file.name.endsWith('.xls'))) processFile(file)
    else setError('Поддерживаются только файлы .xlsx / .xls')
  }

  const MONTH_NAMES = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек']

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Утилизация Jira</div>
          <div className="page-subtitle">Анализ трудозатрат по выгрузке ворклогов · {year}</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowMapping(true)}>
            ⚙️ Маппинг задач ({mapping.length})
          </button>
          {results && (
            <button type="button" className="btn btn-primary" onClick={() => exportAll(results, filename)}>
              ⬇ Все отчёты
            </button>
          )}
        </div>
      </div>

      {/* Upload + config card */}
      <div className="card" style={{ padding: '16px 20px', marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 14 }}>
          {/* Month selector */}
          <div className="form-group" style={{ margin: 0 }}>
            <label className="label" style={{ display: 'block', height: 20, lineHeight: '20px' }}>Месяц</label>
            <select
              className="select"
              value={selectedMonth}
              onChange={e => setSelectedMonth(Number(e.target.value))}
            >
              {MONTH_NAMES.map((m, i) => {
                const h = workingHoursData?.items?.find(it => it.month === i + 1)?.hours
                return (
                  <option key={i} value={i + 1}>
                    {m} {h != null ? `(${h} ч)` : ''}
                  </option>
                )
              })}
            </select>
          </div>

          {/* Norm input */}
          <div className="form-group" style={{ margin: 0, width: 130 }}>
            <label className="label" style={{ display: 'flex', alignItems: 'center', height: 20, gap: 6 }}>
              <span>Норма часов</span>
              {isManualOverride && (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  style={{ padding: '0 4px', fontSize: 11, height: 18, lineHeight: 1, marginLeft: 'auto' }}
                  onClick={resetNorm}
                  title="Вернуть к значению из настроек"
                >
                  ↺ авто
                </button>
              )}
            </label>
            <input
              type="number"
              className="input"
              min={1}
              max={744}
              value={isManualOverride ? manualNorm : effectiveNorm}
              onChange={e => handleNormInput(e.target.value)}
              style={{ width: '100%' }}
            />
          </div>

          {/* Drop zone */}
          <div style={{ flex: 1, minWidth: 240 }}>
            <label className="label" style={{ display: 'block', height: 20, lineHeight: '20px' }}>Выгрузка из Jira (.xlsx)</label>
            <div
              onDragOver={e => { e.preventDefault(); setIsDragOver(true) }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: `2px dashed ${isDragOver ? 'var(--accent)' : 'var(--border)'}`,
                borderRadius: 'var(--radius)',
                padding: '12px 20px',
                textAlign: 'center',
                cursor: 'pointer',
                background: isDragOver ? 'var(--accent-light)' : 'var(--surface2)',
                transition: 'all 0.15s',
                color: 'var(--text-2)',
                fontSize: 13,
              }}
            >
              {loading
                ? <><span className="spinner" style={{ width: 16, height: 16, verticalAlign: 'middle', marginRight: 8 }} />Обработка...</>
                : '📂 Перетащите файл или нажмите'
              }
            </div>
            <input ref={fileInputRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={handleFileChange} />
          </div>
        </div>

        {/* Norm hint row */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
          <span style={{ fontSize: 11, color: isManualOverride ? 'var(--accent)' : 'var(--text-3)' }}>
            {isManualOverride
              ? `Норма задана вручную: ${manualNorm} ч`
              : normHoursConfigured
                ? `Норма из настроек: ${effectiveNorm} ч (${MONTH_NAMES[selectedMonth - 1]})`
                : `Норма по умолчанию: 40 ч — рабочие часы для ${year} не настроены в `}
            {!normHoursConfigured && !isManualOverride && (
              <a href="/settings" style={{ color: 'var(--accent)', fontWeight: 600 }}>Настройках</a>
            )}
          </span>
        </div>

        {error && <div className="alert alert-error" style={{ marginBottom: 0 }}>{error}</div>}

        {results && !error && (
          <div className="alert alert-success" style={{ marginBottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span>✅ <strong>{filename}</strong> — {results.rawCount} строк · норма {effectiveNorm} ч ({MONTH_NAMES[selectedMonth - 1]} {year})</span>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setResults(null)}>Загрузить другой</button>
          </div>
        )}

        {!results && !error && (
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 8, lineHeight: 1.5 }}>
            Ожидается XLSX выгрузка из Jira (лист <strong>Details</strong>). Колонки: <strong>User</strong>, <strong>Issue key</strong>, <strong>Project</strong>, <strong>Labels</strong>, <strong>Time spent (hours)</strong>, <strong>Comment</strong>.
            Замените гиперссылки в «Issue key» на текст перед загрузкой.
          </div>
        )}
      </div>

      {/* Results */}
      {results && (
        <>
          {/* Summary KPIs */}
          {(() => {
            const utilVals = results.empRows.map(r => Number(r['Фактическая Утилизация %'])).filter(Number.isFinite)
            const avg = utilVals.length ? r1(utilVals.reduce((a, b) => a + b, 0) / utilVals.length) : 0
            const under = results.underRows.length
            const lowUtil = results.empRows.filter(r => Number(r['Фактическая Утилизация %']) < 75).length
            return (
              <div className="grid-4" style={{ marginBottom: 20 }}>
                <div className="stat-card">
                  <div className="stat-value">{results.empRows.length}</div>
                  <div className="stat-label">Сотрудников</div>
                </div>
                <div className="stat-card">
                  <div className="stat-value" style={{ color: avg >= 75 ? '#16a34a' : avg >= 50 ? '#b45309' : '#ef4444' }}>{avg}%</div>
                  <div className="stat-label">Средняя утилизация</div>
                </div>
                <div className="stat-card">
                  <div className="stat-value" style={{ color: under > 0 ? '#ef4444' : '#16a34a' }}>{under}</div>
                  <div className="stat-label">Отметили &lt; {effectiveNorm}ч</div>
                </div>
                <div className="stat-card">
                  <div className="stat-value" style={{ color: lowUtil > 0 ? '#b45309' : '#16a34a' }}>{lowUtil}</div>
                  <div className="stat-label">Утилизация &lt; 75%</div>
                </div>
              </div>
            )
          })()}

          <div className="tabs">
            {TABS.map(tab => (
              <div key={tab.id} className={`tab ${activeTab === tab.id ? 'active' : ''}`} onClick={() => setActiveTab(tab.id)}>
                {tab.label}
                {tab.id === 'underx' && results.underRows.length > 0 && (
                  <span className="badge badge-red" style={{ marginLeft: 6, fontSize: 10 }}>{results.underRows.length}</span>
                )}
                {tab.id === 'logs' && results.logsRows.length > 0 && (
                  <span className="badge badge-amber" style={{ marginLeft: 6, fontSize: 10 }}>{results.logsRows.length}</span>
                )}
              </div>
            ))}
          </div>

          <div className="card" style={{ padding: '16px 20px' }}>
            {activeTab === 'employees' && <EmployeesTab rows={results.empRows} norm={effectiveNorm} filename={filename} />}
            {activeTab === 'underx' && <UnderXTab rows={results.underRows} norm={effectiveNorm} filename={filename} />}
            {activeTab === 'projects' && <ProjectsTab rows={results.projRows} filename={filename} />}
            {activeTab === 'logs' && <LogsTab rows={results.logsRows} filename={filename} />}
          </div>
        </>
      )}

      {!results && !loading && !error && (
        <div className="card" style={{ padding: '48px 24px' }}>
          <div className="empty-state">
            <span style={{ fontSize: 48 }}>📊</span>
            <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)' }}>Загрузите выгрузку из Jira</span>
            <span className="text-muted">4 отчёта: сотрудники · недоотметившие · проекты · логи без комментариев</span>
          </div>
        </div>
      )}

      {showMapping && (
        <MappingModal mapping={mapping} onSave={handleSaveMapping} onClose={() => setShowMapping(false)} />
      )}
    </div>
  )
}

// ─── Tab components ───────────────────────────────────────────────────────────

function EmployeesTab({ rows, norm, filename }) {
  const cols = ['Сотрудник', ...CATEGORIES, 'Итого', 'Всего часов', 'Отмечено %', 'Фактическая Утилизация %', 'Отклонения']
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div className="fw-600">Утилизация по сотрудникам ({rows.length})</div>
        <button type="button" className="btn btn-secondary btn-sm"
          onClick={() => exportSheet(rows.map(r => Object.fromEntries(cols.map(c => [c, r[c] ?? '']))), 'report', `${filename} — Утилизация_сотрудники.xlsx`)}>
          ⬇ Excel
        </button>
      </div>
      <div className="overflow-table">
        <table>
          <thead>
            <tr>
              {cols.map(c => <th key={c} className="th" style={{ minWidth: c === 'Сотрудник' || c === 'Отклонения' ? 180 : 72, whiteSpace: 'nowrap', fontSize: 11 }}>{c}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} style={{ background: Number(row['Всего часов']) < norm ? '#fef2f2' : undefined }}>
                <td className="td fw-500" style={{ minWidth: 180 }}>{row.Сотрудник}</td>
                {CATEGORIES.map(c => (
                  <td key={c} className="td text-right text-small">{row[c] > 0 ? r2(row[c]) : <span className="text-muted">—</span>}</td>
                ))}
                <td className="td text-right">{row.Итого}</td>
                <td className="td text-right" style={{ color: Number(row['Всего часов']) < norm ? '#ef4444' : undefined, fontWeight: 500 }}>{row['Всего часов']}</td>
                <td className="td text-right">{row['Отмечено %']}%</td>
                <td className="td text-right"><UtilPct pct={row['Фактическая Утилизация %']} /></td>
                <td className="td text-small" style={{ color: row.Отклонения ? '#b45309' : 'var(--text-3)' }}>{row.Отклонения || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function UnderXTab({ rows, norm, filename }) {
  if (!rows.length) return (
    <div className="empty-state" style={{ padding: '32px 0' }}>
      <span style={{ fontSize: 32 }}>✅</span>
      <span>Все сотрудники отметили минимум {norm} ч</span>
    </div>
  )
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div className="fw-600">Отметили меньше {norm} ч — {rows.length} чел.</div>
        <button type="button" className="btn btn-secondary btn-sm"
          onClick={() => exportSheet(rows, 'report', `${filename} — Отмечено_меньше_${norm}ч.xlsx`)}>
          ⬇ Excel
        </button>
      </div>
      <table>
        <thead>
          <tr>
            <th className="th" style={{ minWidth: 220 }}>ФИО</th>
            <th className="th" style={{ minWidth: 220 }}>Не отмечено часов</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              <td className="td fw-500">{row.ФИО}</td>
              <td className="td" style={{ color: '#ef4444', fontWeight: 600 }}>{row['Кол-во не отмеченных часов']} ч</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ProjectsTab({ rows, filename }) {
  const cols = ['Проект', ...CATEGORIES, 'Итого', 'Фактическая Утилизация %']
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div className="fw-600">Утилизация по проектам ({rows.length})</div>
        <button type="button" className="btn btn-secondary btn-sm"
          onClick={() => exportSheet(rows.map(r => Object.fromEntries(cols.map(c => [c, r[c] ?? '']))), 'report', `${filename} — Утилизация_проекты.xlsx`)}>
          ⬇ Excel
        </button>
      </div>
      <div className="overflow-table">
        <table>
          <thead>
            <tr>
              {cols.map(c => <th key={c} className="th" style={{ minWidth: c === 'Проект' ? 160 : 72, whiteSpace: 'nowrap', fontSize: 11 }}>{c}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i}>
                <td className="td fw-500">{row.Проект}</td>
                {CATEGORIES.map(c => (
                  <td key={c} className="td text-right text-small">{row[c] > 0 ? r2(row[c]) : <span className="text-muted">—</span>}</td>
                ))}
                <td className="td text-right fw-500">{row.Итого}</td>
                <td className="td text-right"><UtilPct pct={row['Фактическая Утилизация %']} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function LogsTab({ rows, filename }) {
  if (!rows.length) return (
    <div className="empty-state" style={{ padding: '32px 0' }}>
      <span style={{ fontSize: 32 }}>✅</span>
      <span>Все логи имеют комментарии</span>
    </div>
  )
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div className="fw-600">Логи без комментариев — {rows.length} сотрудников</div>
        <button type="button" className="btn btn-secondary btn-sm"
          onClick={() => exportSheet(rows, 'report', `${filename} — Логи_без_комментариев.xlsx`)}>
          ⬇ Excel
        </button>
      </div>
      <table>
        <thead>
          <tr>
            <th className="th" style={{ minWidth: 220 }}>ФИО</th>
            <th className="th" style={{ minWidth: 120 }}>Кол-во логов</th>
            <th className="th" style={{ minWidth: 200 }}>Без комментария</th>
            <th className="th" style={{ minWidth: 160 }}>% без комментариев</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              <td className="td fw-500">{row.ФИО}</td>
              <td className="td text-right">{row['Кол-во логов']}</td>
              <td className="td text-right" style={{ color: '#ef4444', fontWeight: 600 }}>{row['Кол-во логов без комментария']}</td>
              <td className="td text-right">
                <span style={{ color: row['% логов без комментариев'] > 50 ? '#ef4444' : '#b45309', fontWeight: 600 }}>
                  {row['% логов без комментариев']}%
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
