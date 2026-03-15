# Mini CRM

Веб-приложение для учёта сотрудников, проектов и бюджетов.

## Быстрый старт

### 1. Запустить базу данных и backend

```bash
cd mini-crm
docker compose up -d

# Применить миграции
docker compose exec backend alembic upgrade head
```

### 2. Запустить frontend

```bash
cd frontend
npm install
npm run dev
```

Приложение доступно на **http://localhost:3000**

Логин по умолчанию: `admin` / `admin123`  
Изменить в `backend/.env` → `ADMIN_USERNAME`, `ADMIN_PASSWORD`

---

## Архитектура

```
mini-crm/
├── backend/                   # FastAPI + PostgreSQL
│   ├── app/
│   │   ├── main.py            # Точка входа, CORS, lifespan
│   │   ├── config.py          # Настройки через pydantic-settings
│   │   ├── database.py        # SQLAlchemy engine + session
│   │   ├── dependencies.py    # JWT auth dependency
│   │   ├── models/            # SQLAlchemy ORM (7 таблиц)
│   │   ├── schemas/           # Pydantic in/out схемы
│   │   ├── routers/           # FastAPI роутеры (8 модулей)
│   │   └── services/
│   │       ├── auth.py        # JWT, bcrypt
│   │       ├── calc.py        # Движок расчётов бюджетов
│   │       └── export.py      # Excel выгрузки (openpyxl)
│   └── migrations/            # Alembic миграции
│
├── frontend/                  # React + Vite
│   └── src/
│       ├── api/               # Axios client + все API функции
│       ├── components/        # Layout, Modal, Confirm, формы
│       ├── pages/             # 9 страниц
│       ├── store/             # Zustand (auth, year)
│       └── utils/             # fmt, fmtDate, downloadBlob, MONTHS
│
└── docker-compose.yml         # PostgreSQL + backend
```

---

## Модель данных

| Таблица | Назначение |
|---|---|
| `users` | Один администратор (JWT auth) |
| `budget_projects` | Финансовая сущность верхнего уровня |
| `projects` | Рабочие проекты, FK → budget_projects |
| `employees` | Сотрудники и позиции (флаг `is_position`) |
| `employee_projects` | Привязка к проекту: ставка, период |
| `salary_records` | Вознаграждение по месяцам (4 компонента) |
| `budget_snapshots` | Кэш расчётов по проектам |

---

## Бизнес-правила

**Активность сотрудника в месяце:**
- `hire_date > конец месяца` → не активен
- `termination_date <= первый день месяца` → не активен (уволен 1-го = не работал)
- Иначе → активен, расход считается за полный месяц

**Расчёт расхода:**
```
monthly_cost = salary + kpi_bonus + fixed_bonus + one_time_bonus
project_cost = monthly_cost × rate
```

**Зарплатный fallback:** если на месяц нет записи — берётся последняя из того же года, затем из предыдущих лет.

**Ставки:** сумма ставок может быть > 1.0 (явное допущение). При < 1.0 — предупреждение в UI.

**Прогноз:** факт (прошлые месяцы) + план (будущие месяцы по текущим ставкам).

**Статусы бюджета:**
- `ok` — прогноз ≤ бюджет
- `warning` — прогноз > 90% бюджета
- `overrun` — прогноз > бюджет

---

## API

Документация доступна на **http://localhost:8000/docs** (Swagger UI).

Базовые эндпоинты:

```
POST   /auth/login                   Авторизация
GET    /auth/me                      Текущий пользователь

GET    /employees                    Список сотрудников/позиций
POST   /employees                    Создать
GET    /employees/{id}               Карточка
PATCH  /employees/{id}               Обновить
DELETE /employees/{id}               Удалить
PUT    /employees/{id}/salary/{y}/{m} Зарплата за месяц

GET    /projects                     Список проектов
POST   /projects                     Создать
GET    /projects/{id}                Карточка
PATCH  /projects/{id}                Обновить
GET    /projects/{id}/employees      Участники
DELETE /projects/{id}/employees/{aid} Убрать из проекта

GET    /budget-projects              Бюджетные проекты
POST   /budget-projects              Создать

POST   /assignments                  Привязать к проекту
PATCH  /assignments/{id}             Изменить ставку/период
DELETE /assignments/{id}             Удалить привязку

POST   /budgets/recalculate?year=    Пересчитать все бюджеты
GET    /budgets/overview?year=       Сводка по всем проектам
GET    /budgets/projects/{id}?year=  Бюджет проекта

GET    /dashboard/summary?year=      KPI-метрики
GET    /dashboard/by-project?year=   По проектам
GET    /dashboard/by-department?year= По подразделениям
GET    /dashboard/movements?year=    Движение персонала

GET    /exports/employees?year=      → .xlsx
GET    /exports/payroll?year=        → .xlsx
GET    /exports/projects-budget?year= → .xlsx
GET    /exports/budget-projects?year= → .xlsx
```

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

## Excel выгрузки

Доступны со страниц:
- **Сотрудники** → список с ЗП по месяцам
- **Бюджеты** → кнопки «⬇ Проекты», «⬇ Бюджетные», «⬇ ФОТ»

ФОТ-выгрузка содержит два листа: сводный и детализированный (по каждому компоненту вознаграждения).

---

## Workflow и агенты

Для разработки задан обязательный воркфлоу и набор ролей (агентов):

- **Воркфлоу:** [docs/WORKFLOW.md](docs/WORKFLOW.md) — порядок этапов (Architect → Implementer → Tester → Guardian → Documenter), обязательное создание тестов на все изменения поведения.
- **Агенты:** [docs/AGENTS.md](docs/AGENTS.md) — список ролей и ссылки на детальные инструкции в `docs/agents/` и `.claude/agents/`.

Планы изменений: `docs/plans/YYYY-MM-DD-<slug>.md`.

---

## Расширение системы

**Импорт из Excel** — следующий этап. Endpoint: `POST /imports/employees/preview` + `/commit`.

**Мультипользовательский режим** — добавить таблицу ролей и `role` поле в `users`. Зависимость `get_current_user` уже изолирована в `dependencies.py`.

**Партиционирование** — если данных > 1M строк, добавить партиционирование `salary_records` и `budget_snapshots` по `year` в новой миграции.
