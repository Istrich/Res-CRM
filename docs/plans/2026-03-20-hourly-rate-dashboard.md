# Plan: Hourly Rates Dashboard Tab
**Date:** 2026-03-20  
**Type:** New Feature  
**Scope:** Dashboard → новая вкладка «Часовые ставки»

---

## Цель

Добавить во вкладку Дашборд новую вкладку **«💰 Часовые ставки»** с аналитикой:
- Помесячная средняя часовая ставка по всем специалистам
- Помесячная средняя ставка по специализации
- Помесячная минимальная и максимальная ставка по специализациям

---

## Анализ данных

**Источник данных:**
- `SalaryRecord` — точные записи зарплат за год (salary + kpi_bonus + fixed_bonus + one_time_bonus)
- `WorkingHoursYearMonth` — рабочие часы за каждый месяц (заполняется в Настройках)
- `Employee.specialization` — группировка по специализации

**Формула часовой ставки:** `total_compensation / working_hours_in_month`

**Важно:** Используются только ТОЧНЫЕ записи за запрошенный год (без fallback), аналогично тому как работает `build_list_item` в `employees_service.py`. Это обеспечивает консистентность с отображением на странице сотрудника.

---

## Архитектура изменений

### Backend

**`backend/app/services/dashboard_service.py`** — новая функция:
```python
def get_hourly_rates(db: Session, year: int) -> dict
```
Возвращает:
```json
{
  "year": 2026,
  "hours_configured": true,
  "overall_monthly_avg": [null, 520.5, 515.0, ...],
  "by_specialization": [
    {
      "specialization": "Backend",
      "monthly_avg": [null, 520.0, ...],
      "monthly_min": [null, 400.0, ...],
      "monthly_max": [null, 650.0, ...],
      "employees_count": 5
    }
  ]
}
```

**Логика:**
1. `get_working_hours_map(db, year)` → hours_map
2. Загрузить всех реальных сотрудников (`is_position == False`)
3. Загрузить все SalaryRecord для них за `year` (один запрос)
4. Для каждого сотрудника, для каждого месяца где есть точная запись и он активен: посчитать hourly_rate = total / hours
5. Агрегировать: overall (все) и по специализациям (avg/min/max)

**`backend/app/routers/dashboard.py`** — новый endpoint:
```
GET /dashboard/hourly-rates?year=2026
```

### Frontend

**`frontend/src/api/index.js`** — новая функция:
```js
export const getDashboardHourlyRates = (year) => api.get('/dashboard/hourly-rates', { params: { year } }).then(r => r.data)
```

**`frontend/src/pages/dashboard/HourlyRatesTab.jsx`** — новый компонент:
- Stat-cards: средняя ставка за год, кол-во специализаций, топ-спец (самая высокая), минимальная спец
- Notice-баннер если рабочие часы не настроены → ссылка на Настройки
- Bar chart: помесячная средняя ставка по всем специалистам
- Таблица: строки = специализация, столбцы = месяцы, ячейки = avg ₽/ч (с min/max в маленьком тексте ниже)

**`frontend/src/pages/DashboardPage.jsx`** — добавить вкладку:
```js
{ id: 'hourly-rates', label: '💰 Часовые ставки' }
```

---

## Риски и митигация

| Риск | Митигация |
|---|---|
| Рабочие часы не настроены → все null | Показать баннер-подсказку с ссылкой на /settings |
| Сотрудник без записей зарплаты за год | Пропускается (null в hourly_rate → не включается в агрегацию) |
| N+1 запросы | Один bulk-запрос SalaryRecord для всех сотрудников |
| Большое количество специализаций | Таблица горизонтальная, прокручивается |

---

## Rollback

**Backend:** удалить функцию `get_hourly_rates` из `dashboard_service.py` и endpoint из `dashboard.py`  
**Frontend:** удалить вкладку из TABS в `DashboardPage.jsx`, удалить lazy import, удалить файл `HourlyRatesTab.jsx`, удалить `getDashboardHourlyRates` из `api/index.js`

Нет изменений в БД, нет миграций — полный rollback без побочных эффектов.

---

## Шаги реализации

1. `dashboard_service.py` — функция `get_hourly_rates`
2. `dashboard.py` — endpoint `GET /hourly-rates`
3. `api/index.js` — функция `getDashboardHourlyRates`
4. `HourlyRatesTab.jsx` — компонент
5. `DashboardPage.jsx` — регистрация вкладки
