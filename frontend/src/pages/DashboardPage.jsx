import { useState, lazy, Suspense } from 'react'
import { useYearStore } from '../store/year'

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

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Дашборд</div>
          <div className="page-subtitle">Год: {year}</div>
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
    </div>
  )
}
