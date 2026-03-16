## Цель

Сделать бюджеты по проектам и «бюджетным проектам» помесячными: ввод годового бюджета в виде распределения по месяцам и отображение расходования также по месяцам, чтобы видеть, где факт и план сходятся / расходятся и на сколько.

## Текущее состояние

- В БД:
  - `BudgetProject.total_budget` — единое значение бюджета на год.
  - `BudgetSnapshot` — помесячные суммы факта/прогноза по каждому проекту (`amount`, `is_forecast`, `year`, `month`).
- Бэкенд:
  - `GET /budgets/projects/{project_id}?year=...` — возвращает `monthly` (список снапшотов) и сводку по проекту.
  - `GET /budgets/budget-projects/{bp_id}?year=...` — возвращает агрегированную сводку по бюджетному проекту, **без помесячного плана/факта**.
  - `GET /budgets/overview?year=...` — годовые агрегаты для проектов и бюджетных проектов без помесячной детализации.
- Фронтенд:
  - `ProjectDetailPage` отображает помесячные расходы/прогноз по проекту (из `budget.monthly`).
  - `BudgetProjectDetailPage` показывает только годовые суммы (`spent`, `forecast`, `remaining`, `total_budget`) и список проектов, но не помесячную сетку.
  - Страница `BudgetProjectsPage` и модалки создания/редактирования оперируют одним полем «общий бюджет на год».

## Требования

1. **Плановый бюджет по месяцам**
   - Для каждого бюджетного проекта в рамках года пользователь должен иметь возможность задать **распределение годового бюджета по 12 месяцам**.
   - Можно начинать с равномерного автозаполнения при вводе годовой суммы, с возможностью ручной корректировки по месяцам.
2. **Сопоставление плана и факта**
   - Для каждого **проекта**:
     - Уже есть помесячный факт/прогноз (из `BudgetSnapshot`).
     - Нужно добавить **собственный** помесячный план проекта (приоритетно) и/или унаследованный план от бюджетного проекта.
     - В UI показать таблицу: по месяцам — план (свой или унаследованный), факт, отклонение (в абсолюте и/или %).
   - Для каждого **бюджетного проекта**:
     - Показать помесячный агрегат: план, факт, отклонение.
3. **Агрегация**
   - Годовой бюджет (`total_budget`) должен быть производным от суммы помесячных планов (чтобы не расходилось).
   - Для совместимости оставить `total_budget` в API, но вычислять/обновлять его на основе помесячных планов.
4. **Совместимость и постепенная миграция**
   - Не ломать существующие эндпоинты и фронтенд:
     - Старые поля (`total_budget`, годовые суммы) остаются.
     - Новый помесячный план добавляется как дополнительные структуры в ответах.
   - При отсутствии помесячного плана:
     - Использовать равномерное распределение годового бюджета как «виртуальный» план, чтобы отчёты продолжали работать.

## Архитектурное решение

### Модель данных

- Добавить новую таблицу **`budget_project_month_plans`**:
  - `id UUID PK`
  - `budget_project_id UUID FK -> budget_projects.id ON DELETE CASCADE`
  - `year int` (для явной привязки к году, хотя у `BudgetProject` уже есть `year`)
  - `month int` (1–12)
  - `amount Numeric(15, 2) NOT NULL DEFAULT 0`
  - Ограничения:
    - `UNIQUE (budget_project_id, year, month)`
    - `CHECK(month BETWEEN 1 AND 12)`
- В ORM (`app.models`):
  - Класс `BudgetProjectMonthPlan` с relationship к `BudgetProject` (`budget_project.month_plans: list[BudgetProjectMonthPlan]`).
- Поле `BudgetProject.total_budget`:
  - **Не удаляем**, но логически считаем суммой `month_plans`:
    - При сохранении/обновлении помесячных планов — обновлять `total_budget`.
    - При создании бюджетного проекта с `total_budget` без помесячного плана — заполнять `month_plans` равномерно.

Дополнительно для проектного уровня:

- Добавить новую таблицу **`project_month_plans`**:
  - `id UUID PK`
  - `project_id UUID FK -> projects.id ON DELETE CASCADE`
  - `year int`
  - `month int` (1–12)
  - `amount Numeric(15, 2) NOT NULL DEFAULT 0`
  - Ограничения:
    - `UNIQUE (project_id, year, month)`
    - `CHECK(month BETWEEN 1 AND 12)`
- В ORM:
  - Класс `ProjectMonthPlan` с relationship к `Project` (например, `project.month_plans`).
- При наличии **собственного** плана проекта именно он используется в расчётах план/факт по проекту; при его отсутствии — используется план бюджетного проекта.

### Бэкенд API

#### 1. CRUD для помесячных планов

- Новый эндпоинт:
  - `GET /budget-projects/{bp_id}/month-plan?year=...`
    - Возвращает список из 12 элементов `{month, amount}` (0, если нет записи).
  - `PUT /budget-projects/{bp_id}/month-plan?year=...`
    - Принимает список `{month, amount}` (1–12), валидирует сумму (опционально) и перезаписывает помесячный план для данного года.
    - По итогам обновляет `BudgetProject.total_budget = sum(amount)` для данного `bp`.
- Pydantic-схемы в `app.schemas.project`:
  - `BudgetMonthItem { month: int; amount: float }`
  - `BudgetProjectMonthPlanIn { year: int; items: list[BudgetMonthItem] }`
  - `BudgetProjectMonthPlanOut аналогично`.

#### 2. Расширение существующих эндпоинтов

- `GET /budgets/budget-projects/{bp_id}?year=...`:
  - Добавить поле `monthly_plan`: `[{"month": 1, "amount": ...}, ...]` (12 шт, 0 по умолчанию).
  - Добавить поле `monthly_fact`: `[{"month": 1, "amount": ...}, ...]` — агрегат факта/прогноза по всем проектам в бюджетном проекте:
    - Использовать `BudgetSnapshot` по всем проектам данного `bp`.
    - Отдельно считать:
      - факт: `sum(amount where is_forecast=False)`
      - прогноз: можно для UI возвращать одну метрику (например, общая `forecast` по аналогии с проектом) или только факт.
  - Добавить поле `monthly_diff`: `{month, plan, fact, diff}` — опционально, но логично сформировать на бэке.
- `GET /projects/{id}` и/или `GET /budgets/projects/{project_id}`:
  - Уже возвращают `monthly` по факту/прогнозу.
  - Для сопоставления с планом:
    - Расширен ответ `GET /budgets/projects/{project_id}`:
      - `monthly_plan` — помесячное распределение **плана проекта, если есть**, иначе унаследованный план бюджетного проекта.
      - `monthly_diff` — `{month, fact, plan, diff}`.
    - План для проекта редактируется через отдельный эндпоинт `/projects/{project_id}/month-plan`.

#### 3. Логика агрегации

- Новый сервисный слой (в `app.services.calc` или отдельном модуле, например `app.services.budget_plan`):
  - Функции:
    - `get_budget_project_month_plan(db, bp_id, year) -> list[MonthPlan]`
    - `set_budget_project_month_plan(db, bp_id, year, items) -> MonthPlan[]`
    - `get_budget_project_month_fact(db, bp_id, year) -> list[MonthFact]`:
      - Собрать все `BudgetSnapshot` по проектам бюджетного проекта, сгруппировать по месяцу.
    - `get_project_month_plan(db, project_id, year) -> list[MonthPlan] | None`:
      - Если у проекта есть **собственный план** в `project_month_plans`, использовать его.
      - Иначе, если проект привязан к бюджетному проекту и у того есть план, использовать план бюджетного проекта.
      - Если ни собственного, ни бюджетного плана нет, возвращать `None`.
    - Отдельные функции:
      - `get_project_own_month_plan` / `set_project_own_month_plan` для явной работы с `project_month_plans`.
- В расчётах:
  - Никаких изменений в `recalculate_year` и `BudgetSnapshot` — они считаются, как и раньше.

### Фронтенд

#### 1. Ввод помесячного плана для бюджетного проекта

- Страница `BudgetProjectDetailPage`:
  - Добавить блок «Помесячный бюджет»:
    - Таблица 12 месяцев:
      - Вводимые поля `input type="number"` для каждого месяца (план).
      - Автокнопка «Равномерно» для перераспределения текущей годовой суммы или введённой суммы.
    - Кнопка «Сохранить план», вызывающая `PUT /budget-projects/{id}/month-plan`.
  - При загрузке:
    - `GET /budget-projects/{id}/month-plan?year=...`
    - Если план пустой, но есть `total_budget`, предзаполнить равномерно.

#### 2. Отображение план vs факт по бюджетному проекту

- В `BudgetProjectDetailPage`:
  - Карточка с помесячной таблицей:
    - Для каждого месяца:
      - План
      - Факт (из `monthly_fact`)
      - Отклонение (факт - план) и цвет (зелёный, если факт <= план; красный при перерасходе).
  - Дополнительно можно подсветить месяцы с перерасходом.

#### 3. Отображение план vs факт по проекту

- В `ProjectDetailPage`:
  - Уже есть блок «Расходы по месяцам» (таблица по `budget.monthly`).
  - Расширить его:
    - Либо превратить в две строки:
      - Первая строка — план (если есть `monthly_plan`).
      - Вторая строка — факт/прогноз (как сейчас).
    - Либо добавить в ячейки подпись вида `факт / план`.
  - Данные брать из расширенного ответа `/budgets/projects/{project_id}`.

### Миграции и откат

- **Миграция Alembic**:
  - Создать таблицу `budget_project_month_plans`.
  - Обратимая миграция: `downgrade` удаляет таблицу.
  - Так как новая таблица не используется существующим кодом до деплоя фронта/бэкенда, рисков нет.
- **Откат**:
  - При проблемах можно:
    - Откатить код бэкенда/фронтенда.
    - Выполнить `downgrade`, удалив таблицу.
  - `BudgetSnapshot` и текущие отчёты не зависят от новой структуры.

## Шаги реализации

1. **База и модели**
   - Добавить модель `BudgetProjectMonthPlan` в `app.models`.
   - Написать Alembic-миграцию для создания таблицы.
   - Добавить relationship `BudgetProject.month_plans`.
2. **Сервисный слой**
   - Реализовать функции получения/сохранения помесячного плана и агрегации факта в сервисе (новый модуль или `calc.py`).
3. **Бэкенд-роуты**
   - Добавить эндпоинты `GET/PUT /budget-projects/{bp_id}/month-plan`.
   - Расширить `GET /budgets/budget-projects/{bp_id}` полями `monthly_plan`, `monthly_fact`, `monthly_diff`.
   - Расширить `GET /budgets/projects/{project_id}` полями `monthly_plan`, `monthly_diff`.
4. **Фронтенд API-обёртки**
   - Добавить функции в `frontend/src/api` для работы с новым API.
5. **UI бюджетного проекта**
   - В `BudgetProjectDetailPage`:
     - Добавить форму редактирования помесячного плана.
     - Добавить таблицу сравнения план/факт по месяцам.
6. **UI проекта**
   - В `ProjectDetailPage`:
     - Расширить блок помесячных расходов, чтобы одновременно отображать план и факт.
7. **Тесты и проверка**
   - Юнит-тесты для сервиса помесячных планов.
   - API-тесты для новых эндпоинтов.
   - Ручная проверка:
     - Создать бюджетный проект с годовым бюджетом.
     - Настроить помесячный план.
     - Запустить пересчёт бюджетов.
     - Проверить отображение план/факт на страницах проекта и бюджетного проекта.

## Риски

- Несогласованность `total_budget` и суммы помесячных планов:
  - Решение: считать `total_budget` производным значением, обновляемым при изменении плана.
- Перегрузка UI:
  - Решение: ограничиться табличной формой без сложной визуализации, с аккуратной подсветкой отклонений.
- Производительность агрегаций:
  - Работать по уже агрегированным `BudgetSnapshot`, не считать заново зарплаты.

## Change-log (Implementer)

**Что сделано:**
- **Модель:** `BudgetProjectMonthPlan` в `app.models` (таблица `budget_project_month_plans`), связь `BudgetProject.month_plans`. Миграция `0005_budget_project_month_plans.py`.
- **Схемы:** `BudgetMonthItem`, `BudgetProjectMonthPlanIn`, `BudgetProjectMonthPlanOut` в `app.schemas.project`.
- **Сервис:** `app.services.budget_plan` — `get_budget_project_month_plan`, `set_budget_project_month_plan`, `get_budget_project_month_fact`, `get_project_month_plan`.
- **API:**  
  - `GET/PUT /budget-projects/{bp_id}/month-plan?year=...` (перед `GET /{bp_id}`).  
  - При создании БП с `total_budget` — равномерное заполнение помесячного плана (сумма = годовой бюджет).  
  - `GET /budgets/budget-projects/{bp_id}` расширен полями `monthly_plan`, `monthly_fact`, `monthly_diff`.  
  - `GET /budgets/projects/{project_id}` расширен полями `monthly_plan`, `monthly_diff`.
- **Фронт:**  
  - API: `getBudgetProjectMonthPlan`, `putBudgetProjectMonthPlan`.  
  - `BudgetProjectDetailPage`: блок «План по месяцам» (12 полей, «Равномерно», «Сохранить план»), таблица «План и факт по месяцам».  
  - `ProjectDetailPage`: в блоке расходов по месяцам добавлены строки «План» и «Отклонение» при наличии `monthly_plan`/`monthly_diff`.
- **Тесты:** `tests/test_budget_plan.py` (сервис), `TestBudgetProjectMonthPlan` в `test_api_projects.py`, расширены проверки в `test_budget_project_budget` и `test_project_budget`.

**Как проверить вручную:**
1. Создать бюджетный проект с годовым бюджетом → открыть карточку → в «План по месяцам» нажать «Равномерно», «Сохранить план». Убедиться, что таблица «План и факт по месяцам» отображается.
2. Пересчитать бюджеты (Бюджеты → Пересчитать). На странице бюджетного проекта проверить факт по месяцам и отклонения.
3. Открыть проект, входящий в бюджетный проект: в блоке «Расходы по месяцам» должны быть строки План, Факт/прогноз, Отклонение.

## Отчёт Tester

**Покрыто:**
- Юнит-тесты сервиса `budget_plan`: пустой план, set_plan (total_budget, частичные месяцы), get_project_month_plan (с БП / без БП), get_budget_project_month_fact (пустой).
- API: GET/PUT month-plan (успех, 404), GET budget-projects/{id} и GET budgets/projects/{id} — наличие `monthly_plan`, `monthly_fact`, `monthly_diff` и длины 12.
- Регрессия: все тесты в `backend/tests/` проходят (в т.ч. TestBudgetProjectsCRUD.test_create с точной суммой после равномерного распределения).

**Запуск:** `cd backend && uv run pytest tests/` или `pytest tests/test_budget_plan.py tests/test_api_projects.py -v`.

**Frontend:** ручной чек-лист выше (план по месяцам, таблица план/факт, проект с планом и отклонением).

## Guardian VERDICT

**APPROVE.**

- Lint: замечаний нет.
- Documenter: обновлён `README.md` (таблица `budget_project_month_plans`, сценарии «Помесячный план» и «План/отклонение» в карточке проекта). План `docs/plans/2026-03-16-monthly-budgets.md` дополнен разделами Change-log, Tester, Guardian, Documenter.
- Сборка: миграция и модели загружаются; при наличии БД — `alembic upgrade head`.
- Тесты: 172 теста зелёные (в т.ч. новые и расширенные проверки).
- DoD: план в `docs/plans/`, change-log, тесты на поведение, обратная совместимость API сохранена.

## Вывод

Предлагаемое решение расширяет модель и API минимально инвазивным образом, сохраняет совместимость со старой схемой и использует уже существующие помесячные снимки (`BudgetSnapshot`) только для факта/прогноза, добавляя отдельный слой для плановых помесячных бюджетов.
