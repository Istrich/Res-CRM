# План: привязка стафферов к бюджетам стаффинга

**Классификация (WORKFLOW):** новая функция + структурное изменение БД → Architect → Implementer → Tester → Guardian → Documenter.

---

## 1. Architect — цель и границы

### Цель
Связать `Staffer` с `StaffingBudget` (FK `staffing_budget_id`), считать **факт** годового бюджета и помесячно только по `StafferMonthExpense.actual_amount` стафферов, у которых `staffing_budget_id` совпадает с бюджетом. Добавить API помесячной детализации и поля в ответах; UI: выбор бюджета у стаффера, карточка бюджета с план/факт по месяцам и списком привязанных стафферов.

### Границы
- Входит: миграция, модель, схемы, `staffing_service.build_staffer_out`, роутер staffing, `frontend` (api, вкладки, `StaffingBudgetDetail`).
- Не входит: изменение логики `StaffingExpense` по проектам (кроме того, что факт **бюджета стаффинга** больше не берётся из суммы `StaffingExpense` за год).

### Затрагиваемые модули
- Backend: `app/models/__init__.py`, `app/schemas/staffing.py`, `app/services/staffing_service.py`, `app/routers/staffing.py`, миграции `0011_staffer_budget_link`, `0012_merge_budget_link_and_hours`.
- Frontend: `frontend/src/api/index.js`, страницы `pages/staffing/*` (см. CURSOR_PROMPT.md).

### Риски и миграции
- Добавление FK на `staffing_budgets.id` (`ON DELETE SET NULL`).
- Параллельные ветки Alembic (`0011_staffer_hours` и `0011_staffer_budget_link`) → обязательна merge-ревизия `0012`.
- **Обратная совместимость API:** в ответы добавлены новые поля (расширение контракта), существующие клиенты не ломаются.

### Rollback
`alembic downgrade` до ревизии до миграции (с бэкапом БД при необходимости). Откат кода — revert коммита.

### Критерии приёмки и покрытие тестами
- [x] Факт бюджета = сумма `actual_amount` по привязанным стафферам за год бюджета.
- [x] `GET /staffing/budgets/{id}/month-detail?year=` — 12 месяцев, план из month_plans, факт из расходов привязанных стафферов.
- [x] `POST/PATCH /staffing/staffers` с несуществующим `staffing_budget_id` → 404.
- [x] Авторизация на новых/изменённых эндпоинтах (401 без токена).
- [x] Регрессия: тесты в `tests/test_staffing.py` обновлены под новую формулу факта; добавлены сценарии month-detail и валидации бюджета.

---

## 2. Implementer — change-log

| Область | Изменения |
|---------|-----------|
| Модель | `Staffer.staffing_budget_id`, relationships `staffing_budget` / `staffers` |
| Схемы | Поля бюджета в DTO; `StaffingBudgetMonthDetailItem`, `StaffingBudgetStafferPreview`; расширен `StaffingBudgetOut` |
| Сервис | `build_staffer_out` — `staffing_budget_id`, `staffing_budget_name` |
| Роутер | `_build_budget_out`, `get_budget_month_detail`, валидации, `joinedload` |
| Frontend | API `getStaffingBudgetMonthDetail`; формы и `StaffingBudgetDetail` |
| Тесты | `tests/test_staffing.py`: факт от привязанных стафферов; month-detail; 404/422/401; PATCH create budget 404 |

**Как проверить вручную:** см. раздел «Проверка» ниже и IMPLEMENTATION_GUIDE.md.

---

## 3. Tester — отчёт

**Покрыто автотестами** (`backend/tests/test_staffing.py`):
- `test_plan_fact_delta_from_linked_staffers` — факт не из `StaffingExpense` по проекту; после привязки стаффера и `staffer-expenses` факт и `staffers`/`staffer_count` корректны.
- `test_month_detail_happy`, `test_month_detail_budget_not_found`, `test_month_detail_requires_year`, `test_month_detail_requires_auth`.
- `test_create_staffing_budget_not_found`, `test_update_staffing_budget_not_found`.

**Запуск:**
```bash
cd backend && pip install -r requirements-test.txt
pytest tests/test_staffing.py -v --no-cov
# полный набор:
pytest --no-cov -q
```

**Примечание:** при полном прогоне в Docker один тест в `tests/test_hourly_rate.py` (`test_list_without_working_hours_gives_none_rates`) может падать из‑за ожидания `monthly_hourly_rates is None` при фактическом ответе API (список из `None`). К фиче стафф-бюджета не относится; завести отдельный баг при подтверждении регрессии.

**Frontend:** чек-лист ручной проверки — вкладка Стафферы (колонка «Бюджет», модалка), карточка стаффера, расходы (drawer), бюджет → детальная страница, после правок фронта в Docker: `docker compose build frontend && docker compose up -d frontend`.

---

## 4. Guardian — VERDICT

**APPROVE** (по коду фичи и тестам `test_staffing`).

Условия:
- Новые/изменённые сценарии стаффинга покрыты pytest.
- Перед релизом прогнать полный `pytest`; при падении `test_hourly_rate` — разобрать отдельно (контракт `/employees` vs ожидание теста).

---

## 5. Documenter — обновлённые документы

- Этот файл (`docs/plans/2026-03-25-staffer-budget-link.md`) — полный план и артефакты WORKFLOW.
- `CONTEXT.md` — краткое дополнение по API стаффинга (бюджет стаффера, month-detail).
- Ручной чек-лист фронта — в §3 Tester.

---

## Шаги внедрения (кратко)

1. Миграции `0011_staffer_budget_link` + `0012_merge_budget_link_and_hours`.
2. Backend + frontend по CURSOR_PROMPT.md.
3. `alembic upgrade head`; пересборка фронта в Docker при необходимости.

## Проверка (ручная)

1. Создать бюджет на вкладке «Бюджеты».
2. У стаффера выбрать бюджет; в расходах заполнить суммы факта по месяцам.
3. Открыть карточку бюджета: факт, помесячная таблица, список стафферов согласованы с планом.
