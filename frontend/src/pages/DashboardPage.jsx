import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts'
import {
  getDashboardSummary, getDashboardByProject,
  getDashboardByDepartment, getDashboardBySpec, getMovements,
} from '../api'
import { useYearStore } from '../store/year'
import { fmt, MONTHS } from '../utils'

const COLORS = ['#3b5bdb', '#0ea5e9', '#8b5cf6', '#ec4899', '#f59e0b', '#22c55e', '#ef4444', '#14b8a6']

function Section({ title, children }) {
  return (
    <div className="card" style={{ padding: '16px 20px', marginBottom: 20 }}>
      <div className="fw-600" style={{ marginBottom: 14, fontSize: 15 }}>{title}</div>
      {children}
    </div>
  )
}

function CustomTooltip({ active, payload, label, currency }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 6, padding: '8px 12px', fontSize: 12,
    }}>
      <div className="fw-500" style={{ marginBottom: 4 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color }}>
          {p.name}: {currency ? fmt(p.value) + ' ₽' : p.value}
        </div>
      ))}
    </div>
  )
}

export default function DashboardPage() {
  const { year } = useYearStore()
  const [movementsMonth, setMovementsMonth] = useState(null)

  const { data: summary } = useQuery({
    queryKey: ['dashboard-summary', year],
    queryFn: () => getDashboardSummary(year),
  })

  const { data: byProject = [] } = useQuery({
    queryKey: ['dashboard-by-project', year],
    queryFn: () => getDashboardByProject(year),
  })

  const { data: byDept = [] } = useQuery({
    queryKey: ['dashboard-by-dept', year],
    queryFn: () => getDashboardByDepartment(year),
  })

  const { data: bySpec = [] } = useQuery({
    queryKey: ['dashboard-by-spec', year],
    queryFn: () => getDashboardBySpec(year),
  })

  const { data: movements = [] } = useQuery({
    queryKey: ['dashboard-movements', year],
    queryFn: () => getMovements(year),
  })

  const monthlyData = summary?.monthly_spend?.map((m, i) => ({
    month: MONTHS[i],
    amount: m.amount,
  })) || []

  const selectedMovement = movementsMonth != null
    ? movements.find(m => m.month === movementsMonth + 1)
    : null

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Дашборд</div>
          <div className="page-subtitle">Год: {year}</div>
        </div>
      </div>

      {/* KPI cards */}
      {summary && (
        <div className="grid-4" style={{ marginBottom: 20 }}>
          <div className="stat-card">
            <div className="stat-value">{summary.employee_count}</div>
            <div className="stat-label">Сотрудников всего</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{summary.active_employee_count}</div>
            <div className="stat-label">Активных сейчас</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{summary.position_count}</div>
            <div className="stat-label">Открытых позиций</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{fmt(summary.total_spend)} ₽</div>
            <div className="stat-label">Расходы за {year}</div>
          </div>
        </div>
      )}

      {/* Monthly spend chart */}
      <Section title={`Расходы по месяцам — ${year}`}>
        {monthlyData.length === 0 || monthlyData.every(d => d.amount === 0) ? (
          <div className="empty-state" style={{ padding: '24px 0' }}>
            Нет данных. Нажмите «Пересчитать» на странице Бюджеты.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={monthlyData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip content={<CustomTooltip currency />} />
              <Bar dataKey="amount" name="Расход" fill="#3b5bdb" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </Section>

      <div className="grid-2" style={{ marginBottom: 20 }}>
        {/* By project */}
        <Section title="По проектам (топ-8)">
          {byProject.length === 0 ? (
            <div className="text-muted text-small">Нет данных</div>
          ) : (
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
          )}
        </Section>

        {/* By department */}
        <Section title="По подразделениям">
          {byDept.length === 0 ? (
            <div className="text-muted text-small">Нет данных</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={byDept.slice(0, 8).map(d => ({ name: d.department, value: d.total }))}
                  cx="50%" cy="50%"
                  innerRadius={50} outerRadius={85}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {byDept.slice(0, 8).map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v) => fmt(v) + ' ₽'} />
                <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </Section>
      </div>

      {/* By specialization */}
      {bySpec.length > 0 && (
        <Section title="По специализациям">
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {bySpec.slice(0, 10).map((s, i) => (
              <div key={s.specialization} style={{
                background: COLORS[i % COLORS.length] + '18',
                border: `1px solid ${COLORS[i % COLORS.length]}44`,
                borderRadius: 8,
                padding: '10px 16px',
                minWidth: 140,
              }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: COLORS[i % COLORS.length] }}>
                  {fmt(s.total)} ₽
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 2 }}>{s.specialization}</div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Headcount movements */}
      <Section title="Движение персонала по месяцам">
        {movements.length === 0 ? (
          <div className="text-muted text-small">Нет данных</div>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart
                data={movements.map((m, i) => ({
                  month: MONTHS[i],
                  active: m.active_count,
                  hired: m.hired_count,
                  terminated: m.terminated_count,
                  _month: i,
                }))}
                margin={{ top: 4, right: 8, bottom: 0, left: 0 }}
                onClick={(d) => d?.activePayload && setMovementsMonth(
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
            <div className="text-small text-muted" style={{ marginTop: 6 }}>
              Нажмите на столбец для детализации
            </div>

            {/* Detail panel */}
            {selectedMovement && (
              <div style={{
                marginTop: 16, padding: 14,
                background: 'var(--surface2)', borderRadius: 6,
                border: '1px solid var(--border)',
              }}>
                <div className="fw-600" style={{ marginBottom: 10 }}>
                  {MONTHS[movementsMonth]} — детализация
                </div>
                <div className="grid-3">
                  <div>
                    <div className="text-small fw-500" style={{ color: 'var(--green)', marginBottom: 6 }}>
                      Принято ({selectedMovement.hired_count})
                    </div>
                    {selectedMovement.hired.length === 0
                      ? <div className="text-muted text-small">—</div>
                      : selectedMovement.hired.map(e => (
                        <div key={e.id} className="text-small" style={{ marginBottom: 3 }}>{e.name}</div>
                      ))}
                  </div>
                  <div>
                    <div className="text-small fw-500" style={{ color: 'var(--red)', marginBottom: 6 }}>
                      Уволено ({selectedMovement.terminated_count})
                    </div>
                    {selectedMovement.terminated.length === 0
                      ? <div className="text-muted text-small">—</div>
                      : selectedMovement.terminated.map(e => (
                        <div key={e.id} className="text-small" style={{ marginBottom: 3 }}>{e.name}</div>
                      ))}
                  </div>
                  <div>
                    <div className="text-small fw-500" style={{ color: 'var(--accent)', marginBottom: 6 }}>
                      Активных ({selectedMovement.active_count})
                    </div>
                    <div className="text-muted text-small">
                      {selectedMovement.active.slice(0, 5).map(e => e.name).join(', ')}
                      {selectedMovement.active.length > 5 ? ` и ещё ${selectedMovement.active.length - 5}` : ''}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </Section>
    </div>
  )
}
