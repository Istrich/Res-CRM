# Аудит Res-CRM — Вертикальный и горизонтальный

**Дата:** 2026-03-25
**Проект:** Res-CRM (Mini CRM)
**Стек:** FastAPI + SQLAlchemy 2 + PostgreSQL | React 18 + Vite 6 + TanStack Query v5

---

## Методология

**Вертикальный аудит** — сквозной анализ каждого модуля сверху вниз (frontend → API → service → model → DB → тесты), проверка целостности контрактов на каждом слое.

**Горизонтальный аудит** — поперечный анализ по аспектам: безопасность, производительность, отказоустойчивость, кодстайл, тестирование, документация, DX.

---

## ЧАСТЬ 1: ВЕРТИКАЛЬНЫЙ АУДИТ (по модулям)

---

### 1.1 Модуль Auth

| Слой | Состояние | Замечания |
|------|-----------|-----------|
| Frontend (LoginPage, auth store) | ✅ OK | `isAuthenticated` в `sessionStorage` — корректно |
| API (routers/auth.py) | ⚠️ | Rate-limit `5/minute` — хорошо, но нет защиты от credential stuffing по username |
| Service (auth.py) | ⚠️ | `bcrypt` 72-byte truncation обработана, но `python-jose` — deprecated в пользу `PyJWT` |
| Dependencies (dependencies.py) | ✅ OK | Cookie-first + Bearer fallback — чистая реализация |

**Рекомендации:**

```
AUTH-01 [MEDIUM] Заменить python-jose на PyJWT
  Файл: backend/app/services/auth.py, backend/requirements.txt
  Причина: python-jose не поддерживается; PyJWT — стандарт де-факто.
  Действие: pip install PyJWT; заменить `from jose import JWTError, jwt` на `import jwt`
    и `jwt.decode(..., algorithms=[...])` → `jwt.decode(..., algorithms=[...])`
    Исключение: `JWTError` → `jwt.exceptions.InvalidTokenError`

AUTH-02 [LOW] Добавить Logout с инвалидацией на сервере
  Файл: backend/app/routers/auth.py
  Причина: Текущий logout только удаляет cookie. Перехваченный JWT остаётся валидным
    до истечения TTL (480 мин = 8 часов).
  Действие: Рассмотреть token blacklist (Redis/in-memory set) или уменьшить TTL.
    Для single-admin это некритично, но при многопользовательском расширении — обязательно.

AUTH-03 [LOW] SECRET_KEY по умолчанию "change-me-in-production"
  Файл: backend/.env.example
  Причина: Нет валидации минимальной длины/энтропии SECRET_KEY при старте.
  Действие: В config.py или lifespan добавить проверку:
    if len(settings.SECRET_KEY) < 32 or settings.SECRET_KEY == "change-me-in-production":
        logger.warning("INSECURE SECRET_KEY — change it for production!")
```

---

### 1.2 Модуль Employees / Salary

| Слой | Состояние | Замечания |
|------|-----------|-----------|
| Frontend (EmployeesPage, EmployeeDetailPage) | ⚠️ | Большие компоненты (EmployeeDetailPage ~500+ строк) |
| API (routers/employees.py) | ⚠️ | Debug-эндпоинты `/employees/all` и `/debug/seed-salaries` |
| Service (employees_service.py) | ✅ OK | Хорошо выделена логика из роутеров |
| Model (Employee, SalaryRecord) | ✅ OK | CheckConstraint на termination > hire, unique salary per month |
| Тесты | ⚠️ | Нет явного теста на "последний полный месяц = факт" |

**Рекомендации:**

```
EMP-01 [HIGH] Debug-кнопка "Удалить всех" видна на фронте без DEBUG_MODE
  Файл: frontend/src/pages/EmployeesPage.jsx
  Причина: Фронт показывает кнопку удаления всех сотрудников всегда. Backend
    проверяет DEBUG_MODE, но UX вводит в заблуждение — кнопка видна, нажатие даёт 403.
  Действие: Добавить API-вызов или env-переменную для скрытия кнопки.
    Вариант 1: GET /settings/debug-mode → { debug: true/false }, показывать кнопку по ответу.
    Вариант 2: Передать DEBUG_MODE через meta-тег или отдельный endpoint при логине.

EMP-02 [MEDIUM] EmployeeDetailPage — монолитный компонент
  Файл: frontend/src/pages/EmployeeDetailPage.jsx
  Причина: Страница содержит: редактирование, hire-из-позиции, зарплатную таблицу,
    назначения, модалки — всё в одном файле. Сложно поддерживать.
  Действие: Разбить на подкомпоненты:
    - EmployeeHeader (имя, кнопки edit/delete)
    - EmployeeSalaryTable (12-месячная таблица)
    - EmployeeAssignments (назначения) — уже есть AssignmentManager, унифицировать
    - HireFromPositionModal

EMP-03 [MEDIUM] Конфликт кнопок в модалке EmployeeForm
  Файл: frontend/src/components/EmployeeForm.jsx + frontend/src/components/ui/Modal.jsx
  Причина: Modal имеет slot для footer с кнопками, а EmployeeForm содержит собственную
    кнопку submit. При использовании EmployeeForm внутри Modal — двойной набор кнопок.
  Действие: Унифицировать: EmployeeForm передаёт onSubmit вверх, а Modal рендерит кнопки;
    либо EmployeeForm не рендерит свои кнопки когда передан prop `externalButtons`.

EMP-04 [LOW] Redundant useEffect для инициализации формы
  Файл: frontend/src/pages/EmployeeDetailPage.jsx
  Причина: `useEffect(() => { if (emp && !editForm) setEditForm(empToEditForm(emp)) }, [emp])`
    — при каждом обновлении emp повторно проверяет. Можно заменить на useMemo или
    инициализацию при открытии модалки.
  Действие: Инициализировать editForm при setEditModal(true):
    setEditForm(empToEditForm(emp)); setEditModal(true);
```

---

### 1.3 Модуль Projects / Assignments

| Слой | Состояние | Замечания |
|------|-----------|-----------|
| Frontend (ProjectsPage, ProjectDetailPage) | ✅ OK | MembersTable — хороший reusable component |
| API (routers/projects.py, assignments.py) | ✅ OK | BackgroundTasks для пересчёта — правильно |
| Service (calc.py — rate/assignment logic) | ✅ OK | Чёткая логика rate override через AssignmentMonthRate |
| Model | ✅ OK | Constraints на rate > 0, unique assignment per month |

**Рекомендации:**

```
PROJ-01 [LOW] N+1 в calc_project_month_cost
  Файл: backend/app/services/calc.py, функция calc_project_month_cost
  Причина: Для каждого assignment делается `db.get(Employee, asgn.employee_id)` и отдельный
    запрос на AssignmentMonthRate. При большом числе сотрудников на проекте — O(N) запросов.
  Действие: Использовать joinedload для Employee при запросе EmployeeProject, и batch-load
    для AssignmentMonthRate (аналогично batch_employee_month_costs).
    Для <50 сотрудников на проект — некритично, но стоит оптимизировать.

PROJ-02 [LOW] ProjectDetailPage.jsx — editForm init через useEffect
  Файл: frontend/src/pages/ProjectDetailPage.jsx
  Причина: Аналогично EMP-04 — `useEffect(() => { if (project && !editForm) setEditForm(...) }, [project])`
  Действие: Инициализировать при открытии модалки.
```

---

### 1.4 Модуль Budget / BudgetProjects

| Слой | Состояние | Замечания |
|------|-----------|-----------|
| Frontend (BudgetsPage, BudgetProjectDetailPage) | ✅ OK | Помесячный план с "Равномерно" — удобно |
| API (routers/budgets.py, budget_projects.py) | ✅ OK | Recalculate через POST — корректно |
| Service (calc.py — recalculate_year, snapshots) | ⚠️ | Debounce через threading.Lock + dict — работает, но хрупко |
| Model (BudgetSnapshot, BudgetProjectMonthPlan) | ✅ OK | Upsert при recalculate — идемпотентно |

**Рекомендации:**

```
BUD-01 [MEDIUM] Debounce recalculate — не thread-safe в multi-worker
  Файл: backend/app/services/calc.py (глобальные _last_recalc_time, _debounce_lock)
  Причина: При запуске uvicorn с --workers > 1 каждый worker имеет свой _last_recalc_time.
    Debounce не работает между процессами. В текущем деплое (1 worker) — ОК.
  Действие: Документировать ограничение. При масштабировании — вынести в Redis или
    использовать advisory lock PostgreSQL.

BUD-02 [LOW] is_forecast: текущий месяц = forecast
  Файл: backend/app/services/calc.py, recalculate_year
  Причина: Формула `month >= today.month` делает текущий месяц прогнозом.
    Бизнес-правило задокументировано в CONTEXT.md, но нет явного теста, подтверждающего
    что ПОСЛЕДНИЙ ПОЛНОСТЬЮ ЗАВЕРШЁННЫЙ месяц = fact.
  Действие: Добавить тест в test_calc.py:
    @freeze_time("2024-06-15")
    def test_last_completed_month_is_fact(self, ...):
        # May (month 5) should be fact, June (month 6) should be forecast
        ...assert snapshot_may.is_forecast is False
        ...assert snapshot_june.is_forecast is True
```

---

### 1.5 Модуль Staffing

| Слой | Состояние | Замечания |
|------|-----------|-----------|
| Frontend (8 компонентов в pages/staffing/) | ⚠️ | Дублирование fmt/MONTHS в StaffingBudgetsTab |
| API (routers/staffing.py) | ⚠️ | ~600 строк в одном файле, много CRUD |
| Service (staffing_service.py) | ✅ OK | Чёткая логика plan calculation |
| Model (7 таблиц) | ✅ OK | Каскадное удаление, FK constraints |
| Тесты (test_staffing.py) | ✅ OK | Unit + API тесты |

**Рекомендации:**

```
STAFF-01 [MEDIUM] routers/staffing.py — слишком большой файл
  Файл: backend/app/routers/staffing.py (~600+ строк)
  Причина: Содержит CRUD для contractors, staffers, expenses, budgets, invoices, documents.
    Сложно навигировать и поддерживать.
  Действие: Разбить на под-роутеры:
    routers/staffing/__init__.py (монтирует sub-routers)
    routers/staffing/contractors.py
    routers/staffing/staffers.py
    routers/staffing/expenses.py
    routers/staffing/budgets.py

STAFF-02 [LOW] Дублирование утилит во фронте
  Файл: frontend/src/pages/staffing/StaffingBudgetsTab.jsx
  Причина: Локальные функции `fmt()` и `MONTHS` дублируют `src/utils/index.js`.
  Действие: Заменить на import из utils:
    import { fmt, MONTHS } from '../../utils'
```

---

### 1.6 Модуль Dashboard

| Слой | Состояние | Замечания |
|------|-----------|-----------|
| Frontend (DashboardPage + tabs) | ✅ OK | React.lazy для вкладок — хорошо |
| API (routers/dashboard.py) | ✅ OK | Тонкий роутер, логика в service |
| Service (dashboard_service.py) | ⚠️ | Тяжёлые SQL-запросы без пагинации |

**Рекомендации:**

```
DASH-01 [MEDIUM] Dashboard endpoints без кэширования
  Файл: backend/app/services/dashboard_service.py
  Причина: Каждый запрос к /dashboard/summary, by-project-monthly и т.д. делает
    полный обход всех snapshot'ов. При большом количестве проектов — медленно.
  Действие: Добавить staleTime/cacheTime на фронте (уже есть 30s через QueryClient
    defaultOptions — это OK). На бэкенде рассмотреть кэширование через Redis или
    in-memory cache с TTL = время до следующего recalculate.
```

---

### 1.7 Модуль Settings / Backup

| Слой | Состояние | Замечания |
|------|-----------|-----------|
| Frontend (SettingsPage) | ✅ OK | |
| API (backup.py, settings.py) | ✅ OK | Rate limiting на restore — правильно |
| Service (backup.py) | ⚠️ | pg_dump/pg_restore через subprocess |

**Рекомендации:**

```
BACK-01 [MEDIUM] Restore endpoint — potential DoS
  Файл: backend/app/routers/backup.py
  Причина: pg_restore полностью заменяет public schema и вызывает engine.dispose().
    В теории, параллельные запросы во время restore могут получить broken connections.
  Действие: Добавить глобальный lock (или maintenance mode flag) на время restore.
    Документировать: "Восстановление прерывает все активные сессии".
```

---

## ЧАСТЬ 2: ГОРИЗОНТАЛЬНЫЙ АУДИТ (по аспектам)

---

### 2.1 Безопасность

```
SEC-01 [HIGH] CORS_ORIGINS="*" по умолчанию
  Файл: backend/app/config.py, backend/.env.example
  Причина: Дефолт "*" с credentials=false безопасен для dev, но при деплое
    за proxy с cookies — риск CSRF. Документировано, но не enforce-ится.
  Действие: При COOKIE_SECURE=true, добавить валидацию: если CORS_ORIGINS == "*",
    выбросить ошибку или предупреждение при старте.

SEC-02 [MEDIUM] Нет CSRF-защиты
  Файл: backend/app/routers/auth.py
  Причина: HttpOnly cookie + SameSite=Lax защищает от простых CSRF-атак,
    но не от subdomain-атак или complex POST forms. Для single-admin — низкий риск.
  Действие: Для production с несколькими пользователями — добавить CSRF-token
    (double-submit cookie pattern или custom header X-CSRF-Token).

SEC-03 [LOW] Отсутствие security headers
  Файл: backend/app/main.py
  Причина: Нет X-Content-Type-Options, X-Frame-Options, Strict-Transport-Security.
    В Nginx/Caddy proxy обычно добавляются, но при прямом доступе к backend — уязвимость.
  Действие: Добавить middleware или starlette.middleware.trustedhost:
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    При HTTPS: response.headers["Strict-Transport-Security"] = "max-age=31536000"

SEC-04 [LOW] Admin credentials в .env.example
  Файл: backend/.env.example
  Причина: ADMIN_PASSWORD=admin123 — всегда сменить при деплое.
    Нет force-change при первом входе.
  Действие: Документировать обязательную смену. Рассмотреть:
    при первом запуске — генерировать случайный пароль и выводить в лог.
```

---

### 2.2 Производительность

```
PERF-01 [MEDIUM] recalculate_year — полный обход всех проектов × 12 месяцев
  Файл: backend/app/services/calc.py
  Причина: calc_project_month_cost вызывается N×12 раз с отдельными запросами.
    batch_employee_month_costs существует для dashboard, но не используется в recalculate.
  Действие: Рефакторинг recalculate_year:
    1. Загрузить все assignment'ы за год одним запросом
    2. Загрузить все salary records за год
    3. Вычислить в памяти
    Ожидаемый эффект: ~10x ускорение при >50 сотрудников.

PERF-02 [LOW] SQLAlchemy engine без pool_size / max_overflow
  Файл: backend/app/database.py
  Причина: `create_engine(url, pool_pre_ping=True)` — использует дефолтный pool_size=5.
    Для single-admin достаточно, но при нагрузке — может быть мало.
  Действие: Явно задать pool_size=10, max_overflow=20 или документировать текущие дефолты.

PERF-03 [LOW] Frontend — нет lazy loading для staffing pages
  Файл: frontend/src/main.jsx
  Причина: DashboardPage использует React.lazy для вкладок, но staffing pages
    (StaffingPage, StafferDetailPage и т.д.) грузятся eagerly.
  Действие: Обернуть staffing pages в React.lazy + Suspense.
```

---

### 2.3 Отказоустойчивость и обработка ошибок

```
ERR-01 [MEDIUM] Frontend — alert() вместо toast/notification
  Файлы: frontend/src/pages/staffing/*.jsx, ContractorDetailPage.jsx
  Причина: Множество `alert(e.response?.data?.detail || 'Ошибка')` — блокирующий UX.
    Основные CRUD-модули (Employees, Projects) используют inline-ошибки, а Staffing — alert.
  Действие: Заменить alert() на единый toast/notification компонент.
    Варианты: react-hot-toast, sonner, или собственный компонент на CSS.

ERR-02 [MEDIUM] Backend — не все роутеры возвращают структурированные ошибки
  Файл: backend/app/routers/staffing.py
  Причина: Некоторые эндпоинты возвращают `detail` как строку, другие как dict.
    Pydantic v2 validation errors — массив объектов. Фронт обрабатывает оба формата,
    но нет единообразия.
  Действие: Создать стандартный error response schema:
    { "detail": "string message", "errors": [{"field": "...", "message": "..."}] }
    Добавить exception handler в main.py для RequestValidationError.

ERR-03 [LOW] ErrorBoundary — class component
  Файл: frontend/src/components/ErrorBoundary.jsx
  Причина: Работает, но class component. При переходе на React 19+ — не проблема,
    но можно заменить на react-error-boundary (библиотека с retry и fallback props).
  Действие: Не критично. Заменить при рефакторинге.
```

---

### 2.4 Тестирование

```
TEST-01 [HIGH] Нет frontend-тестов
  Файл: frontend/ (отсутствуют test-файлы)
  Причина: Нулевое покрытие фронтенда. Вся проверка — ручной чек-лист.
  Действие: Поэтапно:
    1. Установить Vitest + @testing-library/react
    2. Покрыть утилиты: fmt, fmtDate, statusLabel, statusColor, parseImportTable
    3. Покрыть store: auth.js, year.js (простые Zustand stores)
    4. Покрыть API-layer: mock axios, проверить трансформации
    Цель: >50% покрытие утилит и store за первый заход.

TEST-02 [MEDIUM] Нет теста "последний завершённый месяц = fact"
  Файл: backend/tests/test_calc.py
  Причина: Есть тест на is_forecast для будущих месяцев, но нет явного теста:
    "при freeze_time 15 июня, snapshot за май = is_forecast=False".
  Действие: Добавить в TestRecalculateYear:
    @freeze_time("2024-06-15")
    def test_completed_month_is_fact(self, db, full_setup):
        recalculate_year(db, 2024)
        may = db.query(BudgetSnapshot).filter_by(month=5).first()
        june = db.query(BudgetSnapshot).filter_by(month=6).first()
        assert may.is_forecast is False
        assert june.is_forecast is True

TEST-03 [LOW] test_hourly_rate.py — известная нестабильность
  Файл: backend/tests/test_hourly_rate.py
  Причина: Документировано: test_list_without_working_hours_gives_none_rates
    может падать из-за расхождения API-контракта.
  Действие: Исправить тест или API, зафиксировать контракт.
```

---

### 2.5 Кодстайл и архитектура

```
ARCH-01 [MEDIUM] Все модели в одном файле models/__init__.py
  Файл: backend/app/models/__init__.py
  Причина: 15+ классов (User, BudgetProject, BudgetProjectMonthPlan, Project,
    ProjectMonthPlan, Employee, EmployeeProject, AssignmentMonthRate, SalaryRecord,
    BudgetSnapshot, WorkingHoursYearMonth, + 7 staffing моделей) — файл >500 строк.
  Действие: Разбить на модули:
    models/__init__.py (re-export)
    models/user.py
    models/budget.py (BudgetProject, BudgetProjectMonthPlan, BudgetSnapshot)
    models/project.py (Project, ProjectMonthPlan)
    models/employee.py (Employee, EmployeeProject, AssignmentMonthRate, SalaryRecord)
    models/staffing.py (Contractor, Staffer, StaffingBudget, StaffingExpense, etc.)
    models/settings.py (WorkingHoursYearMonth)

ARCH-02 [LOW] Frontend — отсутствие TypeScript
  Файл: frontend/src/**/*.jsx
  Причина: Все компоненты на JS без типизации. При текущем размере (~20 файлов) — OK,
    но при росте — источник трудноотлавливаемых багов.
  Действие: Не блокирующее. При расширении команды — мигрировать на TypeScript.
    Начать с api/index.ts (типы запросов/ответов) и store/.

ARCH-03 [LOW] Нет общего error-handling layer на фронте
  Файл: frontend/src/api/client.js
  Причина: Axios interceptor ловит 401 → redirect, но остальные ошибки обрабатываются
    ad-hoc в каждом компоненте (onError в useMutation).
  Действие: Добавить QueryClient onError default handler для автоматического
    отображения toast при сетевых ошибках.
```

---

### 2.6 DevOps и инфраструктура

```
DEVOPS-01 [MEDIUM] Нет health check для frontend контейнера
  Файл: docker-compose.yml
  Причина: Backend имеет GET /health с DB ping. Frontend (nginx) не имеет health check.
  Действие: Добавить healthcheck в docker-compose для frontend-сервиса:
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:80/"]
      interval: 30s
      timeout: 5s

DEVOPS-02 [MEDIUM] CI не запускает flake8 с --max-line-length=120 строго
  Файл: .github/workflows/ci.yml
  Причина: flake8 ignore: E501,W503,E203. E501 — line length. Это значит длинные строки
    не ловятся. Документировано, но стоит быть явным.
  Действие: Либо убрать E501 из ignore и установить max-line-length=120 строго,
    либо добавить .flake8 / setup.cfg с единой конфигурацией.

DEVOPS-03 [LOW] Нет multi-stage Docker build для backend
  Файл: backend/Dockerfile (если существует)
  Причина: При --build каждый раз переустанавливаются зависимости.
  Действие: Использовать multi-stage build с кэшированием слоя requirements:
    COPY requirements.txt .
    RUN pip install -r requirements.txt
    COPY . .

DEVOPS-04 [LOW] Нет .dockerignore
  Файл: корень проекта
  Причина: Без .dockerignore в контекст билда попадают .git, node_modules, venv и т.д.
  Действие: Создать .dockerignore:
    .git
    __pycache__
    *.pyc
    htmlcov
    .pytest_cache
    node_modules
    frontend/dist
```

---

### 2.7 Документация

```
DOC-01 [LOW] CONTEXT.md — "7 tables" в agent-файлах, реально 15+
  Файл: .claude/agents/backend-developer.md
  Причина: Написано "all 7 tables in one file" — устарело после staffing module (ещё +7).
  Действие: Обновить число и список таблиц в agent-файлах.

DOC-02 [LOW] docker-compose.yml — нет описания profile full
  Файл: docker-compose.yml
  Причина: Профиль full для frontend описан в README, но не прокомментирован
    в самом docker-compose.yml.
  Действие: Добавить комментарий перед frontend-сервисом:
    # Profile "full": собранный frontend в nginx на :3000
```

---

## ЧАСТЬ 3: СВОДНАЯ ТАБЛИЦА РЕКОМЕНДАЦИЙ

| ID | Приоритет | Категория | Краткое описание | Файл(ы) |
|----|-----------|-----------|------------------|---------|
| EMP-01 | 🔴 HIGH | UX/Security | Debug-кнопка видна без DEBUG_MODE | EmployeesPage.jsx |
| SEC-01 | 🔴 HIGH | Security | CORS="*" + COOKIE_SECURE=true → предупреждение | config.py, main.py |
| TEST-01 | 🔴 HIGH | Testing | Нулевое покрытие frontend-тестами | frontend/ |
| AUTH-01 | 🟡 MEDIUM | Deps | python-jose → PyJWT | auth.py, requirements.txt |
| EMP-02 | 🟡 MEDIUM | Architecture | EmployeeDetailPage — монолитный | EmployeeDetailPage.jsx |
| EMP-03 | 🟡 MEDIUM | UX | Конфликт кнопок Modal + EmployeeForm | EmployeeForm.jsx, Modal.jsx |
| BUD-01 | 🟡 MEDIUM | Concurrency | Debounce не работает multi-worker | calc.py |
| STAFF-01 | 🟡 MEDIUM | Architecture | staffing.py ~600 строк → разбить | routers/staffing.py |
| PERF-01 | 🟡 MEDIUM | Performance | recalculate_year — batch optimization | calc.py |
| ERR-01 | 🟡 MEDIUM | UX | alert() → toast в Staffing | staffing/*.jsx |
| ERR-02 | 🟡 MEDIUM | API | Единый формат ошибок | main.py, routers/ |
| ARCH-01 | 🟡 MEDIUM | Architecture | models/__init__.py — split | models/__init__.py |
| DEVOPS-01 | 🟡 MEDIUM | DevOps | Health check для frontend | docker-compose.yml |
| DEVOPS-02 | 🟡 MEDIUM | DevOps | flake8 конфигурация | ci.yml |
| TEST-02 | 🟡 MEDIUM | Testing | Тест на fact vs forecast boundary | test_calc.py |
| SEC-02 | 🟡 MEDIUM | Security | CSRF-защита для production | auth.py |
| DASH-01 | 🟡 MEDIUM | Performance | Dashboard — кэширование | dashboard_service.py |
| BACK-01 | 🟡 MEDIUM | Reliability | Restore — global lock | backup.py |
| AUTH-02 | 🟢 LOW | Security | JWT blacklist при logout | auth.py |
| AUTH-03 | 🟢 LOW | Security | Валидация SECRET_KEY при старте | config.py |
| SEC-03 | 🟢 LOW | Security | Security headers | main.py |
| SEC-04 | 🟢 LOW | Security | Force-change admin password | auth.py |
| EMP-04 | 🟢 LOW | Code quality | useEffect → init при открытии модалки | EmployeeDetailPage.jsx |
| PROJ-01 | 🟢 LOW | Performance | N+1 в calc_project_month_cost | calc.py |
| PROJ-02 | 🟢 LOW | Code quality | editForm init useEffect | ProjectDetailPage.jsx |
| BUD-02 | 🟢 LOW | Testing | Тест на is_forecast boundary | test_calc.py |
| STAFF-02 | 🟢 LOW | Code quality | Дублирование fmt/MONTHS | StaffingBudgetsTab.jsx |
| PERF-02 | 🟢 LOW | Performance | pool_size для SQLAlchemy | database.py |
| PERF-03 | 🟢 LOW | Performance | Lazy load staffing pages | main.jsx |
| ERR-03 | 🟢 LOW | Code quality | ErrorBoundary → библиотека | ErrorBoundary.jsx |
| ARCH-02 | 🟢 LOW | Architecture | TypeScript migration | frontend/ |
| ARCH-03 | 🟢 LOW | Architecture | Global error handler frontend | client.js |
| TEST-03 | 🟢 LOW | Testing | Flaky test_hourly_rate | test_hourly_rate.py |
| DEVOPS-03 | 🟢 LOW | DevOps | Multi-stage Docker build | Dockerfile |
| DEVOPS-04 | 🟢 LOW | DevOps | .dockerignore | корень |
| DOC-01 | 🟢 LOW | Docs | "7 tables" → актуальное число | agent-файлы |
| DOC-02 | 🟢 LOW | Docs | Комментарий к profile full | docker-compose.yml |

---

## ЧАСТЬ 4: РЕКОМЕНДУЕМЫЙ ПОРЯДОК ИСПРАВЛЕНИЙ

### Спринт 1 — Critical / Quick wins (1–2 дня)

1. **EMP-01** — скрыть debug-кнопку (5 мин фронт)
2. **SEC-01** — предупреждение при CORS="*" + COOKIE_SECURE (10 мин backend)
3. **TEST-02 + BUD-02** — добавить 2 теста is_forecast boundary (15 мин)
4. **STAFF-02** — убрать дублирование fmt/MONTHS (5 мин)
5. **EMP-04 + PROJ-02** — убрать redundant useEffect (10 мин)
6. **DEVOPS-04** — создать .dockerignore (5 мин)
7. **DOC-01** — обновить число таблиц в agent-файлах (5 мин)

### Спринт 2 — Medium improvements (3–5 дней)

1. **AUTH-01** — python-jose → PyJWT
2. **EMP-03** — унифицировать кнопки Modal/EmployeeForm
3. **ERR-01** — toast-компонент вместо alert() в staffing
4. **ERR-02** — единый error response format + exception handler
5. **ARCH-01** — split models/__init__.py
6. **STAFF-01** — split routers/staffing.py

### Спринт 3 — Performance & testing (следующая итерация)

1. **TEST-01** — bootstrap Vitest + первые frontend-тесты
2. **PERF-01** — batch optimization для recalculate_year
3. **DASH-01** — server-side caching для dashboard
4. **DEVOPS-01 + DEVOPS-02** — health check + flake8 config

### Backlog

- SEC-02 (CSRF), SEC-03 (security headers), AUTH-02 (JWT blacklist)
- ARCH-02 (TypeScript), PERF-02, PERF-03
- BACK-01 (restore lock), DEVOPS-03 (multi-stage build)

---

## Общая оценка

Проект **хорошо структурирован** для своего масштаба. Основные достоинства:

- Чёткая документация (CONTEXT.md, WORKFLOW.md, agent-файлы) — редкость для проекта такого размера
- Правильная архитектура auth (HttpOnly cookie + Bearer fallback)
- Идемпотентный recalculate с snapshot-кэшем
- Хорошее тестовое покрытие backend (~85%)
- Продуманная CI/CD пайплайн

Основные зоны для улучшения:
- Frontend-тестирование (нулевое покрытие)
- Рост размера отдельных файлов (models, staffing router, detail pages)
- Production-hardening (security headers, CSRF, CORS enforcement)
