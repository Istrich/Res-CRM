import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  getBudgetOverview, getLastCalculated,
  exportProjectsBudget, exportBudgetProjects, exportPayroll,
} from '../api'
import { useYearStore } from '../store/year'
import { fmt, MONTHS, statusLabel, statusColor, downloadBlob } from '../utils'

export default function BudgetsPage() {
  const { year } = useYearStore()
  const navigate = useNavigate()
  const [tab, setTab] = useState('projects') // 'projects' | 'budget_projects'

  const { data: overview, isLoading } = useQuery({
    queryKey: ['budget-overview', year],
    queryFn: () => getBudgetOverview(year),
  })

  const { data: lastCalc } = useQuery({
    queryKey: ['last-calculated', year],
    queryFn: () => getLastCalculated(year),
  })

  async function handleExport(type) {
    let blob, filename
    if (type === 'projects') {
      blob = await exportProjectsBudget(year)
      filename = `projects_budget_${year}.xlsx`
    } else if (type === 'budget_projects') {
      blob = await exportBudgetProjects(year)
      filename = `budget_projects_${year}.xlsx`
    } else {
      blob = await exportPayroll(year)
      filename = `payroll_${year}.xlsx`
    }
    downloadBlob(blob, filename)
  }

  const lastCalcStr = lastCalc?.calculated_at
    ? new Date(lastCalc.calculated_at).toLocaleString('ru-RU')
    : 'не рассчитывалось'

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Бюджеты</div>
          <div className="page-subtitle" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>Последний расчёт: {lastCalcStr}</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => handleExport('projects')}>⬇ Проекты</button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => handleExport('budget_projects')}>⬇ Бюджетные</button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => handleExport('payroll')}>⬇ ФОТ</button>
        </div>
      </div>

      {/* Total summary */}
      {overview && (
        <div className="grid-2" style={{ marginBottom: 20 }}>
          <div className="stat-card">
            <div className="stat-value">{fmt(overview.total_spent)} ₽</div>
            <div className="stat-label">Фактические расходы {year}</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{fmt(overview.total_forecast)} ₽</div>
            <div className="stat-label">Прогноз на год</div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="tabs">
        <div className={`tab ${tab === 'projects' ? 'active' : ''}`} onClick={() => setTab('projects')}>
          По проектам
        </div>
        <div className={`tab ${tab === 'budget_projects' ? 'active' : ''}`} onClick={() => setTab('budget_projects')}>
          По бюджетным проектам
        </div>
      </div>

      {isLoading ? (
        <div className="empty-state"><span className="spinner" /></div>
      ) : tab === 'projects' ? (
        <ProjectsBudgetTable
          projects={overview?.projects || []}
          onNavigate={(id) => navigate(`/projects/${id}`)}
        />
      ) : (
        <BudgetProjectsTable
          bps={overview?.budget_projects || []}
          onNavigate={(id) => navigate(`/budget-projects/${id}`)}
        />
      )}
    </div>
  )
}

function ProjectsBudgetTable({ projects, onNavigate }) {
  if (projects.length === 0) {
    return (
      <div className="empty-state card" style={{ padding: 40 }}>
        <span style={{ fontSize: 32 }}>📊</span>
        <span>Нет данных. Нажмите «Пересчитать» чтобы обновить бюджеты.</span>
      </div>
    )
  }

  return (
    <div className="card overflow-table">
      <table>
        <thead>
          <tr>
            <th className="th">Проект</th>
            <th className="th">Бюджетный проект</th>
            <th className="th" style={{ textAlign: 'right' }}>Расход</th>
            <th className="th" style={{ textAlign: 'right' }}>Прогноз на год</th>
            <th className="th" style={{ textAlign: 'right' }}>Остаток</th>
            <th className="th">Статус</th>
          </tr>
        </thead>
        <tbody>
          {projects.map(p => {
            const sc = statusColor(p.status)
            return (
              <tr key={p.project_id} style={{ cursor: 'pointer' }} onClick={() => onNavigate(p.project_id)}>
                <td className="td fw-500">{p.project_name}</td>
                <td className="td text-muted">{p.budget_project_name || '—'}</td>
                <td className="td" style={{ textAlign: 'right' }}>{fmt(p.spent)} ₽</td>
                <td className="td" style={{ textAlign: 'right' }}>{fmt(p.forecast)} ₽</td>
                <td className="td" style={{ textAlign: 'right' }}>
                  {p.remaining != null
                    ? <span style={{ color: p.remaining < 0 ? 'var(--red)' : 'var(--green)' }}>
                        {fmt(p.remaining)} ₽
                      </span>
                    : <span className="text-muted">—</span>}
                </td>
                <td className="td">
                  <span className="badge" style={{ background: sc + '22', color: sc }}>
                    {statusLabel(p.status)}
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function BudgetProjectsTable({ bps, onNavigate }) {
  if (bps.length === 0) {
    return (
      <div className="empty-state card" style={{ padding: 40 }}>
        <span style={{ fontSize: 32 }}>💼</span>
        <span>Нет бюджетных проектов. Создайте их на странице «Бюджетные проекты».</span>
      </div>
    )
  }

  return (
    <div className="card overflow-table">
      <table>
        <thead>
          <tr>
            <th className="th">Бюджетный проект</th>
            <th className="th" style={{ textAlign: 'right' }}>Бюджет</th>
            <th className="th" style={{ textAlign: 'right' }}>Расход</th>
            <th className="th" style={{ textAlign: 'right' }}>Прогноз на год</th>
            <th className="th" style={{ textAlign: 'right' }}>Остаток</th>
            <th className="th">Статус</th>
          </tr>
        </thead>
        <tbody>
          {bps.map(bp => {
            const sc = statusColor(bp.status)
            return (
              <tr key={bp.budget_project_id} style={{ cursor: 'pointer' }} onClick={() => onNavigate(bp.budget_project_id)}>
                <td className="td fw-600">{bp.budget_project_name}</td>
                <td className="td" style={{ textAlign: 'right' }}>
                  {bp.total_budget ? `${fmt(bp.total_budget)} ₽` : <span className="text-muted">—</span>}
                </td>
                <td className="td" style={{ textAlign: 'right' }}>{fmt(bp.spent)} ₽</td>
                <td className="td" style={{ textAlign: 'right' }}>{fmt(bp.forecast)} ₽</td>
                <td className="td" style={{ textAlign: 'right' }}>
                  {bp.remaining != null
                    ? <span style={{ color: bp.remaining < 0 ? 'var(--red)' : 'var(--green)' }}>
                        {fmt(bp.remaining)} ₽
                      </span>
                    : <span className="text-muted">—</span>}
                </td>
                <td className="td">
                  <span className="badge" style={{ background: sc + '22', color: sc }}>
                    {statusLabel(bp.status)}
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
