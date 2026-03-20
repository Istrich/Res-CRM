# План: Расходы по месяцам план/факт + все проекты

**Дата:** 2026-03-20  
**Тип задачи:** Новая функция (доработка визуализации)  
**Файлы:** `backend/app/services/dashboard_service.py`, `frontend/src/pages/dashboard/OverviewTab.jsx`

---

## Изменения

### 1. Backend: monthly_plan в /dashboard/summary
- `get_summary()` сейчас возвращает только `monthly_spend` (факт из BudgetSnapshot)
- Добавить `monthly_plan: [{month, amount}×12]` — сумма `BudgetProjectMonthPlan.amount` по `month` для `year`
- Запрос: `GROUP BY month WHERE year=year` по таблице `budget_project_month_plans`
- Модель `BudgetProjectMonthPlan` уже импортирована в `dashboard_service.py`

### 2. Frontend: График расходов по месяцам → план/факт
- Логика разделения:
  - `year < today.year` → все 12 месяцев = факт
  - `year > today.year` → все 12 месяцев = план
  - `year == today.year` → месяцы 1..currentMonth = факт, currentMonth+1..12 = план
- BarChart с двумя Bar: "Факт" (синий #3b5bdb) и "План" (серый #94a3b8)
- Данные: `fact` = `monthly_spend`, `plan` = `monthly_plan` (новое поле)

### 3. Frontend: Все проекты в столбчатой диаграмме
- Убрать `.slice(0, 8)` → показывать все проекты
- При > N проектов: горизонтальный скролл (overflowX: auto)
- Ширина: `Math.max(500, n * 70)` px, минимум на весь контейнер
- Убрать "топ-8" из заголовка

---

## Риски
- `monthly_plan` добавляется как **новое поле** в ответ, обратная совместимость не нарушается
- Нет миграций БД (данные уже есть в `budget_project_month_plans`)
- Если планов нет → `monthly_plan[i].amount = 0` для всех месяцев (graceful fallback)

## Rollback
- Backend: вернуть `get_summary` без `monthly_plan`
- Frontend: вернуть `.slice(0, 8)` и убрать план из графика

## Шаги проверки
1. `GET /dashboard/summary?year=2026` → ответ содержит `monthly_plan` массив из 12 элементов
2. Дашборд → «Общее» → «Расходы по месяцам»: прошлые месяцы = синие (факт), будущие = серые (план)
3. Дашборд → «По проектам»: все проекты отображаются, при >8 появляется горизонтальный скролл
