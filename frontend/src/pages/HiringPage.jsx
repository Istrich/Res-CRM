import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { getEmployees } from '../api'
import { useYearStore } from '../store/year'
import { fmtDate, fmt } from '../utils'
import { useDebounce } from '../utils/hooks'

const POSITION_STATUS_LABELS = {
  awaiting_assignment: 'Ожидает взятия в работу',
  hiring: 'Найм',
  awaiting_start: 'Ожидаем выход',
}

export default function HiringPage() {
  const navigate = useNavigate()
  const { year, month } = useYearStore()
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 300)
  const [statusFilter, setStatusFilter] = useState('')

  const { data: positions = [], isLoading } = useQuery({
    queryKey: ['employees', 'positions', year, month, debouncedSearch],
    queryFn: () => getEmployees({
      year,
      month,
      is_position: true,
      search: debouncedSearch || undefined,
    }),
  })

  const filtered = useMemo(() => {
    if (!statusFilter) return positions
    return positions.filter((p) => (p.position_status || '') === statusFilter)
  }, [positions, statusFilter])

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Найм</div>
          <div className="page-subtitle">Позиции ({filtered.length})</div>
        </div>
      </div>

      <div className="toolbar">
        <div className="toolbar-left">
          <div className="search-bar" style={{ width: 260 }}>
            🔍
            <input
              placeholder="Поиск по должности..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            className="select"
            style={{ width: 220 }}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">Все статусы</option>
            {Object.entries(POSITION_STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="card overflow-table">
        <table>
          <thead>
            <tr>
              <th className="th">Статус</th>
              <th className="th">Должность</th>
              <th className="th">Подразделение</th>
              <th className="th">Специализация</th>
              <th className="th">Плановая дата выхода</th>
              <th className="th">Оклад</th>
              <th className="th">Проект</th>
              <th className="th">Ставка</th>
              <th className="th" />
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td className="td" colSpan={9} style={{ textAlign: 'center' }}>
                  <span className="spinner" />
                </td>
              </tr>
            )}
            {!isLoading && filtered.length === 0 && (
              <tr>
                <td className="td" colSpan={9}>
                  <div className="empty-state">Нет позиций</div>
                </td>
              </tr>
            )}
            {filtered.map((pos) => (
              <tr
                key={pos.id}
                style={{ cursor: 'pointer' }}
                onClick={() => navigate(`/employees/${pos.id}`)}
              >
                <td className="td">
                  <span className="badge badge-amber">
                    {POSITION_STATUS_LABELS[pos.position_status] || pos.position_status || '—'}
                  </span>
                </td>
                <td className="td fw-500" style={{ minWidth: 160 }}>{pos.title}</td>
                <td className="td text-muted">{pos.department || '—'}</td>
                <td className="td text-muted">{pos.specialization || '—'}</td>
                <td className="td text-muted">{fmtDate(pos.planned_exit_date)}</td>
                <td className="td">{pos.planned_salary != null ? fmt(pos.planned_salary) : '—'}</td>
                <td className="td" style={{ minWidth: 140 }}>
                  {pos.assignments.length === 0 ? '—' : pos.assignments.map((a) => (
                    <div key={a.id} style={{ fontSize: 12 }}>{a.project_name}</div>
                  ))}
                </td>
                <td className="td">
                  {pos.assignments.length === 0 ? '—' : pos.assignments.map((a) => (
                    <span key={a.id}>×{a.rate}</span>
                  ))}
                </td>
                <td className="td">
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={(e) => { e.stopPropagation(); navigate(`/employees/${pos.id}`) }}
                  >
                    Нанять / Открыть
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
