import { useState } from 'react'
import StaffersTab from './StaffersTab'
import ContractorsTab from './ContractorsTab'
import ExpensesTab from './ExpensesTab'
import StaffingBudgetsTab from './StaffingBudgetsTab'

const TABS = [
  { id: 'staffers', label: 'Стафферы' },
  { id: 'expenses', label: 'Расходы' },
  { id: 'budgets', label: 'Бюджеты' },
  { id: 'contractors', label: 'Подрядчики' },
]

export default function StaffingPage() {
  const [activeTab, setActiveTab] = useState('staffers')

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Стаффинг</div>
          <div className="page-subtitle">Управление внешними подрядчиками и расходами</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 2, marginBottom: 24, borderBottom: '1px solid var(--border)' }}>
        {TABS.map(t => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActiveTab(t.id)}
            style={{
              padding: '8px 18px',
              fontSize: 13,
              fontWeight: activeTab === t.id ? 600 : 400,
              color: activeTab === t.id ? 'var(--accent)' : 'var(--text-2)',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === t.id ? '2px solid var(--accent)' : '2px solid transparent',
              cursor: 'pointer',
              transition: 'all 0.12s',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'staffers' && <StaffersTab />}
      {activeTab === 'expenses' && <ExpensesTab />}
      {activeTab === 'budgets' && <StaffingBudgetsTab />}
      {activeTab === 'contractors' && <ContractorsTab />}
    </div>
  )
}
