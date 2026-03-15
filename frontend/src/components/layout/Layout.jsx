import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../store/auth'
import { useYearStore } from '../../store/year'
import { useQuery } from '@tanstack/react-query'
import { getAvailableYears } from '../../api'

const NAV = [
  { to: '/dashboard', icon: '📊', label: 'Дашборд' },
  { to: '/employees', icon: '👥', label: 'Сотрудники' },
  { to: '/hiring', icon: '📋', label: 'Найм' },
  { to: '/projects', icon: '📁', label: 'Проекты' },
  { to: '/budget-projects', icon: '💼', label: 'Бюджетные проекты' },
  { to: '/budgets', icon: '💰', label: 'Бюджеты' },
]

export default function Layout() {
  const logout = useAuthStore((s) => s.logout)
  const navigate = useNavigate()
  const { year, setYear } = useYearStore()

  const { data: yearsData } = useQuery({
    queryKey: ['available-years'],
    queryFn: getAvailableYears,
  })

  const years = yearsData?.years || [new Date().getFullYear()]

  function handleLogout() {
    logout()
    navigate('/login')
  }

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {/* Sidebar */}
      <aside style={{
        width: 'var(--sidebar-w)',
        background: 'var(--surface)',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
      }}>
        {/* Logo */}
        <div style={{ padding: '18px 16px 14px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--accent)' }}>Mini CRM</div>
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>Управление персоналом</div>
        </div>

        {/* Year selector */}
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
          <label className="label">Год</label>
          <select
            className="select"
            style={{ width: '100%' }}
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
          >
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>

        {/* Navigation */}
        <nav style={{ flex: 1, padding: '8px 0', overflowY: 'auto' }}>
          {NAV.map(({ to, icon, label }) => (
            <NavLink
              key={to}
              to={to}
              style={({ isActive }) => ({
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '9px 16px',
                fontSize: 13,
                fontWeight: isActive ? 600 : 400,
                color: isActive ? 'var(--accent)' : 'var(--text-2)',
                background: isActive ? 'var(--accent-light)' : 'transparent',
                borderRight: isActive ? '2px solid var(--accent)' : '2px solid transparent',
                transition: 'all 0.12s',
                textDecoration: 'none',
              })}
            >
              <span style={{ fontSize: 15 }}>{icon}</span>
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Logout */}
        <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)' }}>
          <button type="button" className="btn btn-ghost" style={{ width: '100%', justifyContent: 'flex-start' }} onClick={handleLogout}>
            🚪 Выйти
          </button>
        </div>
      </aside>

      {/* Main area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <main style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
          <Outlet />
        </main>
      </div>
    </div>
  )
}
