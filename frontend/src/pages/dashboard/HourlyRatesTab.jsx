import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer,
} from 'recharts'
import { getDashboardHourlyRates } from '../../api'
import { MONTHS } from '../../utils'
import { Section, EmptyState, COLORS } from './shared'

function fmtRate(v) {
  if (v == null) return '—'
  return `${Number(v).toLocaleString('ru-RU', { maximumFractionDigits: 0 })} ₽/ч`
}

function RateTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 6, padding: '8px 12px', fontSize: 12,
    }}>
      <div className="fw-500" style={{ marginBottom: 4 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.fill || p.color }}>
          {p.name}: {p.value != null ? `${Number(p.value).toLocaleString('ru-RU', { maximumFractionDigits: 0 })} ₽/ч` : '—'}
        </div>
      ))}
    </div>
  )
}

const CURRENT_MONTH = new Date().getMonth()

export default function HourlyRatesTab({ year }) {
  const [showMinMax, setShowMinMax] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard-hourly-rates', year],
    queryFn: () => getDashboardHourlyRates(year),
  })

  if (isLoading) return <div className="empty-state"><span className="spinner" /></div>
  if (!data) return null

  const { overall_monthly_avg, by_specialization, hours_configured } = data

  const nonNullAvgs = overall_monthly_avg.filter(v => v != null)
  const yearAvg = nonNullAvgs.length > 0
    ? Math.round(nonNullAvgs.reduce((s, v) => s + v, 0) / nonNullAvgs.length)
    : null

  const topSpec = by_specialization.length > 0
    ? by_specialization.reduce((best, s) => {
        const avg = s.monthly_avg.filter(v => v != null)
        const a = avg.length ? avg.reduce((x, v) => x + v, 0) / avg.length : 0
        const bestAvg = best.monthly_avg.filter(v => v != null)
        const b = bestAvg.length ? bestAvg.reduce((x, v) => x + v, 0) / bestAvg.length : 0
        return a > b ? s : best
      })
    : null

  const chartData = MONTHS.map((month, i) => ({
    month,
    avg: overall_monthly_avg[i] ?? undefined,
  }))

  return (
    <div>
      {!hours_configured && (
        <div style={{
          background: '#fef3c7', border: '1px solid #f59e0b', borderRadius: 8,
          padding: '12px 16px', marginBottom: 20, fontSize: 14, display: 'flex',
          alignItems: 'center', gap: 10,
        }}>
          <span style={{ fontSize: 18 }}>⚠️</span>
          <span>
            Рабочие часы для {year} года не настроены — часовые ставки не рассчитываются.{' '}
            <a href="/settings" style={{ color: 'var(--accent)', fontWeight: 600 }}>
              Перейти в Настройки
            </a>
          </span>
        </div>
      )}

      <div className="grid-4" style={{ marginBottom: 20 }}>
        <div className="stat-card">
          <div className="stat-value">{yearAvg != null ? `${yearAvg.toLocaleString('ru-RU')} ₽/ч` : '—'}</div>
          <div className="stat-label">Средняя ставка {year}</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{by_specialization.length}</div>
          <div className="stat-label">Специализаций с данными</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ fontSize: 15 }}>{topSpec?.specialization ?? '—'}</div>
          <div className="stat-label">Топ по ставке</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{nonNullAvgs.length}</div>
          <div className="stat-label">Месяцев с данными</div>
        </div>
      </div>

      <Section title={`Средняя часовая ставка по всем специалистам — ${year}`}>
        {nonNullAvgs.length === 0
          ? <EmptyState text="Нет данных. Настройте рабочие часы и зарплаты сотрудников." />
          : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${v.toLocaleString('ru-RU')} ₽`} />
                <Tooltip content={<RateTooltip />} />
                <Bar dataKey="avg" name="Ср. ставка" fill="#3b5bdb" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )
        }
      </Section>

      <Section
        title="Часовые ставки по специализациям"
        action={
          by_specialization.length > 0 && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setShowMinMax(v => !v)}
            >
              {showMinMax ? '▲ Скрыть мин/макс' : '▼ Показать мин/макс'}
            </button>
          )
        }
      >
        {by_specialization.length === 0
          ? <EmptyState text="Нет данных по специализациям." />
          : (
            <div className="overflow-table">
              <table>
                <thead>
                  <tr>
                    <th className="th" style={{ minWidth: 180 }}>Специализация</th>
                    <th className="th text-right" style={{ minWidth: 56, fontSize: 11 }}>Спец.</th>
                    {MONTHS.map((m, i) => (
                      <th
                        className="th text-right"
                        key={i}
                        style={{ minWidth: 72, fontSize: 11, ...(i === CURRENT_MONTH && { background: '#fef9c3' }) }}
                      >
                        {m}
                      </th>
                    ))}
                  </tr>
                  {showMinMax && (
                    <tr style={{ background: 'var(--surface2)' }}>
                      <td className="td text-muted text-small" colSpan={2} style={{ paddingLeft: 12 }}>
                        <span style={{ color: '#22c55e' }}>●</span> мин &nbsp;
                        <span style={{ color: '#ef4444' }}>●</span> макс
                      </td>
                      {MONTHS.map((_, i) => (
                        <td key={i} style={i === CURRENT_MONTH ? { background: '#fef9c3' } : undefined} />
                      ))}
                    </tr>
                  )}
                </thead>
                <tbody>
                  {by_specialization.map((row, ri) => (
                    <tr key={ri}>
                      <td className="td fw-500" style={{ fontSize: 13 }}>
                        <span style={{
                          display: 'inline-block', width: 10, height: 10,
                          borderRadius: 2, background: COLORS[ri % COLORS.length], marginRight: 8,
                        }} />
                        {row.specialization}
                      </td>
                      <td className="td text-right text-muted text-small">
                        {row.employees_count}
                      </td>
                      {row.monthly_avg.map((avg, i) => (
                        <td
                          className="td text-right"
                          key={i}
                          style={{ fontSize: 12, ...(i === CURRENT_MONTH && { background: '#fef9c3' }) }}
                        >
                          <div style={{ color: avg != null ? 'var(--text)' : 'var(--text-3)', fontWeight: avg != null ? 500 : 400 }}>
                            {fmtRate(avg)}
                          </div>
                          {showMinMax && (avg != null) && (
                            <div style={{ fontSize: 10, marginTop: 2 }}>
                              <span style={{ color: '#22c55e' }}>{fmtRate(row.monthly_min[i])}</span>
                              <span style={{ color: 'var(--text-3)' }}> / </span>
                              <span style={{ color: '#ef4444' }}>{fmtRate(row.monthly_max[i])}</span>
                            </div>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                  <tr style={{ background: 'var(--surface2)' }}>
                    <td className="td fw-600" colSpan={2}>Общая средняя</td>
                    {overall_monthly_avg.map((avg, i) => (
                      <td
                        className="td text-right fw-600"
                        key={i}
                        style={{ fontSize: 12, ...(i === CURRENT_MONTH && { background: '#fef9c3' }) }}
                      >
                        <div style={{ color: avg != null ? 'var(--accent)' : 'var(--text-3)' }}>
                          {fmtRate(avg)}
                        </div>
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          )
        }
      </Section>
    </div>
  )
}
