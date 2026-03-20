import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, PieChart, Pie, Cell, Legend,
  LineChart, Line, CartesianGrid, ResponsiveContainer,
} from 'recharts'
import { getDashboardSummary, getDashboardByProject, getDashboardByDepartment, getDashboardBySpec, getMovements } from '../../api'
import { fmt, MONTHS } from '../../utils'
import { COLORS, Section, CustomTooltip, EmptyState } from './shared'

export default function OverviewTab({ year }) {
  const [movementsMonth, setMovementsMonth] = useState(null)

  const { data: summary } = useQuery({ queryKey: ['dashboard-summary', year], queryFn: () => getDashboardSummary(year) })
  const { data: byProject = [] } = useQuery({ queryKey: ['dashboard-by-project', year], queryFn: () => getDashboardByProject(year) })
  const { data: byDept = [] } = useQuery({ queryKey: ['dashboard-by-dept', year], queryFn: () => getDashboardByDepartment(year) })
  const { data: bySpec = [] } = useQuery({ queryKey: ['dashboard-by-spec', year], queryFn: () => getDashboardBySpec(year) })
  const { data: movements = [] } = useQuery({ queryKey: ['dashboard-movements', year], queryFn: () => getMovements(year) })

  const today = new Date()
  const currentYear = today.getFullYear()
  const currentMonthIdx = today.getMonth() // 0-based

  const monthlyData = summary?.monthly_spend?.map((m, i) => {
    const planAmt = summary.monthly_plan?.[i]?.amount ?? 0
    if (year < currentYear) {
      // прошлый год: факт + план для сравнения
      return { month: MONTHS[i], fact: m.amount, plan: planAmt }
    } else if (year > currentYear) {
      // будущий год: только план
      return { month: MONTHS[i], fact: null, plan: planAmt }
    } else {
      // текущий год: прошлые месяцы — факт + план, будущие — только план
      return i < currentMonthIdx
        ? { month: MONTHS[i], fact: m.amount, plan: planAmt }
        : { month: MONTHS[i], fact: null, plan: planAmt }
    }
  }) || []

  const selectedMovement = movementsMonth != null ? movements.find(m => m.month === movementsMonth + 1) : null

  return (
    <div>
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

      <Section title={`Расходы по месяцам — ${year}`}>
        {monthlyData.every(d => !d.fact && !d.plan)
          ? <EmptyState />
          : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={monthlyData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }} barCategoryGap="20%">
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip content={<CustomTooltip currency />} />
                <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="fact" name="Факт" fill="#3b5bdb" radius={[3, 3, 0, 0]} />
                <Bar dataKey="plan" name="План" fill="#94a3b8" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )
        }
      </Section>

      {/* Расходы по проектам — столбчатая диаграмма, все проекты */}
      <Section title="По проектам">
        {byProject.length === 0
          ? <EmptyState text="Нет данных" />
          : (() => {
              const projectData = byProject.map(p => ({ name: p.project_name.slice(0, 14), total: p.total }))
              const chartWidth = Math.max(500, projectData.length * 72)
              return (
                <div style={{ overflowX: 'auto' }}>
                  <div style={{ width: chartWidth, height: 280 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={projectData}
                        margin={{ top: 4, right: 8, bottom: 56, left: 0 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                        <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-30} textAnchor="end" interval={0} />
                        <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                        <Tooltip content={<CustomTooltip currency />} />
                        <Bar dataKey="total" name="Расход" fill="#0ea5e9" radius={[3, 3, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )
            })()
        }
      </Section>

      {/* Круговые диаграммы: по подразделениям и по специализациям */}
      <div className="grid-2" style={{ marginBottom: 20 }}>
        <Section title="По подразделениям">
          {byDept.length === 0
            ? <EmptyState text="Нет данных" />
            : (
              <ResponsiveContainer width="100%" height={240}>
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

        <Section title="По специализациям">
          {bySpec.length === 0
            ? <EmptyState text="Нет данных" />
            : (
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie
                    data={bySpec.slice(0, 10).map(s => ({ name: s.specialization, value: s.total }))}
                    cx="50%" cy="50%"
                    innerRadius={50} outerRadius={85}
                    paddingAngle={2} dataKey="value"
                  >
                    {bySpec.slice(0, 10).map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={v => fmt(v) + ' ₽'} />
                  <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            )
          }
        </Section>
      </div>

      {/* Движение персонала — линейный график */}
      <Section title="Движение персонала по месяцам">
        {movements.length === 0
          ? <EmptyState text="Нет данных" />
          : (
            <>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart
                  data={movements.map((m, i) => ({
                    month: MONTHS[i], active: m.active_count,
                    hired: m.hired_count, terminated: m.terminated_count, _month: i,
                  }))}
                  margin={{ top: 4, right: 8, bottom: 0, left: 0 }}
                  onClick={d => d?.activePayload && setMovementsMonth(
                    movementsMonth === d.activePayload[0]?.payload._month ? null : d.activePayload[0]?.payload._month
                  )}
                  style={{ cursor: 'pointer' }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                  <Line dataKey="active" name="Активных" stroke="#3b5bdb" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                  <Line dataKey="hired" name="Принято" stroke="#22c55e" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                  <Line dataKey="terminated" name="Уволено" stroke="#ef4444" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
              <div className="text-muted text-small" style={{ marginTop: 6 }}>Кликните на точку для детализации по месяцу</div>
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
