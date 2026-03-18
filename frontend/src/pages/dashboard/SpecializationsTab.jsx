import { useQuery } from '@tanstack/react-query'
import { getDashboardBySpecMonthly } from '../../api'
import { fmt } from '../../utils'
import { EmptyState, GroupMonthlySection } from './shared'

export default function SpecializationsTab({ year }) {
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
