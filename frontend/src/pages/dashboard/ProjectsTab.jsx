import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { getDashboardByProjectMonthly } from '../../api'
import { fmt } from '../../utils'
import { EmptyState, PlanFactTable } from './shared'

export default function ProjectsTab({ year }) {
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
  return (
    <div>
      <div className="grid-3" style={{ marginBottom: 20 }}>
        <div className="stat-card">
          <div className="stat-value">{fmt(totalFact)} ₽</div>
          <div className="stat-label">Фактические расходы / прогноз</div>
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
