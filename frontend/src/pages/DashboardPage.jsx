import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LineChart, Line, CartesianGrid,
} from 'recharts'
import {
  getDashboardSummary, getDashboardByProject,
  getDashboardByDepartment, getDashboardBySpec, getMovements,
  getDashboardByBudgetProjectMonthly, getDashboardByProjectMonthly,
  getDashboardByDepartmentMonthly, getDashboardBySpecMonthly,
} from '../api'
import { useYearStore } from '../store/year'
import { fmt, MONTHS } from '../utils'

const COLORS = ['#3b5bdb', '#0ea5e9', '#8b5cf6', '#ec4899', '#f59e0b', '#22c55e', '#ef4444', '#14b8a6', '#f97316', '#6366f1']

// ─── Shared helpers ───────────────────────────────────────────────────────────

function Section({ title, children, action }) {
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

function CustomTooltip({ active, payload, label, currency }) {
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

function EmptyState({ text = 'Нет данных. Нажмите «Пересчитать» на странице Бюджеты.' }) {
  return (
    <div className="empty-state" style={{ padding: '24px 0' }}>{text}</div>
  )
}

// ─── Plan/Fact table ──────────────────────────────────────────────────────────

function PlanFactTable({ rows, nameKey, nameLabel = 'Проект', onRowClick }) {
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
              // Fact row
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

              // Expanded plan + diff rows
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

// ─── Dept/Spec monthly table with stacked chart toggle ───────────────────────

function GroupMonthlySection({ title, data, nameKey, nameLabel, chartColorKey }) {
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
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => setShowChart(v => !v)}
        >
          {showChart ? '📋 Таблица' : '📊 График'}
        </button>
      }
    >
      {data.length === 0 ? (
        <EmptyState text="Нет данных" />
      ) : showChart ? (
        <div>
          {/* Stacked bar chart by month */}
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

          {/* Summary pills */}
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
        /* Table view */
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
              {/* Total row */}
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

// ─── Budget project plan/fact section ────────────────────────────────────────

function BudgetProjectsPlanFact({ data, navigate }) {
  const [showChart, setShowChart] = useState(false)

  const chartData = MONTHS.map((month, i) => {
    const entry = { month }
    data.forEach(bp => {
      entry[bp.budget_project_name + '_plan'] = bp.monthly_plan[i]
      entry[bp.budget_project_name + '_fact'] = bp.monthly_fact[i]
    })
    return entry
  })

  if (data.length === 0) return <EmptyState />

  return (
    <Section
      title="Бюджетные проекты: план / факт по месяцам"
      action={
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowChart(v => !v)}>
          {showChart ? '📋 Таблица' : '📊 График'}
        </button>
      }
    >
      {showChart ? (
        <div>
          {data.slice(0, 5).map((bp, bpIdx) => {
            const chartRows = MONTHS.map((month, i) => ({
              month,
              'План': bp.monthly_plan[i],
              'Факт': bp.monthly_fact[i],
            }))
            return (
              <div key={bp.budget_project_id} style={{ marginBottom: 28 }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: COLORS[bpIdx % COLORS.length] }}>
                  {bp.budget_project_name}
                  <span className="text-muted text-small" style={{ marginLeft: 8, fontWeight: 400 }}>
                    Факт: {fmt(bp.total_fact)} ₽ · План: {fmt(bp.total_plan)} ₽ · Откл: {bp.total_diff > 0 ? '+' : ''}{fmt(bp.total_diff)} ₽
                  </span>
                </div>
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={chartRows} margin={{ top: 0, right: 8, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                    <Tooltip content={<CustomTooltip currency />} />
                    <Bar dataKey="План" fill={COLORS[bpIdx % COLORS.length] + '88'} radius={[2, 2, 0, 0]} />
                    <Bar dataKey="Факт" fill={COLORS[bpIdx % COLORS.length]} radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )
          })}
          {data.length > 5 && (
            <div className="text-muted text-small">Показаны первые 5 из {data.length} бюджетных проектов. Переключитесь в таблицу для полного списка.</div>
          )}
        </div>
      ) : (
        <div>
          {data.map((bp, bpIdx) => (
            <div key={bp.budget_project_id} style={{ marginBottom: 20 }}>
              {/* BP header */}
              <div
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6,
                  cursor: 'pointer', padding: '6px 0',
                }}
                onClick={() => navigate(`/budget-projects/${bp.budget_project_id}`)}
              >
                <span style={{
                  display: 'inline-block', width: 12, height: 12,
                  borderRadius: 3, background: COLORS[bpIdx % COLORS.length], flexShrink: 0,
                }} />
                <span style={{ fontWeight: 600, fontSize: 14 }}>{bp.budget_project_name}</span>
                <span className="badge badge-blue" style={{ fontSize: 10 }}>{bp.projects_count} проектов</span>
                {bp.total_budget && (
                  <span className="text-muted text-small">бюджет: {fmt(bp.total_budget)} ₽</span>
                )}
                <span style={{ marginLeft: 'auto', fontSize: 11, color: bp.total_diff > 0 ? 'var(--red)' : 'var(--green)' }}>
                  {bp.total_diff > 0 ? '+' : ''}{fmt(bp.total_diff)} ₽ откл.
                </span>
              </div>

              {/* 3-row plan/fact/diff table */}
              <div className="overflow-table" style={{ marginLeft: 22 }}>
                <table>
                  <thead>
                    <tr>
                      <th className="th" style={{ minWidth: 80, fontSize: 11 }}>Строка</th>
                      {MONTHS.map((m, i) => (
                        <th className="th text-right" key={i} style={{ minWidth: 68, fontSize: 10, ...(i === new Date().getMonth() && { background: '#fef9c3' }) }}>{m}</th>
                      ))}
                      <th className="th text-right" style={{ minWidth: 90, fontSize: 11 }}>Итого</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="td text-small fw-500" style={{ color: 'var(--accent)' }}>План</td>
                      {bp.monthly_plan.map((v, i) => (
                        <td className="td text-right" key={i} style={{ fontSize: 11, color: 'var(--accent)', ...(i === new Date().getMonth() && { background: '#fef9c3' }) }}>
                          {v > 0 ? fmt(v) : '—'}
                        </td>
                      ))}
                      <td className="td text-right fw-600" style={{ color: 'var(--accent)', fontSize: 12 }}>{fmt(bp.total_plan)}</td>
                    </tr>
                    <tr>
                      <td className="td text-small fw-500">Факт</td>
                      {bp.monthly_fact.map((v, i) => (
                        <td className="td text-right" key={i} style={{ fontSize: 11, ...(i === new Date().getMonth() && { background: '#fef9c3' }) }}>
                          {v > 0 ? fmt(v) : '—'}
                        </td>
                      ))}
                      <td className="td text-right fw-600" style={{ fontSize: 12 }}>{fmt(bp.total_fact)}</td>
                    </tr>
                    <tr style={{ background: 'var(--surface2)' }}>
                      <td className="td text-small fw-500 text-muted">Откл.</td>
                      {bp.monthly_diff.map((v, i) => (
                        <td className="td text-right" key={i} style={{
                          fontSize: 11,
                          color: v > 0 ? 'var(--red)' : v < 0 ? 'var(--green)' : 'var(--text-3)',
                          ...(i === new Date().getMonth() && { background: 'var(--border-light)' }),
                        }}>
                          {Math.abs(v) > 0 ? `${v > 0 ? '+' : ''}${fmt(v)}` : '—'}
                        </td>
                      ))}
                      <td className="td text-right fw-600" style={{
                        fontSize: 12,
                        color: bp.total_diff > 0 ? 'var(--red)' : bp.total_diff < 0 ? 'var(--green)' : undefined,
                      }}>
                        {bp.total_diff !== 0 ? `${bp.total_diff > 0 ? '+' : ''}${fmt(bp.total_diff)}` : '—'}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {bpIdx < data.length - 1 && <div className="divider" style={{ marginTop: 16 }} />}
            </div>
          ))}
        </div>
      )}
    </Section>
  )
}

// ─── Overview tab ─────────────────────────────────────────────────────────────

function OverviewTab({ year }) {
  const [movementsMonth, setMovementsMonth] = useState(null)

  const { data: summary } = useQuery({ queryKey: ['dashboard-summary', year], queryFn: () => getDashboardSummary(year) })
  const { data: byProject = [] } = useQuery({ queryKey: ['dashboard-by-project', year], queryFn: () => getDashboardByProject(year) })
  const { data: byDept = [] } = useQuery({ queryKey: ['dashboard-by-dept', year], queryFn: () => getDashboardByDepartment(year) })
  const { data: bySpec = [] } = useQuery({ queryKey: ['dashboard-by-spec', year], queryFn: () => getDashboardBySpec(year) })
  const { data: movements = [] } = useQuery({ queryKey: ['dashboard-movements', year], queryFn: () => getMovements(year) })

  const monthlyData = summary?.monthly_spend?.map((m, i) => ({ month: MONTHS[i], amount: m.amount })) || []
  const selectedMovement = movementsMonth != null ? movements.find(m => m.month === movementsMonth + 1) : null

  return (
    <div>
      {/* KPI cards */}
      {summary && (
        <div className="grid-4" style={{ marginBottom: 20 }}>
          {[
            { label: 'Сотрудников', value: summary.employee_count },
            { label: 'Активных сейчас', value: summary.active_employee_count },
            { label: 'Открытых позиций', value: summary.position_count },
            { label: `Расходы ${year}`, value: fmt(summary.total_spend) + ' ₽' },
          ].map(({ label, value }) => (
            <div key={label} className="stat-card">
              <div className="stat-value">{value}</div>
              <div className="stat-label">{label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Monthly spend */}
      <Section title={`Расходы по месяцам — ${year}`}>
        {monthlyData.every(d => d.amount === 0)
          ? <EmptyState />
          : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={monthlyData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip content={<CustomTooltip currency />} />
                <Bar dataKey="amount" name="Расход" fill="#3b5bdb" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )
        }
      </Section>

      <div className="grid-2" style={{ marginBottom: 20 }}>
        {/* By project */}
        <Section title="По проектам (топ-8)">
          {byProject.length === 0
            ? <EmptyState text="Нет данных" />
            : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart
                  data={byProject.slice(0, 8).map(p => ({ name: p.project_name.slice(0, 16), total: p.total }))}
                  layout="vertical"
                  margin={{ top: 0, right: 8, bottom: 0, left: 80 }}
                >
                  <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={80} />
                  <Tooltip content={<CustomTooltip currency />} />
                  <Bar dataKey="total" name="Расход" fill="#0ea5e9" radius={[0, 3, 3, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )
          }
        </Section>

        {/* By department pie */}
        <Section title="По подразделениям">
          {byDept.length === 0
            ? <EmptyState text="Нет данных" />
            : (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={byDept.slice(0, 8).map(d => ({ name: d.department, value: d.total }))}
                    cx="50%" cy="50%"
                    innerRadius={50} outerRadius={85}
                    paddingAngle={2} dataKey="value"
                  >
                    {byDept.slice(0, 8).map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={v => fmt(v) + ' ₽'} />
                  <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            )
          }
        </Section>
      </div>

      {/* Movements */}
      <Section title="Движение персонала по месяцам">
        {movements.length === 0
          ? <EmptyState text="Нет данных" />
          : (
            <>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart
                  data={movements.map((m, i) => ({
                    month: MONTHS[i], active: m.active_count,
                    hired: m.hired_count, terminated: m.terminated_count, _month: i,
                  }))}
                  margin={{ top: 4, right: 8, bottom: 0, left: 0 }}
                  onClick={d => d?.activePayload && setMovementsMonth(
                    movementsMonth === d.activePayload[0]?.payload._month ? null : d.activePayload[0]?.payload._month
                  )}
                >
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="active" name="Активных" fill="#3b5bdb" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="hired" name="Принято" fill="#22c55e" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="terminated" name="Уволено" fill="#ef4444" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
              {selectedMovement && (
                <div style={{ marginTop: 14, padding: 12, background: 'var(--surface2)', borderRadius: 6, border: '1px solid var(--border)' }}>
                  <div className="fw-600" style={{ marginBottom: 8 }}>{MONTHS[movementsMonth]} — детализация</div>
                  <div className="grid-3">
                    {[
                      { label: 'Принято', color: 'var(--green)', list: selectedMovement.hired },
                      { label: 'Уволено', color: 'var(--red)', list: selectedMovement.terminated },
                    ].map(({ label, color, list }) => (
                      <div key={label}>
                        <div className="text-small fw-500" style={{ color, marginBottom: 4 }}>{label} ({list.length})</div>
                        {list.length === 0
                          ? <div className="text-muted text-small">—</div>
                          : list.map(e => <div key={e.id} className="text-small" style={{ marginBottom: 2 }}>{e.name}</div>)
                        }
                      </div>
                    ))}
                    <div>
                      <div className="text-small fw-500" style={{ color: 'var(--accent)', marginBottom: 4 }}>Активных ({selectedMovement.active_count})</div>
                      <div className="text-muted text-small">
                        {selectedMovement.active.slice(0, 5).map(e => e.name).join(', ')}
                        {selectedMovement.active.length > 5 ? ` и ещё ${selectedMovement.active.length - 5}` : ''}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )
        }
      </Section>
    </div>
  )
}

// ─── Budget projects tab ──────────────────────────────────────────────────────

function BudgetProjectsTab({ year }) {
  const navigate = useNavigate()
  const { data: bpData = [], isLoading } = useQuery({
    queryKey: ['dashboard-bp-monthly', year],
    queryFn: () => getDashboardByBudgetProjectMonthly(year),
  })

  if (isLoading) return <div className="empty-state"><span className="spinner" /></div>
  if (bpData.length === 0) return (
    <div className="card" style={{ padding: 32 }}>
      <EmptyState text="Нет бюджетных проектов за этот год. Создайте их на странице «Бюджетные проекты» и нажмите «Пересчитать» на странице «Бюджеты»." />
    </div>
  )

  // Year summary cards
  const totalPlan = bpData.reduce((s, bp) => s + bp.total_plan, 0)
  const totalFact = bpData.reduce((s, bp) => s + bp.total_fact, 0)

  return (
    <div>
      <div className="grid-3" style={{ marginBottom: 20 }}>
        <div className="stat-card">
          <div className="stat-value">{fmt(totalPlan)} ₽</div>
          <div className="stat-label">Суммарный план {year}</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{fmt(totalFact)} ₽</div>
          <div className="stat-label">Фактические расходы</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: totalFact - totalPlan > 0 ? 'var(--red)' : 'var(--green)' }}>
            {totalFact - totalPlan > 0 ? '+' : ''}{fmt(totalFact - totalPlan)} ₽
          </div>
          <div className="stat-label">Общее отклонение</div>
        </div>
      </div>

      <BudgetProjectsPlanFact data={bpData} navigate={navigate} />
    </div>
  )
}

// ─── Projects tab ─────────────────────────────────────────────────────────────

function ProjectsTab({ year }) {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [filterBp, setFilterBp] = useState('')

  const { data: projData = [], isLoading } = useQuery({
    queryKey: ['dashboard-proj-monthly', year],
    queryFn: () => getDashboardByProjectMonthly(year),
  })

  const budgetProjectNames = useMemo(() => {
    const names = new Set(projData.map(p => p.budget_project_name).filter(Boolean))
    return [...names].sort()
  }, [projData])

  const filtered = useMemo(() => {
    return projData.filter(p => {
      if (search && !p.project_name.toLowerCase().includes(search.toLowerCase())) return false
      if (filterBp && p.budget_project_name !== filterBp) return false
      return true
    })
  }, [projData, search, filterBp])

  if (isLoading) return <div className="empty-state"><span className="spinner" /></div>

  const totalFact = filtered.reduce((s, p) => s + p.total_fact, 0)
  const totalPlan = filtered.filter(p => p.total_plan != null).reduce((s, p) => s + (p.total_plan || 0), 0)

  return (
    <div>
      <div className="grid-3" style={{ marginBottom: 20 }}>
        <div className="stat-card">
          <div className="stat-value">{totalPlan > 0 ? fmt(totalPlan) + ' ₽' : '—'}</div>
          <div className="stat-label">Суммарный план (с планами)</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{fmt(totalFact)} ₽</div>
          <div className="stat-label">Фактические расходы</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{filtered.length}</div>
          <div className="stat-label">Проектов</div>
        </div>
      </div>

      <div className="card" style={{ padding: '16px 20px', marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          <div className="search-bar" style={{ width: 240 }}>
            🔍<input placeholder="Поиск по проекту..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          {budgetProjectNames.length > 0 && (
            <select className="select" value={filterBp} onChange={e => setFilterBp(e.target.value)}>
              <option value="">Все бюджетные проекты</option>
              {budgetProjectNames.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          )}
        </div>

        {filtered.length === 0 ? (
          <EmptyState text="Нет проектов с данными. Нажмите «Пересчитать» на странице «Бюджеты»." />
        ) : (
          <PlanFactTable
            rows={filtered}
            nameKey="project_name"
            nameLabel="Проект"
            onRowClick={row => navigate(`/projects/${row.project_id}`)}
          />
        )}
      </div>
    </div>
  )
}

// ─── Departments tab ─────────────────────────────────────────────────────────

function DepartmentsTab({ year }) {
  const { data = [], isLoading } = useQuery({
    queryKey: ['dashboard-dept-monthly', year],
    queryFn: () => getDashboardByDepartmentMonthly(year),
  })

  if (isLoading) return <div className="empty-state"><span className="spinner" /></div>

  const totalYear = data.reduce((s, d) => s + d.total, 0)

  return (
    <div>
      <div className="grid-3" style={{ marginBottom: 20 }}>
        <div className="stat-card">
          <div className="stat-value">{fmt(totalYear)} ₽</div>
          <div className="stat-label">Расходы на персонал {year}</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{data.length}</div>
          <div className="stat-label">Подразделений</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{data.length > 0 ? fmt(totalYear / 12) + ' ₽' : '—'}</div>
          <div className="stat-label">Среднемесячные расходы</div>
        </div>
      </div>

      {data.length === 0 ? (
        <div className="card" style={{ padding: 32 }}><EmptyState text="Нет данных по подразделениям." /></div>
      ) : (
        <GroupMonthlySection
          title="Расходы по подразделениям"
          data={data}
          nameKey="department"
          nameLabel="Подразделение"
        />
      )}
    </div>
  )
}

// ─── Specializations tab ─────────────────────────────────────────────────────

function SpecializationsTab({ year }) {
  const { data = [], isLoading } = useQuery({
    queryKey: ['dashboard-spec-monthly', year],
    queryFn: () => getDashboardBySpecMonthly(year),
  })

  if (isLoading) return <div className="empty-state"><span className="spinner" /></div>

  const totalYear = data.reduce((s, d) => s + d.total, 0)

  return (
    <div>
      <div className="grid-3" style={{ marginBottom: 20 }}>
        <div className="stat-card">
          <div className="stat-value">{fmt(totalYear)} ₽</div>
          <div className="stat-label">Расходы на персонал {year}</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{data.length}</div>
          <div className="stat-label">Специализаций</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{data.length > 0 ? data[0].specialization : '—'}</div>
          <div className="stat-label">Топ специализация по расходам</div>
        </div>
      </div>

      {data.length === 0 ? (
        <div className="card" style={{ padding: 32 }}><EmptyState text="Нет данных по специализациям." /></div>
      ) : (
        <GroupMonthlySection
          title="Расходы по специализациям"
          data={data}
          nameKey="specialization"
          nameLabel="Специализация"
        />
      )}
    </div>
  )
}

// ─── Main Dashboard ────────────────────────────────────────────────────────────

const TABS = [
  { id: 'overview', label: '📊 Обзор' },
  { id: 'budget-projects', label: '💼 Бюджетные проекты' },
  { id: 'projects', label: '📁 Проекты' },
  { id: 'departments', label: '🏢 Подразделения' },
  { id: 'specializations', label: '🎯 Специализации' },
]

export default function DashboardPage() {
  const { year } = useYearStore()
  const [activeTab, setActiveTab] = useState('overview')

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Дашборд</div>
          <div className="page-subtitle">Год: {year}</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs" style={{ marginBottom: 24 }}>
        {TABS.map(tab => (
          <div
            key={tab.id}
            className={`tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </div>
        ))}
      </div>

      {activeTab === 'overview' && <OverviewTab year={year} />}
      {activeTab === 'budget-projects' && <BudgetProjectsTab year={year} />}
      {activeTab === 'projects' && <ProjectsTab year={year} />}
      {activeTab === 'departments' && <DepartmentsTab year={year} />}
      {activeTab === 'specializations' && <SpecializationsTab year={year} />}
    </div>
  )
}
