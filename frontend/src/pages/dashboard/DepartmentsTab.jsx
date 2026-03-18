import { useQuery } from '@tanstack/react-query'
import { getDashboardByDepartmentMonthly } from '../../api'
import { fmt } from '../../utils'
import { EmptyState, GroupMonthlySection } from './shared'

export default function DepartmentsTab({ year }) {
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
