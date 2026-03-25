import { useState } from 'react'
import { fmt, MONTHS } from '../../utils'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
  ResponsiveContainer,
} from 'recharts'

export const COLORS = [
  '#3b5bdb', '#0ea5e9', '#8b5cf6', '#ec4899', '#f59e0b',
  '#22c55e', '#ef4444', '#14b8a6', '#f97316', '#6366f1',
]

export function Section({ title, children, action }) {
  return (
    <div className="card" style={{ padding: '16px 20px', marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div className="fw-600" style={{ fontSize: 15 }}>{title}</div>
        {action}
      </div>
      {children}
    </div>
  )
}

export function CustomTooltip({ active, payload, label, currency }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 6, padding: '8px 12px', fontSize: 12, maxWidth: 260,
    }}>
      <div className="fw-500" style={{ marginBottom: 4 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color || p.fill }}>
          {p.name}: {currency ? fmt(p.value) + ' ₽' : p.value}
        </div>
      ))}
    </div>
  )
}

export function EmptyState({ text = 'Нет данных. Нажмите «Пересчитать» на странице Бюджеты.' }) {
  return (
    <div className="empty-state" style={{ padding: '24px 0' }}>{text}</div>
  )
}

export function PlanFactTable({ rows, nameKey, nameLabel = 'Проект', onRowClick }) {
  return (
    <div className="overflow-table">
      <table>
        <thead>
          <tr>
            <th className="th" style={{ minWidth: 180 }}>{nameLabel}</th>
            {MONTHS.map((m, i) => (
              <th className="th text-right" key={i} style={{ minWidth: 72, fontSize: 11, ...(i === new Date().getMonth() && { background: '#fef9c3' }) }}>
                {m}
              </th>
            ))}
            <th className="th text-right" style={{ minWidth: 100 }}>Итого</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => {
            const name = row[nameKey]
            const totalFact = row.total_fact

            return [
              <tr
                key={`${ri}-fact`}
                style={{ cursor: onRowClick ? 'pointer' : undefined }}
                onClick={() => onRowClick?.(row)}
              >
                <td className="td" style={{ fontWeight: 500 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span>{name}</span>
                    {row.budget_project_name && (
                      <span className="text-muted text-small" style={{ fontWeight: 400 }}>({row.budget_project_name})</span>
                    )}
                  </div>
                </td>
                {row.monthly_fact.map((v, i) => (
                  <td className="td text-right" key={i} style={{ fontSize: 12, ...(i === new Date().getMonth() && { background: '#fef9c3' }), color: 'var(--text)' }}>
                    {v > 0 ? fmt(v) : <span className="text-muted">—</span>}
                  </td>
                ))}
                <td className="td text-right" style={{ fontWeight: 600 }}>{fmt(totalFact)}</td>
              </tr>,
            ]
          })}
        </tbody>
      </table>
    </div>
  )
}

export function GroupMonthlySection({ title, data, nameKey, nameLabel, chartColorKey }) {
  const [showChart, setShowChart] = useState(true)
  const [highlightRow, setHighlightRow] = useState(null)

  const chartData = MONTHS.map((month, i) => {
    const entry = { month }
    data.forEach(row => {
      entry[row[nameKey]] = row.monthly[i]
    })
    return entry
  })

  const totalByGroup = data.map(row => ({ name: row[nameKey], total: row.total }))

  return (
    <Section
      title={title}
      action={
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowChart(v => !v)}>
          {showChart ? '📋 Таблица' : '📊 График'}
        </button>
      }
    >
      {data.length === 0 ? (
        <EmptyState text="Нет данных" />
      ) : showChart ? (
        <div>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip content={<CustomTooltip currency />} />
              <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
              {data.map((row, i) => (
                <Bar
                  key={row[nameKey]}
                  dataKey={row[nameKey]}
                  stackId="a"
                  fill={COLORS[i % COLORS.length]}
                  opacity={highlightRow === null || highlightRow === row[nameKey] ? 1 : 0.3}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 14 }}>
            {totalByGroup.map((g, i) => (
              <div
                key={g.name}
                style={{
                  background: COLORS[i % COLORS.length] + '18',
                  border: `1px solid ${COLORS[i % COLORS.length]}44`,
                  borderRadius: 8, padding: '8px 14px', cursor: 'pointer',
                  opacity: highlightRow === null || highlightRow === g.name ? 1 : 0.4,
                  transition: 'opacity 0.15s',
                }}
                onClick={() => setHighlightRow(highlightRow === g.name ? null : g.name)}
              >
                <div style={{ fontSize: 13, fontWeight: 600, color: COLORS[i % COLORS.length] }}>{fmt(g.total)} ₽</div>
                <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 2 }}>{g.name}</div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="overflow-table">
          <table>
            <thead>
              <tr>
                <th className="th" style={{ minWidth: 160 }}>{nameLabel}</th>
                {MONTHS.map((m, i) => (
                  <th className="th text-right" key={i} style={{ minWidth: 66, fontSize: 11, ...(i === new Date().getMonth() && { background: '#fef9c3' }) }}>
                    {m}
                  </th>
                ))}
                <th className="th text-right" style={{ minWidth: 100 }}>Итого</th>
              </tr>
            </thead>
            <tbody>
              {data.map((row, ri) => (
                <tr key={ri}>
                  <td className="td fw-500" style={{ fontSize: 13 }}>
                    <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: COLORS[ri % COLORS.length], marginRight: 8 }} />
                    {row[nameKey]}
                  </td>
                  {row.monthly.map((v, i) => (
                    <td className="td text-right" key={i} style={{ fontSize: 12, ...(i === new Date().getMonth() && { background: '#fef9c3' }), color: v > 0 ? 'var(--text)' : 'var(--text-3)' }}>
                      {v > 0 ? fmt(v) : '—'}
                    </td>
                  ))}
                  <td className="td text-right" style={{ fontWeight: 600 }}>{fmt(row.total)}</td>
                </tr>
              ))}
              <tr style={{ background: 'var(--surface2)' }}>
                <td className="td fw-600">Итого</td>
                {MONTHS.map((_, i) => {
                  const sum = data.reduce((s, row) => s + (row.monthly[i] || 0), 0)
                  return (
                    <td className="td text-right fw-500" key={i} style={{ fontSize: 12, ...(i === new Date().getMonth() && { background: '#fef9c3' }) }}>
                      {sum > 0 ? fmt(sum) : '—'}
                    </td>
                  )
                })}
                <td className="td text-right fw-600">{fmt(data.reduce((s, r) => s + r.total, 0))}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </Section>
  )
}
