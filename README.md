# Mini CRM (Res-CRM)

Веб-приложение для учёта сотрудников, проектов и бюджетов: карточки сотрудников и позиций, привязка к проектам со ставками по месяцам, вознаграждение (оклад + премии), расчёт расходов по проектам и бюджетный контроль.

## Быстрый старт

### 1. База данных и backend

```bash
cd Res-CRM
docker compose up -d

# Важно: docker compose использует `backend/.env`
# Если его нет — скопируй `backend/.env.example` -> `backend/.env` и поправь значения под себя

# Миграции (один раз или после изменений схемы)
docker compose exec backend alembic upgrade head
```

Backend: **http://localhost:8000**  
Swagger: **http://localhost:8000/docs**

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Приложение: **http://localhost:3000**  
Запросы к API идут через Vite proxy: `/api/*` → `http://localhost:8000/*`.

**Логин по умолчанию:** `admin` / `admin123`  
Изменить в `backend/.env`: `ADMIN_USERNAME`, `ADMIN_PASSWORD`.

---

## Авторизация и безопасность

- `POST /auth/login`:
  - проверяет логин/пароль,
  - создаёт JWT и сохраняет его в `HttpOnly` cookie `access_token`
  - cookie получает `SameSite=Lax`, а флаг `Secure` управляется настройкой `COOKIE_SECURE`.
- `POST /auth/logout` удаляет cookie `access_token`.
- `get_current_user` сначала пытается прочитать JWT из cookie, затем (опционально) из заголовка `Authorization: Bearer ...` для API-клиентов.
- Rate limiting: `POST /auth/login` ограничен до `5/minute` на IP (при превышении возвращается `429 Too Many Requests`).
- `GET /health` делает запрос в БД (`SELECT 1`) и возвращает `503`, если БД недоступна.

Для cookie-аутентификации из другого origin’а важно, чтобы `CORS_ORIGINS` в backend был задан явным origin (не `*`) и чтобы браузер передавал cookie (`withCredentials=true` в axios). В локальной разработке это обычно обходится Vite proxy (одно origin).

---

## Стек

| Часть     | Технологии |
|----------|------------|
| Backend  | Python 3.11, FastAPI, SQLAlchemy 2, Pydantic, Alembic, PostgreSQL, slowapi |
| Frontend | React 18, Vite 6, React Router 6, TanStack Query v5, Zustand, Axios |
| Инфра    | Docker Compose (PostgreSQL 16 + backend) |

---

## Структура проекта

```
Res-CRM/
├── backend/
│   ├── app/
│   │   ├── main.py           # FastAPI app, CORS, lifespan, роутеры
│   │   ├── config.py         # pydantic-settings
│   │   ├── database.py       # SQLAlchemy engine, SessionLocal
│   │   ├── dependencies.py   # get_current_user (JWT из cookie + Bearer fallback)
│   │   ├── middleware.py      # AccessLogMiddleware (structured access log)
│   │   ├── types.py           # GUID SQLAlchemy type (PG UUID / SQLite CHAR(36))
│   │   ├── utils.py           # escape_like() for LIKE/ILIKE safety
│   │   ├── models/           # ORM: User, BudgetProject, BudgetProjectMonthPlan, Project, Employee, EmployeeProject, AssignmentMonthRate, SalaryRecord, BudgetSnapshot
│   │   ├── schemas/          # Pydantic (employee, project, assignment, auth)
│   │   ├── routers/          # auth, employees, projects, budget_projects, assignments, budgets, dashboard, exports
│   │   └── services/         # auth.py, calc.py, dashboard_service.py, employees_service.py, budget_plan.py, export.py, import_employees.py
│   ├── migrations/           # Alembic (0001..0005_budget_project_month_plans)
│   ├── requirements.txt
│   └── .env                  # DATABASE_URL, SECRET_KEY, ADMIN_*
│
├── frontend/
│   └── src/
│       ├── api/              # client.js (axios, /api, withCredentials cookie `access_token`), index.js (все вызовы API)
│       ├── components/        # Layout, Modal, Confirm, EmployeeForm, AssignmentManager
│       ├── pages/             # Login, Dashboard, Employees, EmployeeDetail, Hiring, Projects, ProjectDetail, BudgetProjects, BudgetProjectDetail, Budgets
│       ├── store/             # auth.js, year.js (Zustand)
│       └── utils/             # fmt, fmtDate, MONTHS, statusLabel, statusColor, downloadBlob
│
├── docs/                      # WORKFLOW.md, AGENTS.md, agents/, plans/
├── docker-compose.yml
├── README.md
└── CONTEXT.md                 # Полный контекст для Cursor/IDE
```

---

## Модель данных

| Таблица | Назначение |
|--------|------------|
| `users` | Один администратор, JWT |
| `budget_projects` | Бюджетный проект (год, общий бюджет) |
| `projects` | Рабочий проект, FK → budget_projects (SET NULL при удалении) |
| `employees` | Сотрудники и позиции (`is_position`) |
| `employee_projects` | Назначение на проект: ставка, valid_from/valid_to |
| `assignment_month_rates` | Переопределение ставки по месяцам (assignment_id, year, month, rate) |
| `salary_records` | Вознаграждение по месяцам: salary, kpi_bonus, fixed_bonus, one_time_bonus, is_raise |
| `budget_snapshots` | Кэш расхода по проекту/месяцу (amount, is_forecast) |
| `project_month_plans` | Собственный помесячный план проекта (project_id, year, month, amount) |
| `budget_project_month_plans` | Помесячный план бюджета (budget_project_id, year, month, amount) |

---

## Бизнес-правила (расчёт)

- **Активность в месяце:** учёт hire_date и termination_date (увольнение с 1-го = не работал в том месяце).
- **Стоимость сотрудника в месяце:** сумма salary + kpi_bonus + fixed_bonus + one_time_bonus (fallback по последней записи за год/прошлые годы).
- **Ставка в месяце:** из `assignment_month_rates` при наличии, иначе `employee_projects.rate`.
- **Расход проекта в месяц:** сумма по всем назначениям (активным в месяце): `monthly_cost × rate`.
- **Прогноз:** факт за прошлые месяцы + расчёт по текущим ставкам/зарплатам на будущие.
- **Статусы бюджета:** ok / warning (>90% бюджета) / overrun.

---

## Основные сценарии в UI

- **Сотрудники:** список с фильтрами, карточка, ЗП по месяцам (в т.ч. «Повышение» — зелёная подсветка), назначения на проекты, импорт (вставка таблицы / Excel), экспорт, временная кнопка «Удалить всех».
- **Найм:** вкладка со списком только позиций (`is_position=true`).
- **Проекты:** список, карточка проекта, участники, ставки по месяцам (12 колонок), предупреждение при сумме ставок ≠ 1.
- **Бюджетные проекты:** список за год, карточка, привязка проектов, **помесячный план** (12 полей, «Равномерно», «Сохранить план»), таблица план vs факт по месяцам.
- **Бюджеты:** пересчёт, сводка, экспорты (проекты, бюджетные, ФОТ).
- **Проект (карточка):** расходы по месяцам с планом и отклонением (если проект входит в бюджетный проект с помесячным планом).
- **Дашборд:** сводки по году, по проектам, подразделениям, специализациям, движение персонала.

---

## Переменные окружения (backend/.env)

```env
DATABASE_URL=postgresql://minicrm:minicrm_secret@db:5432/minicrm
SECRET_KEY=change-me-in-production
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=480
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123

# Ограничение origin для CORS при использовании cookies (в production не оставляй '*')
CORS_ORIGINS=*

# Secure для cookie: выключи для локального HTTP, включи для HTTPS
COOKIE_SECURE=false

# Опционально
DEBUG_MODE=false
```

---

## Документация и воркфлоу

- **Воркфлоу и агенты:** [docs/WORKFLOW.md](docs/WORKFLOW.md), [docs/AGENTS.md](docs/AGENTS.md).
- **Планы изменений:** `docs/plans/YYYY-MM-DD-<slug>.md`.
- **Полный контекст для разработки и AI:** [CONTEXT.md](CONTEXT.md).
