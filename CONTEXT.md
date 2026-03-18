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
docker compose exec backend alembic upgrade head

cd frontend
npm install
npm run dev
```

- **Frontend:** http://localhost:3000 (Vite проксирует `/api` на backend).
- **Backend:** http://localhost:8000.
- **Swagger:** http://localhost:8000/docs.

Логин: `admin` / `admin123` (меняется в `backend/.env`: `ADMIN_USERNAME`, `ADMIN_PASSWORD`).

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
| `app/models/__init__.py` | Все ORM-модели (User, BudgetProject, Project, Employee, EmployeeProject, AssignmentMonthRate, SalaryRecord, BudgetSnapshot) |
| `app/schemas/` | Pydantic-схемы: auth, employee (в т.ч. SalaryRecordUpsert/Out, EmployeeListItem с monthly_totals, monthly_is_raise), project, assignment (AssignmentMonthRateSet и др.) |
| `app/routers/` | auth, employees, projects, budget_projects, assignments, budgets, dashboard, exports |
| `app/middleware.py` | AccessLogMiddleware (structured access log) |
| `app/types.py` | GUID SQLAlchemy type (PG UUID / SQLite CHAR(36)) |
| `app/utils.py` | escape_like() для LIKE/ILIKE safety |
| `app/services/auth.py` | JWT, bcrypt, get_or_create_admin |
| `app/services/calc.py` | Расчёт: активность в месяце, зарплатный fallback, расход по проекту/месяцу (с учётом assignment_month_rates), пересчёт года, статусы |
| `app/services/dashboard_service.py` | Логика dashboard (роутер тонкий, бизнес-логика отдельно) |
| `app/services/employees_service.py` | Выделенная логика сотрудников (используется роутерами) |
| `app/services/export.py` | Генерация Excel (сотрудники, проекты, бюджетные проекты, ФОТ) |
| `app/services/import_employees.py` | Парсинг Excel импорта сотрудников (заголовки, даты, fallback по столбцам) |
| `migrations/versions/` | Alembic: 0001_initial, 0002_assignment_month_rates, 0003_salary_record_is_raise |

### Frontend (`frontend/src/`)

| Путь | Назначение |
|------|------------|
| `main.jsx` | Роуты (React Router), RequireAuth, QueryClientProvider, Layout как обёртка для авторизованных страниц |
| `api/client.js` | Axios instance `baseURL: '/api'`, `withCredentials=true` (cookie `access_token`), 401 → редирект на /login |
| `api/index.js` | Все вызовы API (auth, employees, salary, projects, assignments, budget-projects, budgets, dashboard, exports) |
| `store/auth.js` | Zustand: флаг `isAuthenticated` (в `sessionStorage`), login/logout |
| `store/year.js` | Zustand: year (выбор года в сайдбаре) |
| `components/layout/Layout.jsx` | Сайдбар: логотип, выбор года, навигация (Дашборд, Сотрудники, Найм, Проекты, Бюджетные проекты, Бюджеты), выход |
| `components/ui/Modal.jsx` | Модальное окно (title, onClose, footer, children) |
| `components/ui/Confirm.jsx` | Подтверждение (message, onConfirm, onCancel, loading), кнопки type="button" |
| `components/EmployeeForm.jsx` | Форма сотрудника/позиции (используется на странице сотрудников и в карточке) |
| `components/AssignmentManager.jsx` | Блок назначений на проекты в карточке сотрудника |
| `pages/LoginPage.jsx` | Форма логина |
| `pages/DashboardPage.jsx` | Дашборд (год из store) |
| `pages/EmployeesPage.jsx` | Список сотрудников, фильтры, создание, импорт (таблица/Excel), экспорт, удаление, «Удалить всех» (отладка) |
| `pages/EmployeeDetailPage.jsx` | Карточка сотрудника: редактирование, назначения, таблица ЗП по месяцам (в т.ч. «Повышение», продлить до декабря) |
| `pages/HiringPage.jsx` | Список позиций (getEmployees с is_position: true) |
| `pages/ProjectsPage.jsx` | Список проектов, создание, удаление (Confirm + deleteProject) |
| `pages/ProjectDetailPage.jsx` | Карточка проекта: участники, ставки по месяцам (12 колонок), предупреждение суммы ставок, редактирование, удаление |
| `pages/BudgetProjectsPage.jsx` | Бюджетные проекты за год, создание, удаление, экспорт |
| `pages/BudgetProjectDetailPage.jsx` | Карточка бюджетного проекта, редактирование, удаление |
| `pages/BudgetsPage.jsx` | Пересчёт, сводка, экспорты (проекты, бюджетные, ФОТ) |
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

- **Backend:** pytest, в `backend/tests/` (conftest, test_calc, test_models_and_services, test_api_employees, test_api_projects и др.). Запуск из корня backend: `pytest`.
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
- **Dashboard:** GET /dashboard/summary, by-project, by-department, by-specialization, movements, available-years.
- **Exports:** GET /exports/employees, /exports/projects-budget, /exports/budget-projects, /exports/payroll (все с ?year=, ответ blob).

Использование: при добавлении фич или отладке смотреть соответствующий роутер в `backend/app/routers/` и вызовы в `frontend/src/api/index.js` и на страницах.
