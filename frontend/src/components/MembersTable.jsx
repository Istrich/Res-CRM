import { useState } from 'react'
import { fmtDate, MONTHS } from '../utils'

/** Editable date cell: click to show date input; nullable=true allows clearing (for valid_to). */
export function EditableDateCell({ value, nullable, onSave, saving }) {
  const [editing, setEditing] = useState(false)
  const [inputVal, setInputVal] = useState(value || '')

  const save = () => {
    const v = inputVal.trim()
    if (nullable && !v) {
      onSave(null)
    } else if (v) {
      onSave(v)
    } else {
      setInputVal(value || '')
    }
    setEditing(false)
  }

  if (editing) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
        <input
          className="input input-sm"
          type="date"
          style={{ width: 130 }}
          value={inputVal}
          onChange={e => setInputVal(e.target.value)}
          onBlur={save}
          onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { setInputVal(value || ''); setEditing(false) } }}
          autoFocus
        />
        {nullable && (
          <button type="button" className="btn btn-ghost btn-sm" style={{ fontSize: 11 }} onClick={() => { onSave(null); setEditing(false) }}>
            Без даты
          </button>
        )}
      </div>
    )
  }
  return (
    <button
      type="button"
      className="btn btn-ghost btn-sm text-muted"
      style={{ minWidth: 40, textAlign: 'left' }}
      onClick={() => { setInputVal(value || ''); setEditing(true) }}
      disabled={saving}
      title="Нажмите для изменения даты"
    >
      {value ? fmtDate(value) : (nullable ? 'по сей день' : '—')}
    </button>
  )
}

export function MemberRateCell({ value, assignmentId, month, year, onSave, saving }) {
  const [editing, setEditing] = useState(false)
  const [inputVal, setInputVal] = useState(String(value))

  const save = () => {
    const num = Number(inputVal)
    if (Number.isFinite(num) && num > 0) {
      onSave(num)
      setEditing(false)
    } else {
      setInputVal(String(value))
      setEditing(false)
    }
  }

  if (editing) {
    return (
      <input
        className="input input-sm"
        type="number"
        step="0.1"
        min="0.01"
        style={{ width: 56, textAlign: 'right' }}
        value={inputVal}
        onChange={e => setInputVal(e.target.value)}
        onBlur={save}
        onKeyDown={e => { if (e.key === 'Enter') save() }}
        autoFocus
      />
    )
  }
  return (
    <button
      type="button"
      className="btn btn-ghost btn-sm"
      style={{ minWidth: 48 }}
      onClick={() => { setInputVal(String(value)); setEditing(true) }}
      disabled={saving}
    >
      {value}
    </button>
  )
}

/**
 * Renders project members as a single table: with monthly rate columns when withRates and year are set, else simple rate column.
 */
export default function MembersTable({
  members,
  year,
  withRates,
  setRateMut,
  updateBaseRateMut,
  updateAssignmentDatesMut,
  setRemoveTarget,
  rateWarning,
  setRateWarning,
}) {
  if (members.length === 0) {
    return <div className="text-muted text-small">Нет участников</div>
  }

  if (withRates && year != null) {
    return (
      <>
        <div className="overflow-table">
          <table>
            <thead>
              <tr>
                <th className="th">Сотрудник / Позиция</th>
                <th className="th">Должность</th>
                <th className="th">Подразделение</th>
                {MONTHS.map((m, i) => <th className="th text-right" key={i} style={{ minWidth: 64, ...(i === new Date().getMonth() && { background: '#fef9c3' }) }}>{m}</th>)}
                <th className="th">С</th>
                <th className="th">По</th>
                <th className="th" />
              </tr>
            </thead>
            <tbody>
              {members.map(m => (
                <tr key={m.assignment_id}>
                  <td className="td">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {m.is_position ? <span className="badge badge-amber">Позиция</span> : <span className="badge badge-blue">Сотрудник</span>}
                      <span className="fw-500">{m.display_name}</span>
                    </div>
                  </td>
                  <td className="td">{m.title}</td>
                  <td className="td text-muted">{m.department || '—'}</td>
                  {(m.monthly_rates || Array(12).fill(m.rate)).map((r, i) => (
                    <td
                      className="td text-right"
                      key={i}
                      style={m.monthly_total_rates && (m.monthly_total_rates[i] < 1 || m.monthly_total_rates[i] > 1)
                        ? { background: 'var(--warning-bg, rgba(220, 150, 0, 0.12))' }
                        : undefined}
                      title={m.monthly_total_rates ? `Сумма ставок по всем проектам: ${m.monthly_total_rates[i]}` : undefined}
                    >
                      <MemberRateCell
                        value={r}
                        assignmentId={m.assignment_id}
                        month={i + 1}
                        year={year}
                        onSave={(rate) => setRateMut.mutate({
                          assignmentId: m.assignment_id,
                          month: i + 1,
                          rate,
                          displayName: m.display_name,
                        })}
                        saving={setRateMut.isPending}
                      />
                    </td>
                  ))}
                  <td className="td text-muted">
                    {updateAssignmentDatesMut ? (
                      <EditableDateCell
                        value={m.valid_from}
                        nullable={false}
                        onSave={(v) => updateAssignmentDatesMut.mutate({ assignmentId: m.assignment_id, valid_from: v })}
                        saving={updateAssignmentDatesMut.isPending}
                      />
                    ) : (
                      fmtDate(m.valid_from)
                    )}
                  </td>
                  <td className="td text-muted">
                    {updateAssignmentDatesMut ? (
                      <EditableDateCell
                        value={m.valid_to}
                        nullable
                        onSave={(v) => updateAssignmentDatesMut.mutate({ assignmentId: m.assignment_id, valid_to: v })}
                        saving={updateAssignmentDatesMut.isPending}
                      />
                    ) : (
                      (m.valid_to ? fmtDate(m.valid_to) : 'по сей день')
                    )}
                  </td>
                  <td className="td">
                    <button type="button" className="btn btn-ghost btn-sm btn-icon" onClick={() => setRemoveTarget(m)}>✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rateWarning && (
          <div className="alert alert-warning" style={{ marginTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <span>
              У <strong>{rateWarning.displayName}</strong> сумма ставок по всем проектам за {rateWarning.monthName}: <strong>{rateWarning.total}</strong>. Обычно ожидается 1.
            </span>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRateWarning(null)}>Скрыть</button>
          </div>
        )}
      </>
    )
  }

  return (
    <table>
      <thead>
        <tr>
          <th className="th">Сотрудник / Позиция</th>
          <th className="th">Должность</th>
          <th className="th">Подразделение</th>
          <th className="th text-right">Ставка</th>
          <th className="th">С</th>
          <th className="th">По</th>
          <th className="th" />
        </tr>
      </thead>
      <tbody>
        {members.map(m => (
          <tr key={m.assignment_id}>
            <td className="td">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {m.is_position ? <span className="badge badge-amber">Позиция</span> : <span className="badge badge-blue">Сотрудник</span>}
                <span className="fw-500">{m.display_name}</span>
              </div>
            </td>
            <td className="td">{m.title}</td>
            <td className="td text-muted">{m.department || '—'}</td>
            <td className="td text-right">
              {updateBaseRateMut ? (
                <MemberRateCell
                  value={m.rate}
                  assignmentId={m.assignment_id}
                  month={null}
                  year={year}
                  onSave={(rate) => updateBaseRateMut.mutate({ assignmentId: m.assignment_id, rate })}
                  saving={updateBaseRateMut.isPending}
                />
              ) : (
                m.rate
              )}
            </td>
            <td className="td text-muted">
              {updateAssignmentDatesMut ? (
                <EditableDateCell
                  value={m.valid_from}
                  nullable={false}
                  onSave={(v) => updateAssignmentDatesMut.mutate({ assignmentId: m.assignment_id, valid_from: v })}
                  saving={updateAssignmentDatesMut.isPending}
                />
              ) : (
                fmtDate(m.valid_from)
              )}
            </td>
            <td className="td text-muted">
              {updateAssignmentDatesMut ? (
                <EditableDateCell
                  value={m.valid_to}
                  nullable
                  onSave={(v) => updateAssignmentDatesMut.mutate({ assignmentId: m.assignment_id, valid_to: v })}
                  saving={updateAssignmentDatesMut.isPending}
                />
              ) : (
                (m.valid_to ? fmtDate(m.valid_to) : 'по сей день')
              )}
            </td>
            <td className="td">
              <button type="button" className="btn btn-ghost btn-sm btn-icon" onClick={() => setRemoveTarget(m)}>✕</button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
