# Mini CRM (Res-CRM)

Веб-приложение для учёта сотрудников, проектов и бюджетов: карточки сотрудников и позиций, привязка к проектам со ставками по месяцам, вознаграждение (оклад + премии), расчёт расходов по проектам и бюджетный контроль.

## Быстрый старт

### 1. База данных и backend

```bash
cd Res-CRM
docker compose up -d

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

## Стек

| Часть     | Технологии |
|----------|------------|
| Backend  | Python 3.11, FastAPI, SQLAlchemy 2, Pydantic, Alembic, PostgreSQL |
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
│   │   ├── dependencies.py   # get_current_user (JWT)
│   │   ├── models/           # ORM: User, BudgetProject, Project, Employee, EmployeeProject, AssignmentMonthRate, SalaryRecord, BudgetSnapshot
│   │   ├── schemas/          # Pydantic (employee, project, assignment, auth)
│   │   ├── routers/          # auth, employees, projects, budget_projects, assignments, budgets, dashboard, exports
│   │   └── services/         # auth.py, calc.py, export.py, import_employees.py
│   ├── migrations/           # Alembic (0001_initial, 0002_assignment_month_rates, 0003_salary_record_is_raise)
│   ├── requirements.txt
│   └── .env                  # DATABASE_URL, SECRET_KEY, ADMIN_*
│
├── frontend/
│   └── src/
│       ├── api/              # client.js (axios, /api, JWT), index.js (все вызовы API)
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
- **Бюджетные проекты:** список за год, карточка, привязка проектов.
- **Бюджеты:** пересчёт, сводка, экспорты (проекты, бюджетные, ФОТ).
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
```

---

## Документация и воркфлоу

- **Воркфлоу и агенты:** [docs/WORKFLOW.md](docs/WORKFLOW.md), [docs/AGENTS.md](docs/AGENTS.md).
- **Планы изменений:** `docs/plans/YYYY-MM-DD-<slug>.md`.
- **Полный контекст для разработки и AI:** [CONTEXT.md](CONTEXT.md).
