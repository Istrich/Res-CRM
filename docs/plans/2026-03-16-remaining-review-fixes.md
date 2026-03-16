# План: оставшиеся исправления по ревью (backend + tests)

**Дата:** 2026-03-16  
**Тип:** рефакторинг (согласованность слоёв, производительность, tech debt).

## Цели

1. **Критичные:** убрать дублирование логики, исправить технический долг, вынести бизнес-логику из роутеров.
2. **Средние:** оптимизация recalculate_year и get_project_budget_summary, явные импорты в export.
3. **Низкие:** SalaryRecord.total на Decimal, conftest TEST_YEAR, тесты import_employees и AssignmentMonthRate.

## Риски и откат

- Перенос логики в services/employees_service — возможны циклические импорты; зависимости только app.models, app.schemas, app.services.calc.
- Изменение сигнатуры get_project_budget_summary (добавление project=) — обратная совместимость сохранена.
- Откат: revert коммита; тесты должны остаться зелёными после каждого шага.

## Шаги (Implementer)

1. **calc.py:** заменить _month_end на нормальный импорт `timedelta`, убрать __import__.
2. **employees.py:** удалить _assignments_active_in_month; в _build_list_item использовать `[ep for ep in emp.employee_projects if assignment_active_in_month(ep, year, month)]`.
3. **Сервис сотрудников:** создать app/services/employees_service.py с функциями: create_employees_from_rows, create_position_assignment_and_salary, build_assignment_out, build_employee_out, build_list_item, preview_row, check_assignment_period_within_employment (общая проверка периода назначения vs найм/увольнение). Роутер employees импортирует из сервиса и вызывает их; assignments.py использует check_assignment_period_within_employment вместо _assignment_period_within_employment.
4. **DELETE /employees/all:** при DEBUG_MODE=False возвращать 403 Forbidden вместо 404.
5. **recalculate_year:** одним запросом загрузить все BudgetSnapshot за year, собрать словарь (project_id, month) -> snapshot; в цикле брать/создавать из словаря, без лишних SELECT.
6. **get_project_budget_summary:** добавить параметр project=None; если передан — использовать его для budget, иначе db.get(Project, project_id). Вызывающие (export, budgets) при наличии project передавать его.
7. **export.py:** импорт get_salary_for_month перенести на уровень модуля.
8. **SalaryRecord.total:** считать сумму в Decimal (поля Numeric), возвращать float(total) для совместимости со схемами.
9. **conftest:** константа TEST_YEAR = 2024, использовать в full_setup и по необходимости в тестах.
10. **Тесты:** test_import_employees.py — парсинг Excel, заголовки, даты, пропуск пустых; test_calc.py — кейсы с AssignmentMonthRate (переопределение ставки по месяцам).

## Проверка (Tester / Guardian)

- pytest backend/tests -v без регрессий.
- Ручная проверка: импорт сотрудников, создание позиции с проектом/окладом, обновление сотрудника с датами (валидация назначений), пересчёт бюджетов, экспорт.

---

## Change-log (Implementer)

- **calc.py:** _month_end — импорт timedelta на уровне модуля, реализация без __import__; recalculate_year — загрузка всех снапшотов за год одним запросом, словарь (project_id, month) -> snapshot; get_project_budget_summary — добавлен параметр project=None.
- **routers/employees.py:** удалена _assignments_active_in_month, в _build_list_item используется assignment_active_in_month из calc; бизнес-логика перенесена в services/employees_service.py (create_employees_from_rows, create_position_assignment_and_salary, build_employee_out, build_list_item, preview_row, check_assignment_period_within_employment); DELETE /employees/all при DEBUG_MODE=False возвращает 403 Forbidden.
- **routers/assignments.py:** _assignment_period_within_employment заменён на check_assignment_period_within_employment из employees_service.
- **services/employees_service.py:** новый модуль с общей логикой и проверкой периода назначения.
- **services/export.py:** get_salary_for_month импортируется на уровне модуля; вызов get_project_budget_summary с project=proj.
- **routers/budgets.py, projects.py:** вызов get_project_budget_summary с project=proj где доступен.
- **models:** SalaryRecord.total — сумма через Decimal, возврат float(s).
- **conftest.py:** константа TEST_YEAR = 2024, использование в make_budget_project, make_salary, full_setup.
- **tests/test_calc.py:** добавлены тесты AssignmentMonthRate (monthly_rate_override_used_in_project_cost, monthly_rate_override_used_in_total_rate).
- **tests/test_import_employees.py:** новый файл — тесты parse_employee_excel (заголовки, даты, fallback, пустой title).
