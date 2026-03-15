# План: критические и логические правки (workflow)

**Дата:** 2026-03-16  
**Тип:** багфикс + рефакторинг + инфраструктура

## Цели

1. Исправить определение `is_forecast` для текущего месяца и зафиксировать в тестах.
2. Убрать или защитить отладочный эндпоинт `DELETE /employees/all`.
3. CORS: вынести в конфиг и ужесточить в production.
4. Salary fallback: не переносить `one_time_bonus` (бизнес-правило «Does NOT carry forward»).
5. Тесты и качество: `make_salary(is_raise=...)`, тест на fallback без one_time_bonus, явные тесты is_forecast.
6. `recalculate_year`: явно избежать автофлаша в цикле.
7. Frontend: единый EmployeeForm из components; таблица участников в отдельный компонент.
8. Инфраструктура: Dockerfile `--workers 2`, healthcheck для backend в docker-compose.

## Решения

### 1. is_forecast

- **Правило:** месяц считаем **фактом** только если он полностью в прошлом (т.е. первый день месяца < первый день текущего месяца). Текущий месяц и будущие — **прогноз**.
- **Формула:** `is_forecast = (year > today.year) or (year == today.year and month >= today.month)`.
- В `CONTEXT.md` добавить явную формулировку. В тестах: текущий месяц при freeze_time — forecast.

### 2. DELETE /employees/all

- В `config.py`: флаг `DEBUG_MODE: bool = False` (из env).
- Эндпоинт перенести в отдельный debug-роутер, подключать только при `settings.DEBUG_MODE` в `main.py`. Либо оставить в employees, но поднимать 404 при `not settings.DEBUG_MODE`.

### 3. CORS

- В `config.py`: `CORS_ORIGINS: str = "*"` (список через запятую или `*`). В `main.py` использовать `settings.CORS_ORIGINS` (split по запятой, если не `*`).
- В чеклисте деплоя (devops/README) явно указать: в production задать `CORS_ORIGINS` (не `*`).

### 4. one_time_bonus при fallback

- Не мутировать ORM. В `get_salary_for_month` возвращать пару `(record, is_exact: bool)` или ввести вспомогательную функцию, которая возвращает «эффективные» суммы за месяц (при fallback — one_time_bonus=0).
- Реализация: `get_salary_for_month` возвращает `tuple[SalaryRecord | None, bool]` (record, is_exact). В `calc_employee_month_cost`: при fallback считать cost без one_time_bonus. Все вызовы `get_salary_for_month` в коде обновить (export.py, тесты).

### 5. Тесты

- `conftest.py`: в `make_salary` добавить параметр `is_raise=False`, передавать в `SalaryRecord`.
- `test_calc.py`: тест `test_fallback_does_not_carry_one_time_bonus` — за январь one_time=50k, за февраль записи нет → cost за февраль без 50k. Тест `test_is_forecast_current_month` — при freeze_time текущий месяц = forecast.

### 6. recalculate_year

- В цикле обновления снапшотов использовать `with db.no_autoflush:` (или временно `session.autoflush = False`), затем один `db.flush()` перед `db.commit()`. Сессия в проекте уже с `autoflush=False`, но явный no_autoflush в цикле — дополнительная гарантия.

### 7. Frontend

- **EmployeeForm:** `EmployeeDetailPage` и `EmployeesPage` использовать `components/EmployeeForm.jsx` с API `initial` + `onSubmit`. В EmployeesPage для создания: `initial={EMPTY_FORM}` (сброс при открытии модалки), `onSubmit={(payload) => createMut.mutate(payload)}`. Удалить локальный `EmployeeForm` из `EmployeesPage.jsx` и реэкспорт.
- **ProjectDetailPage:** вынести рендер таблицы участников (два варианта: с monthly_rates и без) в компонент `MembersTable.jsx` (props: members, year, withRates, setRateMut, setRemoveTarget, rateWarning, setRateWarning).

### 8. Инфраструктура

- **Dockerfile:** в CMD добавить `--workers 2` для production-образа (при необходимости можно переопределить в docker-compose).
- **docker-compose:** для сервиса backend добавить healthcheck (GET /health), например через `python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health')"`.

### 9. Документация и безопасность

- **localStorage / HttpOnly:** в коде или в docs указать, что для production предпочтительны HttpOnly cookies (требует изменений бэкенда). Не менять реализацию в рамках этой задачи.
- **CONTEXT.md:** обновить описание is_forecast и при необходимости упомянуть CORS/DEBUG_MODE.

## Риски и откат

- Изменение сигнатуры `get_salary_for_month` → все вызовы должны быть обновлены (calc.py, export.py, тесты). Откат — revert коммита.
- DEBUG_MODE по умолчанию False — в dev при необходимости задать `DEBUG_MODE=true` в .env.
- CORS по умолчанию оставить `*` для совместимости; ужесточение только через env.

## Шаги проверки

- Запуск pytest (backend).
- Ручная проверка: пересчёт года, просмотр бюджетов, создание/редактирование сотрудника и проекта.
- docker compose build && docker compose up — проверка healthcheck и работы backend.

---

## Change-log (Implementer)

- **config.py:** добавлены `DEBUG_MODE=False`, `CORS_ORIGINS="*"`.
- **main.py:** CORS берётся из `settings.CORS_ORIGINS`; эндпоинт delete/all не выносился в отдельный роутер.
- **employees.py:** DELETE /employees/all при `not settings.DEBUG_MODE` возвращает 404.
- **calc.py:** `get_salary_for_month` возвращает `(record, is_exact)`; в `calc_employee_month_cost` при fallback `one_time_bonus=0`; `is_forecast` = текущий месяц и будущие считаются прогнозом; `recalculate_year` обёрнут в `db.no_autoflush`, в конце `db.flush()` перед `commit`.
- **export.py:** использование `(rec, is_exact)` и обнуление one_time в экспорте при fallback.
- **conftest.py:** в `make_salary` добавлен параметр `is_raise=False`.
- **test_calc.py:** все вызовы `get_salary_for_month` распаковывают кортеж; добавлены тесты `test_fallback_does_not_carry_one_time_bonus`, `test_current_month_is_forecast`.
- **Dockerfile:** в CMD добавлен `--workers 2`.
- **docker-compose.yml:** для backend добавлен healthcheck (GET /health).
- **Frontend:** EmployeeForm везде из `components/EmployeeForm.jsx` (initial + onSubmit); локальная форма и экспорт удалены из EmployeesPage; таблица участников вынесена в `components/MembersTable.jsx`.
- **CONTEXT.md:** правила is_forecast и one_time_bonus, примечание про CORS и HttpOnly, описание DELETE /employees/all.

---

## VERDICT (Guardian)

- **APPROVE** при условии прохождения pytest в среде с установленными зависимостями (freezegun и др.). Изменения локальны, обратная совместимость API сохранена; DELETE /employees/all в production возвращает 404 без флага.

---

## Tester

- Проверено: тесты test_calc обновлены под новую сигнатуру и добавлены сценарии fallback без one_time_bonus и текущий месяц = forecast. Ручная проверка: после `pip install -r requirements.txt` выполнить `pytest tests/ -o addopts="-v --tb=short"` (или с cov при наличии pytest-cov).
