import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { upsertSalary } from '../api'
import { MONTHS, fmt } from '../utils'

const FIELDS = [
  { key: 'salary', label: 'Оклад' },
  { key: 'kpi_bonus', label: 'KPI' },
  { key: 'fixed_bonus', label: 'Фикс. надбавка' },
  { key: 'one_time_bonus', label: 'Разовая премия' },
]

export default function SalaryTable({ employeeId, year, records = [] }) {
  const qc = useQueryClient()
  const [editing, setEditing] = useState(null) // { month, field }
  const [editVal, setEditVal] = useState('')

  // Build month map: month -> record
  const byMonth = {}
  records.forEach(r => { byMonth[r.month] = r })

  const mut = useMutation({
    mutationFn: ({ month, data }) => upsertSalary(employeeId, year, month, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['employee', employeeId] })
      qc.invalidateQueries({ queryKey: ['salary', employeeId, year] })
      setEditing(null)
    },
  })

  function startEdit(month, field, currentVal) {
    setEditing({ month, field })
    setEditVal(currentVal != null ? String(currentVal) : '0')
  }

  function commitEdit() {
    if (!editing) return
    const { month, field } = editing
    const rec = byMonth[month] || {}
    const data = {
      salary: Number(rec.salary || 0),
      kpi_bonus: Number(rec.kpi_bonus || 0),
      fixed_bonus: Number(rec.fixed_bonus || 0),
      one_time_bonus: Number(rec.one_time_bonus || 0),
      [field]: Number(editVal) || 0,
    }
    mut.mutate({ month, data })
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') commitEdit()
    if (e.key === 'Escape') setEditing(null)
  }

  const cellStyle = {
    padding: '7px 10px',
    borderBottom: '1px solid var(--border-light)',
    borderRight: '1px solid var(--border-light)',
    textAlign: 'right',
    fontSize: 13,
    cursor: 'pointer',
    minWidth: 90,
  }

  const headerStyle = {
    padding: '8px 10px',
    fontSize: 11,
    fontWeight: 500,
    color: 'var(--text-2)',
    background: 'var(--surface2)',
    borderBottom: '1px solid var(--border)',
    borderRight: '1px solid var(--border-light)',
    textAlign: 'right',
    whiteSpace: 'nowrap',
  }

  return (
    <div className="overflow-table">
      <table style={{ minWidth: 900 }}>
        <thead>
          <tr>
            <th style={{ ...headerStyle, textAlign: 'left', minWidth: 120, position: 'sticky', left: 0, zIndex: 1 }}>
              Компонент
            </th>
            {MONTHS.map((m, i) => (
              <th key={i} style={headerStyle}>{m}</th>
            ))}
            <th style={{ ...headerStyle, background: '#eef2ff' }}>Итого</th>
          </tr>
        </thead>
        <tbody>
          {FIELDS.map(({ key, label }) => {
            const yearTotal = Array.from({ length: 12 }, (_, i) => i + 1)
              .reduce((sum, m) => sum + Number(byMonth[m]?.[key] || 0), 0)
            return (
              <tr key={key}>
                <td style={{
                  ...cellStyle, textAlign: 'left', background: 'var(--surface)',
                  position: 'sticky', left: 0, fontWeight: 500, color: 'var(--text)',
                }}>
                  {label}
                </td>
                {Array.from({ length: 12 }, (_, i) => i + 1).map(month => {
                  const val = byMonth[month]?.[key]
                  const isEditing = editing?.month === month && editing?.field === key
                  return (
                    <td
                      key={month}
                      style={{
                        ...cellStyle,
                        background: isEditing ? 'var(--accent-light)' : 'var(--surface)',
                        color: val > 0 ? 'var(--text)' : 'var(--text-3)',
                      }}
                      onClick={() => !isEditing && startEdit(month, key, val)}
                    >
                      {isEditing ? (
                        <input
                          autoFocus
                          type="number"
                          value={editVal}
                          onChange={e => setEditVal(e.target.value)}
                          onBlur={commitEdit}
                          onKeyDown={handleKeyDown}
                          style={{
                            width: '100%', border: 'none', background: 'transparent',
                            textAlign: 'right', fontSize: 13, outline: 'none',
                            color: 'var(--accent)',
                          }}
                        />
                      ) : (
                        val > 0 ? fmt(val) : <span style={{ color: 'var(--border)' }}>—</span>
                      )}
                    </td>
                  )
                })}
                <td style={{ ...cellStyle, background: '#eef2ff', fontWeight: 600, color: 'var(--accent)' }}>
                  {yearTotal > 0 ? fmt(yearTotal) : '—'}
                </td>
              </tr>
            )
          })}
          {/* Total row */}
          <tr style={{ background: 'var(--surface2)' }}>
            <td style={{ ...cellStyle, textAlign: 'left', fontWeight: 700, position: 'sticky', left: 0, background: 'var(--surface2)' }}>
              Итого в месяц
            </td>
            {Array.from({ length: 12 }, (_, i) => i + 1).map(month => {
              const rec = byMonth[month]
              const total = rec ? rec.total : 0
              return (
                <td key={month} style={{ ...cellStyle, fontWeight: 600, background: 'var(--surface2)' }}>
                  {total > 0 ? fmt(total) : <span style={{ color: 'var(--border)' }}>—</span>}
                </td>
              )
            })}
            <td style={{ ...cellStyle, fontWeight: 700, background: '#dbeafe', color: 'var(--accent)' }}>
              {fmt(records.reduce((s, r) => s + r.total, 0))}
            </td>
          </tr>
        </tbody>
      </table>
      <div style={{ padding: '6px 10px', fontSize: 11, color: 'var(--text-3)' }}>
        Нажмите на ячейку для редактирования. Enter — сохранить, Esc — отмена.
      </div>
    </div>
  )
}
