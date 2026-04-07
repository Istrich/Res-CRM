# Manual Fact/Forecast for Budget Projects (monthly)

## Цель
Добавить в модуль `budget-projects` возможность ручного ввода значений `Факт / прогноз` помесячно, чтобы “рисковые” бюджетные проекты могли содержать затраты даже когда они не привязаны к проектам/расчётам.

## Границы изменения
- Backend:
  - новая БД-таблица для manual override: `budget_project_month_fact_forecast_overrides`
  - расчёт `monthly_fact`, а также сумм `spent/forecast` в карточке бюджетного проекта и в dashboard-агрегациях
  - новые эндпоинты для GET/PUT manual override помесячно
  - тесты для новых/изменённых сервисов и API
- Frontend:
  - обновление `BudgetProjectDetailPage.jsx` для ручного редактирования строки “Факт / прогноз по месяцам”
  - добавление API-обёрток

## Риски и миграции
- Миграция БД: добавляется новая таблица (без изменения существующих таблиц), обратной совместимости текущих API не ломаем.
- Поведение статусов `ok/warning/overrun` зависит от `forecast` — должны быть покрыты тестами на регрессию.

## План отката (rollback)
1. Удалить таблицу `budget_project_month_fact_forecast_overrides`.
2. Откатить сервисные изменения:
   - вернуть старые функции `get_budget_project_month_fact` и `get_budget_project_summary` без manual override
   - вернуть dashboard-агрегации к авто-вычислению
3. Удалить новые эндпоинты и отключить фронтовый UI manual редактирования (или переключить на read-only).

## Критерии приёмки
- В `BudgetProjectDetailPage` пользователь может ввести помесячные значения “Факт / прогноз” и сохранить их.
- Если у бюджетного проекта нет привязанных проектов, manual значения всё равно попадают в:
  - строку “Факт / прогноз по месяцам”
  - суммарные `Фактический расход` / `Прогноз на год`
  - `Остаток` и статус `ok/warning/overrun`
- При отсутствии manual значений поведение остаётся прежним (используются `BudgetSnapshot`).

## Что покрываем тестами
- Backend:
  - `get_budget_project_month_fact` с override (новый тест в `test_budget_plan.py`)
  - `get_budget_project_summary`/эндпоинт `/budgets/budget-projects/{id}` корректно учитывает override (новый тест)
  - API GET/PUT override: happy path + валидация/авторизация минимально.

