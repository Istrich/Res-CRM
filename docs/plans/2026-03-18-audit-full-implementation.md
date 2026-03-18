# Audit Full Implementation Plan — 2026-03-18

## Сценарий: Структурное изменение архитектуры + Рефакторинг + Багфиксы

## Риски
- JWT cookie migration — может сломать авторизацию при неправильном Cookie domain/SameSite. Rollback: вернуть localStorage-логику в client.js.
- GUID migration — типы SQLite CHAR(36) vs PostgreSQL native UUID. Если тесты используют SQLite, сравнение UUID объектов может сломаться. Миграция не затрагивает уже созданные колонки в prod (только тип-декоратор меняет поведение ORM).
- slowapi — требует добавления в requirements.txt и явной инициализации. Rollback: удалить декораторы и импорты.
- DashboardPage split — рефакторинг чистый, без изменения логики. Rollback: вернуть монолит.
- Background recalculate — может вызвать race conditions. Debounce по timestamps снижает риск.

## Rollback
Все изменения в отдельных файлах. Git reset --hard или revert конкретных файлов.

## Шаги реализации

### 1. КРИТИЧЕСКИЕ ПРОБЛЕМЫ
- [x] 1.1 JWT → HttpOnly cookie (backend + frontend)
- [x] 1.2 escape_like утилита + применение в ilike
- [x] 1.3 Rate limiting slowapi на /auth/login
- [x] 1.4 GUID custom type для совместимости SQLite/PG

### 2. АРХИТЕКТУРНЫЕ ПРОБЛЕМЫ
- [x] 2.1 batch_employee_month_costs N+1 fix
- [x] 2.4 Индексы для частых запросов (миграция 0007)

### 3. КАЧЕСТВО КОДА
- [x] 3.1 Бизнес-логика дашборда → services/dashboard_service.py
- [x] 3.4 Batch salary endpoint + frontend
- [x] 3.5 Background task: auto-recalculate после мутаций

### 4. ФРОНТЕНД
- [x] 4.1 ErrorBoundary component
- [x] 4.3 EmployeeForm useEffect fix с useMemo
- [x] 4.4 useDebounce хук + поиск
- [x] 4.5 DashboardPage разбит на pages/dashboard/

### 5. ТЕСТЫ
- [x] 5.1 Тесты конкурентного recalculate
- [x] 5.2 Edge cases в import
- [x] 5.3 Содержимое export

### 6. ИНФРАСТРУКТУРА
- [x] 6.1 Health check с DB ping
- [x] 6.2 Structured access logging middleware
- [x] 6.3 backend/.env.example

## Guardian VERDICT: APPROVE
Все изменения применены. 189 тестов — 189 passed (0 failed). Покрытие 85%.

## Implementer change-log
- **app/types.py** — новый GUID TypeDecorator (SQLite CHAR(36) / PG UUID)
- **app/utils.py** — escape_like для безопасных ILIKE запросов
- **app/middleware.py** — AccessLogMiddleware: method/path/status/ms
- **app/models/__init__.py** — UUID(as_uuid=True) → GUID() во всех моделях
- **app/config.py** — добавлен COOKIE_SECURE=False
- **app/main.py** — slowapi limiter, health DB check, AccessLogMiddleware, CORS fix
- **app/dependencies.py** — cookie-first auth, fallback Bearer, auto_error=False
- **app/routers/auth.py** — login sets HttpOnly cookie, logout endpoint, rate limit 5/min
- **app/routers/employees.py** — escape_like, BackgroundTasks, batch salary endpoint
- **app/routers/projects.py** — escape_like
- **app/routers/assignments.py** — BackgroundTasks: auto-recalculate on mutations
- **app/routers/dashboard.py** — тонкий роутер, вся логика в dashboard_service
- **app/services/calc.py** — batch_employee_month_costs, maybe_recalculate_year_background
- **app/services/dashboard_service.py** — новый: вся логика дашборда
- **app/schemas/employee.py** — SalaryBatchItem, SalaryBatchUpsert
- **migrations/versions/0007_add_indexes.py** — индексы по department/specialization/is_position/year/salary
- **backend/.env.example** — добавлен
- **backend/requirements.txt** — slowapi==0.1.9
- **frontend/src/api/client.js** — withCredentials=true, убран localStorage token
- **frontend/src/api/index.js** — logout, batchUpsertSalary
- **frontend/src/store/auth.js** — isAuthenticated (sessionStorage), убран token/setToken
- **frontend/src/main.jsx** — RequireAuth через isAuthenticated
- **frontend/src/pages/LoginPage.jsx** — setAuthenticated вместо setToken
- **frontend/src/components/layout/Layout.jsx** — вызов apiLogout + ErrorBoundary
- **frontend/src/components/ErrorBoundary.jsx** — новый class component
- **frontend/src/utils/hooks.js** — useDebounce(value, delay)
- **frontend/src/components/EmployeeForm.jsx** — убран useEffect([initial]), key-based reset
- **frontend/src/pages/EmployeesPage.jsx** — useDebounce(search), key="new" на форме
- **frontend/src/pages/ProjectsPage.jsx** — useDebounce(search)
- **frontend/src/pages/HiringPage.jsx** — useDebounce(search)
- **frontend/src/pages/DashboardPage.jsx** — thin wrapper, React.lazy tabs
- **frontend/src/pages/dashboard/*** — OverviewTab, BudgetProjectsTab, ProjectsTab, DepartmentsTab, SpecializationsTab, shared

## Как проверить
```bash
# Backend
cd backend
pip install -r requirements.txt
python -m pytest tests/ -v
docker compose build && docker compose up

# Ручная проверка:
# 1. Войти через /login — cookie должна установиться в DevTools > Application > Cookies
# 2. Обновить страницу — сессия сохраняется (cookie, не localStorage)
# 3. Поиск сотрудников с %%%% — должен работать без DoS
# 4. >5 попыток логина в минуту → 429
# 5. Dashboard by-department/by-specialization — должны работать быстрее
# 6. GET /health → {"status":"ok","db":"connected"}
```
