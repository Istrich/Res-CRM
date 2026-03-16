import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { getEmployees } from '../api'
import { useYearStore } from '../store/year'

export default function HiringPage() {
  const navigate = useNavigate()
  const { year, month } = useYearStore()
  const [search, setSearch] = useState('')

  const { data: positions = [], isLoading } = useQuery({
    queryKey: ['employees', 'positions', year, month, search],
    queryFn: () => getEmployees({
      year,
      month,
      is_position: true,
      search: search || undefined,
    }),
  })

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Найм</div>
          <div className="page-subtitle">Позиции ({positions.length})</div>
        </div>
      </div>

      <div className="toolbar">
        <div className="toolbar-left">
          <div className="search-bar" style={{ width: 260 }}>
            🔍
            <input
              placeholder="Поиск по названию позиции..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="card overflow-table">
        <table>
          <thead>
            <tr>
              <th className="th">Позиция</th>
              <th className="th">Должность</th>
              <th className="th">Подразделение</th>
              <th className="th">Специализация</th>
              <th className="th">В проектах</th>
              <th className="th" />
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td className="td" colSpan={6} style={{ textAlign: 'center' }}>
                  <span className="spinner" />
                </td>
              </tr>
            )}
            {!isLoading && positions.length === 0 && (
              <tr>
                <td className="td" colSpan={6}>
                  <div className="empty-state">Нет позиций</div>
                </td>
              </tr>
            )}
            {positions.map((pos) => (
              <tr
                key={pos.id}
                style={{ cursor: 'pointer' }}
                onClick={() => navigate(`/employees/${pos.id}`)}
              >
                <td className="td" style={{ minWidth: 180 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className="badge badge-amber">Позиция</span>
                    <span className="fw-500">{pos.display_name}</span>
                  </div>
                </td>
                <td className="td">{pos.title}</td>
                <td className="td text-muted">{pos.department || '—'}</td>
                <td className="td text-muted">{pos.specialization || '—'}</td>
                <td className="td" style={{ minWidth: 160 }}>
                  {pos.assignments.length === 0
                    ? <span className="text-muted">—</span>
                    : pos.assignments.map((a) => (
                      <div key={a.id} style={{ fontSize: 12 }}>
                        {a.project_name} <span className="text-muted">×{a.rate}</span>
                      </div>
                    ))}
                </td>
                <td className="td">
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={(e) => { e.stopPropagation(); navigate(`/employees/${pos.id}`) }}
                  >
                    Открыть →
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
