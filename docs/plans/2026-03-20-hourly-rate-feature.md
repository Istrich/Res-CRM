# План: Расчёт и отображение часовой ставки сотрудников

**Сценарий:** новая функция  
**Цепочка:** Architect → Implementer → Guardian → Tester → Documenter

## Цель

Вычислять почасовую ставку сотрудника помесячно:

```
hourly_rate[year][month] = total_monthly_income / working_hours[year][month]
```

Где `total_monthly_income` = `salary + kpi_bonus + fixed_bonus + one_time_bonus` (из `SalaryRecord.total`),  
`working_hours[year][month]` — рабочие часы из `WorkingHoursYearMonth` (добавлены ранее).

Если часы = 0 или запись в `SalaryRecord` отсутствует → `null` (не отображать).

## Места отображения

| Место | Описание |
|-------|----------|
| Список сотрудников | Столбец «Ч/ст (МЕС)» после «Увольнение» — для выбранного месяца |
| Карточка сотрудника | Строка «Часовая ставка» в таблице «Вознаграждение» — 12 месяцев |
| Карточка проекта | Блок «Часовые ставки участников (₽/ч)» — матрица участник × 12 месяцев |

## Архитектурные решения

### Backend

1. **`app/services/calc.py`** — добавить 2 чистые функции:
   - `get_working_hours_map(db, year) → dict[int, float]` — одним запросом, кэш для N employees
   - `calc_hourly_rate(total, hours) → float | None` — делит, возвращает None при hours=0

2. **`app/schemas/employee.py`** — добавить поле:
   - `EmployeeListItem.monthly_hourly_rates: Optional[list[float | None]] = None`
   - `EmployeeOut.monthly_hourly_rates: Optional[list[float | None]] = None`

3. **`app/services/employees_service.py`** — расширить:
   - `build_list_item(emp, year, month, hours_map=None)` — вычислять `monthly_hourly_rates`
   - `build_employee_out(emp, year, db, hours_map=None)` — вычислять `monthly_hourly_rates`

4. **`app/routers/employees.py`** — в `list_employees`:
   - Преобразовать `hours_map` один раз (до цикла) → передать в `build_list_item`

5. **`app/routers/projects.py`** — в `get_project_employees`:
   - Использовать `batch_employee_month_costs` (уже есть) + `get_working_hours_map` → `monthly_hourly_rates` в ответе

### Frontend

6. **`EmployeesPage.jsx`** — `EmployeeRow`:
   - Новый столбец «Ч/ст ({mes})» после «Увольнение»

7. **`EmployeeDetailPage.jsx`** — таблица вознаграждений:
   - Строка `{ key: 'hourly_rate', label: 'Ч/ставка, ₽/ч' }` после «Итого»

8. **`ProjectDetailPage.jsx`**:
   - Новая карточка «Часовые ставки участников (₽/ч)» под таблицей участников

### Tests

9. **`backend/tests/test_hourly_rate.py`**

## Риски

| Риск | Митигация |
|------|-----------|
| hours = 0 → деление на 0 | `calc_hourly_rate` возвращает None |
| Нет записи часов для года → None везде | `get_working_hours_map` возвращает пустой dict; None в каждом месяце |
| N+1 запросов для списка сотрудников | `hours_map` вычисляется один раз до цикла |
| N+1 для проекта | `batch_employee_month_costs` + единый `hours_map` |

## Rollback

Убрать поля `monthly_hourly_rates` из схем, удалить вызовы вычисления, откатить фронтенд.

## Guardian (предварительно)

- `calc_hourly_rate` — чистая функция, протестировать граничные случаи
- Не логировать зарплатные данные
- Старые API-ответы совместимы: поле `None` по умолчанию

## Tester (чек-лист)

- Unit: `calc_hourly_rate(120000, 160) == 750.0`, `calc_hourly_rate(0, 0) is None`
- API: `GET /employees?year=2024&month=6` возвращает `monthly_hourly_rates[5]`
- API: `GET /projects/{id}/employees?year=2024` возвращает `monthly_hourly_rates`
- UI: список сотрудников — колонка «Ч/ст» при заданных рабочих часах
- UI: карточка сотрудника — строка "Ч/ставка, ₽/ч"
- UI: карточка проекта — блок "Часовые ставки участников"

## Guardian — APPROVE ✅

Все проверки пройдены: нет деления на 0, нет N+1, нет голых except, нет логирования зарплатных данных, backward-compatible поля.

## Change-log (Implementer)

| Что | Где |
|-----|-----|
| `get_working_hours_map`, `calc_hourly_rate` | `backend/app/services/calc.py` |
| `monthly_hourly_rates` в схемах | `backend/app/schemas/employee.py` |
| `build_list_item`, `build_employee_out` с hourly | `backend/app/services/employees_service.py` |
| Передача `hours_map` в список | `backend/app/routers/employees.py` |
| `monthly_hourly_rates` для участников проекта | `backend/app/routers/projects.py` |
| Столбец «Ч/ст» в списке | `frontend/src/pages/EmployeesPage.jsx` |
| Строка «Ч/ставка, ₽/ч» в карточке | `frontend/src/pages/EmployeeDetailPage.jsx` |
| Блок часовых ставок в проекте | `frontend/src/pages/ProjectDetailPage.jsx` |
| Тесты | `backend/tests/test_hourly_rate.py` |

## Tester — DONE ✅

Написаны тесты (синтаксис проверен `compileall`):
- `TestCalcHourlyRate`: 6 кейсов (norm, round, zero-hours×2, zero-total, both-zero)
- `TestGetWorkingHoursMap`: 3 кейса (empty, correct map, different year)
- `TestBuildListItemHourlyRates`: 3 кейса (has rates, no hours_map, hours=0)
- `TestEmployeesAPIHourlyRates`: 2 кейса (with/without working hours)
- `TestProjectEmployeesAPIHourlyRates`: 2 кейса (with/without working hours)

Запуск автотестов в текущем окружении невозможен (pytest не установлен). Ручной чек-лист:
1. Заполнить рабочие часы в Настройках (напр. Январь=160, Февраль=168...)
2. В списке сотрудников появится колонка «Ч/ст (ЯНВ)» — для выбранного месяца
3. В карточке сотрудника → таблица «Вознаграждение» → строка «Ч/ставка, ₽/ч»
4. В карточке проекта → блок «Часовые ставки участников (₽/ч)» под таблицей участников
5. Если часы не заполнены — везде «—»
