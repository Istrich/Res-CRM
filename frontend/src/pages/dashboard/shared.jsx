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
  const [expanded, setExpanded] = useState(null)

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
            const isExpanded = expanded === ri
            const hasPlan = row.monthly_plan != null
            const totalFact = row.total_fact
            const totalPlan = row.total_plan

            return [
              <tr
                key={`${ri}-fact`}
                style={{ cursor: onRowClick ? 'pointer' : undefined }}
                onClick={() => onRowClick?.(row)}
              >
                <td className="td" style={{ fontWeight: 500 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {hasPlan && (
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm btn-icon"
                        style={{ padding: '2px 4px', fontSize: 10 }}
                        onClick={e => { e.stopPropagation(); setExpanded(isExpanded ? null : ri) }}
                        title={isExpanded ? 'Скрыть план' : 'Показать план и отклонение'}
                      >
                        {isExpanded ? '▲' : '▼'}
                      </button>
                    )}
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

              ...(isExpanded && hasPlan ? [
                <tr key={`${ri}-plan`} style={{ background: 'var(--accent-light)' }}>
                  <td className="td text-muted text-small" style={{ paddingLeft: 32 }}>план</td>
                  {row.monthly_plan.map((v, i) => (
                    <td className="td text-right text-small" key={i} style={{ color: 'var(--accent)', ...(i === new Date().getMonth() && { background: '#e8efff' }) }}>
                      {v > 0 ? fmt(v) : <span style={{ color: 'var(--border)' }}>—</span>}
                    </td>
                  ))}
                  <td className="td text-right text-small" style={{ color: 'var(--accent)', fontWeight: 600 }}>{fmt(totalPlan)}</td>
                </tr>,
                <tr key={`${ri}-diff`} style={{ background: 'var(--surface2)' }}>
                  <td className="td text-muted text-small" style={{ paddingLeft: 32 }}>откл.</td>
                  {row.monthly_plan.map((plan, i) => {
                    const fact = row.monthly_fact[i]
                    const diff = fact - plan
                    return (
                      <td className="td text-right text-small" key={i} style={{
                        color: diff > 0 ? 'var(--red)' : diff < 0 ? 'var(--green)' : 'var(--text-3)',
                        ...(i === new Date().getMonth() && { background: 'var(--border-light)' }),
                      }}>
                        {Math.abs(diff) > 0 ? `${diff > 0 ? '+' : ''}${fmt(diff)}` : '—'}
                      </td>
                    )
                  })}
                  <td className="td text-right text-small" style={{
                    color: totalFact - totalPlan > 0 ? 'var(--red)' : totalFact - totalPlan < 0 ? 'var(--green)' : undefined,
                    fontWeight: 600,
                  }}>
                    {totalFact - totalPlan !== 0 ? `${totalFact - totalPlan > 0 ? '+' : ''}${fmt(totalFact - totalPlan)}` : '—'}
                  </td>
                </tr>,
              ] : []),
            ]
          })}
        </tbody>
      </table>
      {rows.length > 0 && (
        <div className="text-muted text-small" style={{ padding: '8px 12px' }}>
          Нажмите ▼ рядом с названием чтобы раскрыть план и отклонение.
        </div>
      )}
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
