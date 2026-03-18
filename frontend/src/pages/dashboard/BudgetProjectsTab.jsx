import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  ResponsiveContainer,
} from 'recharts'
import { getDashboardByBudgetProjectMonthly } from '../../api'
import { fmt, MONTHS } from '../../utils'
import { COLORS, Section, CustomTooltip, EmptyState } from './shared'

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
              <div
                style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, cursor: 'pointer', padding: '6px 0' }}
                onClick={() => navigate(`/budget-projects/${bp.budget_project_id}`)}
              >
                <span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: 3, background: COLORS[bpIdx % COLORS.length], flexShrink: 0 }} />
                <span style={{ fontWeight: 600, fontSize: 14 }}>{bp.budget_project_name}</span>
                <span className="badge badge-blue" style={{ fontSize: 10 }}>{bp.projects_count} проектов</span>
                {bp.total_budget && <span className="text-muted text-small">бюджет: {fmt(bp.total_budget)} ₽</span>}
                <span style={{ marginLeft: 'auto', fontSize: 11, color: bp.total_diff > 0 ? 'var(--red)' : 'var(--green)' }}>
                  {bp.total_diff > 0 ? '+' : ''}{fmt(bp.total_diff)} ₽ откл.
                </span>
              </div>
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
                        <td className="td text-right" key={i} style={{ fontSize: 11, color: 'var(--accent)', ...(i === new Date().getMonth() && { background: '#fef9c3' }) }}>{v > 0 ? fmt(v) : '—'}</td>
                      ))}
                      <td className="td text-right fw-600" style={{ color: 'var(--accent)', fontSize: 12 }}>{fmt(bp.total_plan)}</td>
                    </tr>
                    <tr>
                      <td className="td text-small fw-500">Факт</td>
                      {bp.monthly_fact.map((v, i) => (
                        <td className="td text-right" key={i} style={{ fontSize: 11, ...(i === new Date().getMonth() && { background: '#fef9c3' }) }}>{v > 0 ? fmt(v) : '—'}</td>
                      ))}
                      <td className="td text-right fw-600" style={{ fontSize: 12 }}>{fmt(bp.total_fact)}</td>
                    </tr>
                    <tr style={{ background: 'var(--surface2)' }}>
                      <td className="td text-small fw-500 text-muted">Откл.</td>
                      {bp.monthly_diff.map((v, i) => (
                        <td className="td text-right" key={i} style={{ fontSize: 11, color: v > 0 ? 'var(--red)' : v < 0 ? 'var(--green)' : 'var(--text-3)', ...(i === new Date().getMonth() && { background: 'var(--border-light)' }) }}>
                          {Math.abs(v) > 0 ? `${v > 0 ? '+' : ''}${fmt(v)}` : '—'}
                        </td>
                      ))}
                      <td className="td text-right fw-600" style={{ fontSize: 12, color: bp.total_diff > 0 ? 'var(--red)' : bp.total_diff < 0 ? 'var(--green)' : undefined }}>
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

export default function BudgetProjectsTab({ year }) {
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
