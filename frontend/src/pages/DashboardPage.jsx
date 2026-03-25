import { useState, lazy, Suspense } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useYearStore } from '../store/year'
import { getLastCalculated, recalculateBudgets } from '../api'

const OverviewTab = lazy(() => import('./dashboard/OverviewTab'))
const BudgetProjectsTab = lazy(() => import('./dashboard/BudgetProjectsTab'))
const ProjectsTab = lazy(() => import('./dashboard/ProjectsTab'))
const DepartmentsTab = lazy(() => import('./dashboard/DepartmentsTab'))
const SpecializationsTab = lazy(() => import('./dashboard/SpecializationsTab'))
const HourlyRatesTab = lazy(() => import('./dashboard/HourlyRatesTab'))

const TABS = [
  { id: 'overview', label: '📊 Обзор' },
  { id: 'budget-projects', label: '💼 Бюджетные проекты' },
  { id: 'projects', label: '📁 Проекты' },
  { id: 'departments', label: '🏢 Подразделения' },
  { id: 'specializations', label: '🎯 Специализации' },
  { id: 'hourly-rates', label: '💰 Часовые ставки' },
]

function TabSpinner() {
  return <div className="empty-state" style={{ padding: 40 }}><span className="spinner" /></div>
}

export default function DashboardPage() {
  const { year } = useYearStore()
  const [activeTab, setActiveTab] = useState('overview')

  const qc = useQueryClient()

  const { data: lastCalc } = useQuery({
    queryKey: ['last-calculated', year],
    queryFn: () => getLastCalculated(year),
  })

  const recalcMut = useMutation({
    mutationFn: () => recalculateBudgets(year),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['last-calculated', year] })
      qc.invalidateQueries({ queryKey: ['dashboard-summary', year] })
      qc.invalidateQueries({ queryKey: ['dashboard-by-project', year] })
      qc.invalidateQueries({ queryKey: ['dashboard-by-dept', year] })
      qc.invalidateQueries({ queryKey: ['dashboard-by-spec', year] })
      qc.invalidateQueries({ queryKey: ['dashboard-movements', year] })
      qc.invalidateQueries({ queryKey: ['dashboard-bp-monthly', year] })
      qc.invalidateQueries({ queryKey: ['dashboard-proj-monthly', year] })
      qc.invalidateQueries({ queryKey: ['dashboard-dept-monthly', year] })
      qc.invalidateQueries({ queryKey: ['dashboard-spec-monthly', year] })
      qc.invalidateQueries({ queryKey: ['dashboard-hourly-rates', year] })
    },
  })

  const lastCalcStr = lastCalc?.calculated_at
    ? new Date(lastCalc.calculated_at).toLocaleString('ru-RU')
    : 'не рассчитывалось'

  return (
    <div>
      <div className="page-header" style={{ alignItems: 'flex-start' }}>
        <div>
          <div className="page-title">Дашборд</div>
          <div className="page-subtitle" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>Год: {year}</span>
            <span>Последний расчёт: {lastCalcStr}</span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', zIndex: 10 }}>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => recalcMut.mutate()}
            disabled={recalcMut.isPending}
          >
            {recalcMut.isPending ? <><span className="spinner" /> Расчёт...</> : '↻ Пересчитать'}
          </button>
        </div>
      </div>

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

      <Suspense fallback={<TabSpinner />}>
        {activeTab === 'overview' && <OverviewTab year={year} />}
        {activeTab === 'budget-projects' && <BudgetProjectsTab year={year} />}
        {activeTab === 'projects' && <ProjectsTab year={year} />}
        {activeTab === 'departments' && <DepartmentsTab year={year} />}
        {activeTab === 'specializations' && <SpecializationsTab year={year} />}
        {activeTab === 'hourly-rates' && <HourlyRatesTab year={year} />}
      </Suspense>

      {recalcMut.isSuccess && (
        <div className="alert alert-success" style={{ marginTop: 16 }}>
          Расчёт завершён. Обновлено {recalcMut.data?.snapshots_updated} снапшотов.
        </div>
      )}
    </div>
  )
}
