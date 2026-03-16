import Modal from './ui/Modal'
import { MONTHS, fmt } from '../utils'

const SALARY_FIELDS = [
  { key: 'salary', label: 'Оклад (gross)' },
  { key: 'kpi_bonus', label: 'KPI премия' },
  { key: 'fixed_bonus', label: 'Фикс. надбавка' },
  { key: 'one_time_bonus', label: 'Разовая премия' },
]

export default function SalaryModal({ month, year, form, setForm, extend, setExtend, onSave, onClose, loading }) {
  const handleNumberChange = (field) => (e) => setForm({ ...form, [field]: Number(e.target.value) })
  const total = (form.salary || 0) + (form.kpi_bonus || 0) + (form.fixed_bonus || 0) + (form.one_time_bonus || 0)
  const restMonthsCount = 13 - month
  const showExtend = restMonthsCount > 1

  return (
    <Modal
      title={`Вознаграждение — ${MONTHS[month - 1]} ${year}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Отмена</button>
          <button type="button" className="btn btn-primary" onClick={onSave} disabled={loading}>
            {loading ? <span className="spinner" /> : 'Сохранить'}
          </button>
        </>
      }
    >
      <div className="grid-2">
        {SALARY_FIELDS.map(({ key, label }) => (
          <div key={key} className="form-group">
            <label className="label">{label}</label>
            <input className="input" type="number" value={form[key]} onChange={handleNumberChange(key)} />
            {showExtend && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, cursor: 'pointer', fontSize: 12, color: 'var(--text-2)' }}>
                <input
                  type="checkbox"
                  checked={extend[key]}
                  onChange={(e) => setExtend({ ...extend, [key]: e.target.checked })}
                />
                Продлить до декабря
              </label>
            )}
          </div>
        ))}
      </div>
      <div className="form-group" style={{ marginTop: 12 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={form.is_raise ?? false}
            onChange={(e) => setForm({ ...form, is_raise: e.target.checked })}
          />
          <span>Повышение</span>
        </label>
        <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>Месяц будет отмечен зелёным в таблице как месяц, с которого повышение.</div>
      </div>
      {showExtend && (
        <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-3)' }}>
          Галочка «Продлить до декабря» — это значение будет подставлено с {MONTHS[month - 1]} по декабрь ({restMonthsCount} мес.), остальные компоненты в тех месяцах не меняются.
        </div>
      )}
      <div style={{ textAlign: 'right', fontWeight: 600, fontSize: 15, marginTop: 12 }}>
        Итого: {fmt(total)} ₽
      </div>
    </Modal>
  )
}

