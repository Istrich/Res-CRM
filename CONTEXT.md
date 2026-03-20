# CONTEXT.MD — контекст проекта Res-CRM

Документ для быстрого понимания проекта человеком и AI (Cursor, GitHub Copilot, Cloud Code). Содержит: что это, как устроено, как запустить, где что искать, ограничения и соглашения.

---

## 1. Что это за проект

**Res-CRM (Mini CRM)** — веб-приложение для управления персоналом и бюджетами проектов:

- **Сотрудники и позиции** — одна таблица `employees` с флагом `is_position`. Позиции используются как вакансии (вкладка «Найм»).
- **Проекты** — рабочие проекты с привязкой к бюджетному проекту. У каждого участника — ставка и период; ставку можно задавать по месяцам (таблица 12 месяцев).
- **Вознаграждение** — по месяцам: оклад, KPI, фикс. надбавка, разовая премия; флаг «Повышение» (подсветка месяца в таблицах).
- **Бюджеты** — бюджетные проекты (год, сумма), пересчёт расходов по проектам, снапшоты по месяцам, статусы ok/warning/overrun, экспорты в Excel.
- **Один пользователь** — JWT хранится в `HttpOnly` cookie `access_token`, один логин/пароль (admin). Роли не реализованы.

Стек: **Backend** — Python 3.11, FastAPI, SQLAlchemy 2, Pydantic, Alembic, PostgreSQL, slowapi. **Frontend** — React 18, Vite 6, React Router, TanStack Query v5, Zustand, Axios.

---

## 2. Как запустить

### Локально (Docker + фронт на хосте)

```bash
# Корень репозитория
docker compose up -d
# Миграции при старте backend выполняются через docker-entrypoint.sh (ручной alembic при необходимости: docker compose exec backend alembic upgrade head)

cd frontend
npm install
npm run dev
```

- **Frontend (разработка):** http://localhost:3000 (Vite проксирует `/api` на backend).

#### Доступ с другого компьютера в локальной сети (LAN)

1. **Порт:** в `frontend/vite.config.js` задано `port: 3000` и `host: '0.0.0.0'` — с другого ПК открывайте **`http://<IP-сервера>:3000/employees`**, а не `:3001`, если вы не меняли порт вручную (`npm run dev -- --port 3001`).
2. **На сервере должны работать:** Docker с backend (`docker compose up -d`) и `npm run dev` в `frontend/` — API идёт через прокси Vite на `localhost:8000` на той же машине.
3. **Проверка с сервера:** `curl -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3000/` и с другого ПК: `ping <IP>` затем открыть URL в браузере.
4. **Firewall (macOS):** «Системные настройки» → «Сеть» / «Защита и безопасность» → разрешить входящие для Node/Vite или временно проверить с отключённым файрволом.
5. **Роутер:** отключите «изоляцию клиентов Wi‑Fi» (AP/client isolation), если ПК в разных сегментах сети.
6. **Полный стек в Docker** (`--profile full`): приложение — **`http://<IP>:3000`**, не 3001 (в `docker-compose.yml` проброшен `3000:80`).

### Весь стек в Docker (автозапуск / прод)

```bash
docker compose --profile full up -d --build
```

- **Приложение:** http://localhost:3000 (nginx + статика, `/api` → backend). Контейнеры с `restart: unless-stopped`.
- **Backend:** http://localhost:8000.
- **Swagger:** http://localhost:8000/docs.

Логин: `admin` / `admin123` (меняется в `backend/.env`: `ADMIN_USERNAME`, `ADMIN_PASSWORD`).

**Если логин/пароль «верные», но пишет неверные:** пароль в PostgreSQL был сохранён при **первом** запуске backend. Смена `ADMIN_PASSWORD` в `.env` **сама по себе не меняет** хеш в таблице `users`. Варианты: (1) в `.env` выставить `ADMIN_SYNC_PASSWORD_FROM_ENV=true`, перезапустить backend, войти, затем вернуть `false`; (2) войти с **тем** паролем, который был при первом старте (часто дефолтный `admin123`); (3) удалить строку пользователя в `users` и перезапустить backend (создастся заново из `.env`).

Даже если вы **не меняли** `.env`, база могла появиться из **старого тома Docker** (`pgdata`) или бэкапа — тогда в `users` другой хеш. Тогда помогает п. (1) или (3). После нескольких неудачных попыток срабатывает лимит **5 запросов/мин** на `/auth/login` — интерфейс покажет отдельное сообщение про «слишком много попыток». В логах backend при 401: `login failed for username=...`.

### Без Docker (если БД уже есть)

- В `backend/.env` задать `DATABASE_URL` на свой PostgreSQL.
- В корне `backend`: `pip install -r requirements.txt`, `uvicorn app.main:app --reload --port 8000`, `alembic upgrade head`.
- В `frontend`: `npm install`, `npm run dev` (прокси в vite.config.js ведёт на localhost:8000).

---

## 3. Структура репозитория (где что искать)

### Backend (`backend/`)

| Путь | Назначение |
|------|------------|
| `app/main.py` | Точка входа FastAPI, CORS, lifespan, подключение роутеров |
| `app/config.py` | Настройки (pydantic-settings), читает `.env` |
| `app/database.py` | `engine`, `SessionLocal`, `get_db` |
| `app/dependencies.py` | `get_current_user` (JWT из HttpOnly cookie + Bearer fallback), зависимость для защищённых эндпоинтов |
| `app/models/__init__.py` | Все ORM-модели (User, BudgetProject, BudgetProjectMonthPlan, Project, ProjectMonthPlan, Employee, EmployeeProject, AssignmentMonthRate, SalaryRecord, BudgetSnapshot, **WorkingHoursYearMonth**) |
| `app/schemas/` | Pydantic-схемы: auth, employee (в т.ч. SalaryRecordUpsert/Out, EmployeeListItem с monthly_totals, monthly_is_raise), project, assignment (AssignmentMonthRateSet и др.), settings (WorkingHoursMonthItem, WorkingHoursUpsert, WorkingHoursOut) |
| `app/routers/` | auth, employees, projects, budget_projects, assignments, budgets, dashboard, exports, backup, **settings** |
| `app/middleware.py` | AccessLogMiddleware (structured access log) |
| `app/types.py` | GUID SQLAlchemy type (PG UUID / SQLite CHAR(36)) |
| `app/utils.py` | escape_like() для LIKE/ILIKE safety |
| `app/services/auth.py` | JWT, bcrypt, get_or_create_admin |
| `app/services/calc.py` | Расчёт: активность в месяце, зарплатный fallback, расход по проекту/месяцу (с учётом assignment_month_rates), пересчёт года, статусы; **`get_working_hours_map()` и `calc_hourly_rate()` для расчёта часовых ставок** |
| `app/services/dashboard_service.py` | Логика dashboard (роутер тонкий, бизнес-логика отдельно); **`get_hourly_rates()` — почасовые ставки по специализациям**; **`get_summary()` — добавлено поле `monthly_plan` (суммарный план по `BudgetProjectMonthPlan` за год)** |
| `app/services/employees_service.py` | Выделенная логика сотрудников (используется роутерами) |
| `app/services/export.py` | Генерация Excel (сотрудники, проекты, бюджетные проекты, ФОТ) |
| `app/services/import_employees.py` | Парсинг Excel импорта сотрудников (заголовки, даты, fallback по столбцам) |
| `migrations/versions/` | Alembic: 0001_initial, 0002_assignment_month_rates, 0003_salary_record_is_raise, 0004_position_planned_fields, 0005_budget_project_month_plans, 0006_project_month_plans, 0007_add_indexes. **Внимание:** таблица `working_hours_year_months` (модель WorkingHoursYearMonth) создаётся через `Base.metadata.create_all` при первом запуске; для существующих БД требуется миграция 0008 |

### Frontend (`frontend/src/`)

| Путь | Назначение |
|------|------------|
| `main.jsx` | Роуты (React Router), RequireAuth, QueryClientProvider, Layout как обёртка для авторизованных страниц |
| `api/client.js` | Axios instance `baseURL: '/api'`, `withCredentials=true` (cookie `access_token`), 401 → редирект на /login |
| `api/index.js` | Все вызовы API (auth, employees, salary, projects, assignments, budget-projects, budgets, dashboard, exports, backup, **settings**) |
| `store/auth.js` | Zustand: флаг `isAuthenticated` (в `sessionStorage`), login/logout |
| `store/year.js` | Zustand: year (выбор года в сайдбаре) |
| `components/layout/Layout.jsx` | Сайдбар: логотип, выбор года, навигация (Дашборд, Сотрудники, Найм, Проекты, Бюджетные проекты, Бюджеты), выход |
| `components/ui/Modal.jsx` | Модальное окно (title, onClose, footer, children) |
| `components/ui/Confirm.jsx` | Подтверждение (message, onConfirm, onCancel, loading), кнопки type="button" |
| `components/EmployeeForm.jsx` | Форма сотрудника/позиции (используется на странице сотрудников и в карточке) |
| `components/AssignmentManager.jsx` | Блок назначений на проекты в карточке сотрудника |
| `pages/LoginPage.jsx` | Форма логина |
| `pages/DashboardPage.jsx` | Дашборд (год из store): вкладки Overview, Projects, BudgetProjects, Departments, Specializations, **HourlyRates** |
| `pages/dashboard/OverviewTab.jsx` | Вкладка «Общее»: KPI-карточки; **расходы по месяцам план/факт** (прошлые месяцы — «Факт» + «План» рядом, будущие — только «План»); **расходы по проектам** (столбчатая диаграмма, все проекты, горизонтальный скролл); **круговые диаграммы** по подразделениям и специализациям; **движение персонала** (LineChart, клик → детализация) |
| `pages/dashboard/HourlyRatesTab.jsx` | Вкладка дашборда: часовые ставки по специализациям (мин/макс/среднее по месяцам), bar-chart средней ставки, предупреждение если рабочие часы не настроены |
| `pages/EmployeesPage.jsx` | Список сотрудников, фильтры, создание, импорт (таблица/Excel), экспорт, удаление, «Удалить всех» (отладка) |
| `pages/EmployeeDetailPage.jsx` | Карточка сотрудника: редактирование, назначения, таблица ЗП по месяцам (в т.ч. «Повышение», продлить до декабря) |
| `pages/HiringPage.jsx` | Список позиций (getEmployees с is_position: true) |
| `pages/ProjectsPage.jsx` | Список проектов, создание, удаление (Confirm + deleteProject) |
| `pages/ProjectDetailPage.jsx` | Карточка проекта: участники, ставки по месяцам (12 колонок), предупреждение суммы ставок, редактирование, удаление |
| `pages/BudgetProjectsPage.jsx` | Бюджетные проекты за год, создание, удаление, экспорт |
| `pages/BudgetProjectDetailPage.jsx` | Карточка бюджетного проекта, редактирование, удаление |
| `pages/BudgetsPage.jsx` | Пересчёт, сводка, экспорты (проекты, бюджетные, ФОТ) |
| `pages/SettingsPage.jsx` | Настройки: бэкап/восстановление PostgreSQL, **редактирование рабочих часов по месяцам для расчёта часовой ставки** |
| `utils/index.js` | fmt, fmtDate, MONTHS, statusLabel, statusColor, downloadBlob |

### Конфигурация

- **docker-compose.yml** — сервисы `db` (PostgreSQL 16), `backend` (build ./backend, порт 8000, volume ./backend, uvicorn --reload). Сеть по умолчанию, без host network.
- **frontend/vite.config.js** — port 3000, proxy `/api` → `http://localhost:8000` с rewrite на `/`.
- **backend/.env** — обязательны DATABASE_URL, SECRET_KEY, опционально ADMIN_USERNAME, ADMIN_PASSWORD и др. (см. config.py).

---

## 4. Ключевые потоки данных

- **Год** — выбранный в сайдбаре год хранится в `year` (Zustand). Запросы списков, бюджетов, ЗП, ставок по месяцам передают `year` в API.
- **Авторизация** — `POST /auth/login` устанавливает JWT в `HttpOnly` cookie `access_token` (фронт хранит только флаг `isAuthenticated` в `sessionStorage`); axios делает запросы с `withCredentials=true`; 401 приводит к редиректу на `/login`.
- **API (опционально):** `get_current_user` читает cookie первым, а Bearer-заголовок поддерживается для внешних API-клиентов.
- **Список сотрудников** — GET /employees с параметрами (year, search, department, specialization, is_position и др.). При year возвращаются monthly_totals и monthly_is_raise (для подсветки «Повышение»).
- **Ставки по месяцам на проекте** — GET /projects/:id/employees?year= возвращает для каждого участника monthly_rates (12 значений) и monthly_total_rates (сумма ставок по всем проектам для предупреждения). Изменение: PUT /assignments/:id/rates/:year/:month с телом { rate }.
- **Зарплата по месяцам** — GET /employees/:id/salary?year=, PUT /employees/:id/salary/:year/:month (salary, kpi_bonus, fixed_bonus, one_time_bonus, is_raise). «Продлить до декабря» делается на фронте несколькими запросами.
- **Батч-зарплата:** `PUT /employees/:id/salary/batch` — атомарный upsert нескольких месяцев одним запросом.
- **Пересчёт бюджетов** — POST /budgets/recalculate?year=, дальше чтение через GET /budgets/overview, GET /budgets/projects/:id и т.д.
- **Импорт сотрудников** — POST /employees/import (JSON массив строк) или POST /employees/import/excel (multipart file). Парсер Excel в backend/app/services/import_employees.py.
- **Рабочие часы и часовые ставки** — таблица `working_hours_year_months` хранит количество рабочих часов для каждого месяца года. Настраивается через страницу **Настройки** (GET/PUT `/settings/working-hours?year=`). `calc_hourly_rate(total, hours)` считает `total / hours`. Дашборд `/dashboard/hourly-rates?year=` агрегирует `overall_monthly_avg` и `by_specialization` (среднее, мин, макс ставка по месяцам). Если часы не настроены — значения `null`, фронт показывает предупреждение с ссылкой на Настройки.

---

## 5. Ограничения и соглашения (важно для правок)

- **Не менять** структуру/имена коллекций БД без плана миграции и отката. Не ломать обратную совместимость карточек/импорта. Не менять структуру prompts.json без синхронного обновления с фронтом (если появится).
- **Dependency Injection** — зависимости через контекст приложения/сессии (например, db из get_db, текущий пользователь из get_current_user). Не вводить глобальные синглтоны.
- **docker-compose** — не менять на non-host network без необходимости (в правилах указано не менять network_mode: host, если он есть; в текущем compose его нет, порты проброшены).
- **Секреты** — не коммитить .env, токены, пароли.
- **Код** — явная обработка ошибок, без голых except. Логи без секретов. Для нового кода — docstrings, читаемые имена, типы по ситуации.
- **Фронт** — кнопки, не отправляющие форму, с `type="button"`. TanStack Query v5: invalidateQueries({ queryKey: [...] }). Подтверждения удаления через компонент Confirm с loading.
- **Production:** для cookie-аутентификации задавай `CORS_ORIGINS` явным origin’ом (не `*`) и включай `COOKIE_SECURE=true` на HTTPS. Браузер должен передавать cookie (`withCredentials=true`); в локальной разработке обычно помогает Vite proxy.

---

## 6. Тесты и качество

- **Backend:** pytest, в `backend/tests/` (conftest, test_calc, test_models_and_services, test_api_employees, test_api_projects, test_backup, test_budget_plan, test_import_employees, **test_hourly_rate**, **test_settings_working_hours** и др.). Запуск из корня backend: `pytest`.
- **Линтеры** — не ухудшать состояние (pylint/flake8 и т.п. по проекту). Проект должен собираться и стартовать (docker compose build/up, frontend build).

---

## 7. Документация в репозитории

- **README.md** — быстрый старт, стек, структура, модель данных, сценарии, env, ссылки на docs и CONTEXT.
- **CONTEXT.md** (этот файл) — полный контекст для разработки и AI.
- **docs/WORKFLOW.md** — порядок этапов разработки (Architect → Implementer → Guardian → Tester → Documenter).
- **docs/AGENTS.md** — роли и ссылки на инструкции в docs/agents/.
- **docs/plans/** — планы изменений (YYYY-MM-DD-<slug>.md).

---

## 7.1. Правила расчёта (is_forecast, one_time_bonus)

- **is_forecast:** месяц считается **фактом** только если он полностью в прошлом (строго до текущего месяца). Текущий месяц и будущие — **прогноз** (is_forecast=True). Формула: `(year > today.year) or (year == today.year and month >= today.month)` → forecast.
- **one_time_bonus:** при fallback зарплаты (нет записи за месяц — берётся предыдущая) разовая премия **не переносится** (в расчёте cost за такой месяц one_time_bonus=0).

---

## 8. Краткая шпаргалка по API

- **Auth:** POST /auth/login, POST /auth/logout, GET /auth/me.
- **Employees:** GET/POST /employees, GET/PATCH/DELETE /employees/:id, GET/PUT/DELETE /employees/:id/salary/:year/:month, PUT /employees/:id/salary/batch, POST /employees/import, POST /employees/import/excel, DELETE /employees/all (только при DEBUG_MODE=true).
- **Projects:** GET/POST /projects, GET/PATCH/DELETE /projects/:id, GET /projects/:id/employees?year=, DELETE /projects/:id/employees/:assignmentId.
- **Assignments:** POST /assignments, PATCH/DELETE /assignments/:id, PUT /assignments/:id/rates/:year/:month.
- **Budget projects:** GET/POST /budget-projects, GET/PATCH/DELETE /budget-projects/:id.
- **Budgets:** POST /budgets/recalculate?year=, GET /budgets/overview, GET /budgets/projects/:id, GET /budgets/budget-projects/:id, GET /budgets/last-calculated и др.
- **Dashboard:** GET /dashboard/summary (возвращает `monthly_spend` и **`monthly_plan`** — сумма `BudgetProjectMonthPlan` по месяцам), by-project, by-project-monthly, by-budget-project-monthly, by-department, by-department-monthly, by-specialization, by-specialization-monthly, movements, **hourly-rates**, available-years (все с ?year=).
- **Settings:** GET /settings/working-hours?year= (рабочие часы 12 месяцев), PUT /settings/working-hours?year= (upsert, тело `{items: [{month, hours}×12]}`).
- **Exports:** GET /exports/employees, /exports/projects-budget, /exports/budget-projects, /exports/payroll (все с ?year=, ответ blob).
- **Backup (PostgreSQL):** GET /backup/export (файл `.dump`), POST /backup/restore (multipart `file` + `confirm=true`). UI: **Настройки** `/settings`.

### Локальные бэкапы БД (Docker)
Для бэкапа/восстановления используется встроенный UI в **Настройки** (`/settings`): скачать `.dump` (pg_dump -Fc) и восстановить через него же. Файлы `db_backups/` добавлены в `.gitignore` и не хранятся в репозитории.

Использование: при добавлении фич или отладке смотреть соответствующий роутер в `backend/app/routers/` и вызовы в `frontend/src/api/index.js` и на страницах.
