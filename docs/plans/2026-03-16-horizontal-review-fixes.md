# План: исправления по горизонтальному ревью (согласованность слоёв)

**Дата:** 2026-03-16  
**Тип:** рефакторинг + багфикс (контракты API, дублирование логики, валидация).

## Цели

1. Контракт API vs Frontend: явная передача `year` в `setAssignmentRate`.
2. Один источник истины для суммарных ставок по месяцам: фронт использует данные бэкенда.
3. Dashboard: зафиксировать непоследовательность и вариант развития (snapshot по сотрудникам).
4. Pydantic: валидация `planned_salary >= 0` и `rate > 0` до БД.

## Риски и откат

- Изменение сигнатуры `setAssignmentRate` в api — обратно совместимо для вызовов (все вызывающие передают year из стора).
- Откат: revert коммита; бэкенд не меняется по контракту.

## Шаги

### 1. Контракт setAssignmentRate

- **Было:** `setAssignmentRate(assignmentId, year, month, rate)` — year берётся из замыкания в мутациях.
- **Стало:** `setAssignmentRate({ assignmentId, year, month, rate })` — один объект, год всегда явный.
- **Файлы:** `frontend/src/api/index.js`, `frontend/src/pages/ProjectDetailPage.jsx`, `frontend/src/pages/EmployeeDetailPage.jsx`.

### 2. Дублирование getMonthlyTotalRates

- **Проблема:** В `AssignmentManager.jsx` функция `getMonthlyTotalRates` дублирует логику бэкенда (`get_employee_month_total_rate` / `assignment_active_in_month`).
- **Решение:** Компонент принимает опциональный проп `assignmentsMonthlyTotalRates` (массив из 12 чисел с бэкенда). Если передан — используем его; иначе fallback на локальный расчёт (для обратной совместимости, если компонент вызывается без этого поля).
- **Файлы:** `frontend/src/components/AssignmentManager.jsx`.

### 3. Dashboard: by-department / by-specialization

- **Факт:** `BudgetSnapshot` — кэш по (project_id, year, month). Агрегация по подразделению/специализации требует стоимости по (employee, year, month). Сейчас эндпоинты делают O(employees×12) вызовов `calc_employee_month_cost`.
- **Сейчас:** Добавить в код комментарий об архитектурной непоследовательности. В плане зафиксировать вариант: введение таблицы/кэша по сотрудникам (например `EmployeeMonthSnapshot`) и заполнение в `recalculate_year`, затем переход by-department и by-specialization на чтение из кэша — отдельная задача.
- **Файлы:** `backend/app/routers/dashboard.py`, этот план.

### 4. Pydantic: валидация числовых полей

- В `EmployeeCreate`: при переданном `planned_salary` — не меньше 0; при переданном `rate` — строго больше 0.
- В `EmployeeUpdate`: при переданном `planned_salary` — не меньше 0 (rate в Update не меняется через эту схему).
- **Файлы:** `backend/app/schemas/employee.py`.

## Проверка

- После правок: смена ставки по месяцу на проекте и в карточке сотрудника (year из стора) — сохраняется корректно.
- Предупреждение о сумме ставок в AssignmentManager (если компонент начнут использовать с пропом `assignmentsMonthlyTotalRates`) строится по данным бэка.
- Создание/обновление сотрудника с `planned_salary < 0` или `rate <= 0` возвращает 422 с понятным сообщением.
- Lint и сборка без регрессий.

---

## Change-log (Implementer)

- **api/index.js:** `setAssignmentRate` принимает один аргумент-объект `{ assignmentId, year, month, rate }`; год передаётся явно.
- **ProjectDetailPage.jsx, EmployeeDetailPage.jsx:** мутация вызывает `setAssignmentRate({ assignmentId, year, month, rate })` с `year` из стора.
- **AssignmentManager.jsx:** добавлен проп `assignmentsMonthlyTotalRates`; при наличии массива из 12 элементов используется он (данные бэка), иначе — fallback `getMonthlyTotalRatesFallback`. Переименована старая функция в fallback.
- **dashboard.py:** в docstring by-department и by-specialization добавлено примечание, что используется calc в цикле, а не BudgetSnapshot; указана возможность развития через EmployeeMonthSnapshot.
- **schemas/employee.py:** в EmployeeCreate добавлены `@field_validator` для `planned_salary` (>= 0) и `rate` (> 0); в EmployeeUpdate — для `planned_salary` (>= 0).
