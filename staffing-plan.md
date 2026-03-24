# План: Модуль «Стаффинг» (Staffing)

**Дата:** 2026-03-20  
**Тип:** Новая функция (крупная)  
**Цепочка:** Architect → Implementer → Tester → Guardian → Documenter

---

## 1. Цель

Добавить полноценный модуль стаффинга — учёт внешних подрядчиков (стафферов), их расходов, бюджетов на стаффинг и управление подрядчиками. Новая вкладка «Стаффинг» в боковом меню с четырьмя подвкладками.

---

## 2. Структура UI

```
Стаффинг (новый пункт в сайдбаре)
  ├── Стафферы        — список, создание, карточка
  ├── Расходы          — помесячная таблица план/факт (деньги + часы), загрузка счетов PDF
  ├── Бюджеты          — CRUD бюджетов на стаффинг, план/факт/дельта
  └── Подрядчики       — список, создание, прикрепление договоров
```

---

## 3. Модель данных (новые таблицы)

### 3.1. `contractors` — Подрядчики

| Колонка | Тип | Описание |
|---------|-----|----------|
| id | UUID PK | |
| name | String(255) NOT NULL | Название компании |
| created_at | DateTime | |
| updated_at | DateTime | |

### 3.2. `contractor_documents` — Файлы договоров подрядчика

| Колонка | Тип | Описание |
|---------|-----|----------|
| id | UUID PK | |
| contractor_id | UUID FK → contractors.id CASCADE | |
| filename | String(500) NOT NULL | Оригинальное имя файла |
| stored_path | String(1000) NOT NULL | Путь на диске / object storage |
| content_type | String(100) | MIME-тип (application/pdf, docx...) |
| uploaded_at | DateTime | |

### 3.3. `staffers` — Стафферы (внешние специалисты)

| Колонка | Тип | Описание |
|---------|-----|----------|
| id | UUID PK | |
| first_name | String(100) | |
| last_name | String(100) | |
| middle_name | String(100) | |
| contractor_id | UUID FK → contractors.id SET NULL | Подрядчик |
| project_id | UUID FK → projects.id SET NULL | Проект |
| specialization | String(255) | Специализация |
| hourly_rate | Numeric(15,2) NOT NULL | Часовая ставка (₽/ч) |
| valid_from | Date NOT NULL | Дата начала привлечения |
| valid_to | Date | Дата окончания (до какого числа) |
| pm_name | String(255) | ПМ (текстовое поле, для отображения) |
| comment | Text | |
| created_at | DateTime | |
| updated_at | DateTime | |

### 3.4. `staffing_budgets` — Бюджеты на стаффинг

| Колонка | Тип | Описание |
|---------|-----|----------|
| id | UUID PK | |
| name | String(255) NOT NULL | Название бюджета |
| year | Integer NOT NULL | Год |
| total_budget | Numeric(15,2) | Общая сумма (если задана одним числом) |
| created_at | DateTime | |
| updated_at | DateTime | |

### 3.5. `staffing_budget_month_plans` — Помесячный план бюджета стаффинга

| Колонка | Тип | Описание |
|---------|-----|----------|
| id | UUID PK | |
| staffing_budget_id | UUID FK → staffing_budgets.id CASCADE | |
| year | Integer NOT NULL | |
| month | Integer NOT NULL (1-12) | |
| amount | Numeric(15,2) NOT NULL DEFAULT 0 | Плановая сумма |
| UNIQUE(staffing_budget_id, year, month) | | |

### 3.6. `staffing_expenses` — Фактические расходы на стаффинг (помесячно по проекту)

| Колонка | Тип | Описание |
|---------|-----|----------|
| id | UUID PK | |
| project_id | UUID FK → projects.id SET NULL | Проект |
| year | Integer NOT NULL | |
| month | Integer NOT NULL (1-12) | |
| plan_amount | Numeric(15,2) DEFAULT 0 | План (авто = hours×rate, можно перезаписать) |
| fact_amount | Numeric(15,2) DEFAULT 0 | Факт (вносится вручную) |
| plan_hours | Numeric(10,2) DEFAULT 0 | План часов (из working_hours × кол-во стафферов) |
| fact_hours | Numeric(10,2) DEFAULT 0 | Факт часов (вносится вручную) |
| UNIQUE(project_id, year, month) | | |

### 3.7. `staffing_invoices` — Загруженные счета (PDF)

| Колонка | Тип | Описание |
|---------|-----|----------|
| id | UUID PK | |
| expense_id | UUID FK → staffing_expenses.id CASCADE | Привязка к расходу (проект+месяц) |
| filename | String(500) NOT NULL | Оригинальное имя файла |
| stored_path | String(1000) NOT NULL | Путь к файлу |
| content_type | String(100) | |
| uploaded_at | DateTime | |

---

## 4. API Endpoints

### 4.1. Подрядчики (`/staffing/contractors`)

| Метод | Путь | Описание |
|-------|------|----------|
| GET | /staffing/contractors | Список подрядчиков (+ кол-во стафферов, их даты) |
| POST | /staffing/contractors | Создать подрядчика |
| GET | /staffing/contractors/{id} | Карточка подрядчика |
| PATCH | /staffing/contractors/{id} | Обновить |
| DELETE | /staffing/contractors/{id} | Удалить |
| POST | /staffing/contractors/{id}/documents | Загрузить файл договора (multipart) |
| GET | /staffing/contractors/{id}/documents | Список файлов |
| GET | /staffing/contractors/{id}/documents/{doc_id}/download | Скачать файл |
| DELETE | /staffing/contractors/{id}/documents/{doc_id} | Удалить файл |

### 4.2. Стафферы (`/staffing/staffers`)

| Метод | Путь | Описание |
|-------|------|----------|
| GET | /staffing/staffers | Список (фильтры: project_id, contractor_id, year) |
| POST | /staffing/staffers | Создать |
| GET | /staffing/staffers/{id} | Карточка |
| PATCH | /staffing/staffers/{id} | Обновить |
| DELETE | /staffing/staffers/{id} | Удалить |

### 4.3. Расходы (`/staffing/expenses`)

| Метод | Путь | Описание |
|-------|------|----------|
| GET | /staffing/expenses?year=&project_id= | Помесячные расходы (12 записей) |
| PUT | /staffing/expenses/{project_id}/{year}/{month} | Upsert план/факт (amount + hours) |
| GET | /staffing/expenses/summary?year= | Агрегация по проектам |
| POST | /staffing/expenses/{expense_id}/invoices | Загрузить счёт PDF |
| GET | /staffing/expenses/{expense_id}/invoices | Список счетов |
| GET | /staffing/invoices/{invoice_id}/download | Скачать счёт |
| DELETE | /staffing/invoices/{invoice_id} | Удалить счёт |

### 4.4. Бюджеты стаффинга (`/staffing/budgets`)

| Метод | Путь | Описание |
|-------|------|----------|
| GET | /staffing/budgets?year= | Список бюджетов (план/факт/дельта) |
| POST | /staffing/budgets | Создать бюджет |
| GET | /staffing/budgets/{id} | Карточка (с помесячным планом) |
| PATCH | /staffing/budgets/{id} | Обновить |
| DELETE | /staffing/budgets/{id} | Удалить |
| GET | /staffing/budgets/{id}/month-plan?year= | Помесячный план |
| PUT | /staffing/budgets/{id}/month-plan?year= | Upsert помесячного плана |

---

## 5. Бизнес-логика

### 5.1. Расчёт плановых расходов
- **План (деньги)** = `working_hours[month] × hourly_rate × кол-во_активных_стафферов_в_месяце`
- Можно переопределить вручную (поле `plan_amount` в `staffing_expenses`)
- **План (часы)** = `working_hours[month] × кол-во_активных_стафферов` (тоже переопределяемый)

### 5.2. Активность стаффера в месяце
- Аналогично сотрудникам: `valid_from <= last_day_of_month` AND (`valid_to IS NULL` OR `valid_to > first_day_of_month`)

### 5.3. Бюджет: факт
- Факт берётся из `staffing_expenses.fact_amount` (вводится вручную)
- Суммируется по всем проектам за год для отображения в бюджете

### 5.4. Счета (invoices)
- Хранятся как файлы на диске (директория `staffing_uploads/invoices/`)
- Привязаны к конкретному расходу (проект + год + месяц)
- Можно загрузить несколько PDF на один месяц

### 5.5. Документы подрядчиков
- Хранятся как файлы на диске (директория `staffing_uploads/contracts/`)
- Привязаны к подрядчику
- Поддерживаются PDF и DOCX

---

## 6. Frontend — структура файлов

```
src/
├── pages/
│   └── staffing/
│       ├── StaffingPage.jsx          — главная с табами
│       ├── StaffersTab.jsx           — список стафферов
│       ├── StafferDetailPage.jsx     — карточка стаффера
│       ├── ExpensesTab.jsx           — расходы по проектам, план/факт
│       ├── StaffingBudgetsTab.jsx    — бюджеты стаффинга
│       ├── StaffingBudgetDetail.jsx  — карточка бюджета
│       ├── ContractorsTab.jsx        — список подрядчиков
│       └── ContractorDetailPage.jsx  — карточка подрядчика
├── api/
│   └── index.js                      — +20 новых функций API
├── components/layout/Layout.jsx      — +пункт «Стаффинг» в NAV
└── main.jsx                          — +роуты /staffing/*
```

### 6.1. Вкладка «Стафферы»
- Таблица: ФИО, Специализация, Проект, Ставка (₽/ч), Подрядчик, Дата до, ПМ
- Кнопка «+ Добавить стаффера» → модалка с формой
- Клик по строке → карточка стаффера (редактирование, удаление)

### 6.2. Вкладка «Расходы»
- Селектор проекта (или «Все проекты»)
- Таблица 12 месяцев:
  - Строка «План ₽» — авто-расчёт, редактируемая
  - Строка «Факт ₽» — ввод вручную
  - Строка «План ч.» — авто-расчёт, редактируемая
  - Строка «Факт ч.» — ввод вручную
  - Строка «Счета» — кнопка загрузки + список загруженных PDF (скачать/удалить)
- Итоги по году

### 6.3. Вкладка «Бюджеты»
- Список бюджетов: название, год, план, факт, дельта (цветом)
- Создание: название, год, общая сумма ИЛИ помесячно (12 полей + «Равномерно»)
- Карточка бюджета: помесячный план/факт/дельта

### 6.4. Вкладка «Подрядчики»
- Список: название, кол-во стафферов, стафферы (имена + даты)
- Создание: название
- Карточка: редактирование, загрузка/скачивание/удаление договоров (PDF/DOCX)

---

## 7. Миграции

Одна миграция `0008_staffing_module.py`:
- Создание всех 7 таблиц
- Индексы на FK и часто фильтруемые поля
- Обратимая (downgrade удаляет все таблицы)

---

## 8. Хранение файлов

- Директория: `staffing_uploads/` в корне backend (или настраиваемая через env `STAFFING_UPLOADS_DIR`)
- Структура:
  ```
  staffing_uploads/
  ├── contracts/{contractor_id}/{uuid}_{filename}
  └── invoices/{expense_id}/{uuid}_{filename}
  ```
- Лимит размера файла: 50 МБ
- В `.gitignore` добавить `staffing_uploads/`
- В Docker: volume для персистентности

---

## 9. Риски и митигация

| Риск | Митигация |
|------|-----------|
| Большие файлы загружают сервер | Лимит 50 МБ, streaming upload |
| Файлы теряются при пересоздании контейнера | Docker volume для `staffing_uploads/` |
| N+1 при списке подрядчиков со стафферами | joinedload / subqueryload |
| Расход «План» пересчитывается при изменении стаффера | Пересчёт при сохранении стаффера (фоновая задача) |
| Конфликт имён с существующим модулем budgets | Отдельный prefix `/staffing/` |

---

## 10. Rollback

- Удалить миграцию 0008 (downgrade)
- Удалить роутеры, сервисы, модели стаффинга
- Удалить фронтенд-файлы в `pages/staffing/`
- Убрать пункт из Layout и роуты из main.jsx
- Удалить директорию `staffing_uploads/`

---

## 11. Шаги реализации (порядок)

### Этап 1: Backend — модели и миграции
1. Модели в `app/models/__init__.py` (7 новых классов)
2. Миграция Alembic `0008_staffing_module`
3. Pydantic-схемы в `app/schemas/staffing.py`

### Этап 2: Backend — сервисы и API
4. `app/services/staffing_service.py` — бизнес-логика (расчёт плана, активность стаффера)
5. `app/routers/staffing.py` — все endpoints (contractors, staffers, expenses, budgets)
6. Регистрация роутера в `main.py`
7. Настройка file uploads (конфиг, директория)

### Этап 3: Frontend — API и навигация
8. Функции API в `src/api/index.js`
9. Роуты в `main.jsx`
10. Пункт меню в `Layout.jsx`

### Этап 4: Frontend — страницы
11. `StaffingPage.jsx` (табы)
12. `StaffersTab.jsx` + `StafferDetailPage.jsx`
13. `ContractorsTab.jsx` + `ContractorDetailPage.jsx`
14. `ExpensesTab.jsx`
15. `StaffingBudgetsTab.jsx` + `StaffingBudgetDetail.jsx`

### Этап 5: Тесты
16. `backend/tests/test_staffing.py` — модели, API, бизнес-логика

### Этап 6: Документация
17. Обновить README.md, CONTEXT.md

---

## 12. Критерии приёмки

- [ ] CRUD подрядчиков с загрузкой/скачиванием договоров
- [ ] CRUD стафферов с привязкой к проекту и подрядчику
- [ ] Помесячные расходы: авто-план из ставок, ручной факт, загрузка счетов
- [ ] Бюджеты стаффинга: общая сумма или помесячно, план/факт/дельта
- [ ] Все существующие тесты проходят (нет регрессии)
- [ ] Новые тесты на бизнес-логику стаффинга
- [ ] Файлы хранятся персистентно (Docker volume)

---

## 13. Что должно быть покрыто тестами

- Активность стаффера в месяце (аналог employee_active_in_month)
- Расчёт планового расхода (hours × rate × active_staffers)
- CRUD API для всех 4 сущностей (happy path + 404 + 422)
- Загрузка/скачивание файлов (contracts + invoices)
- Бюджет: план/факт/дельта корректно считаются
- Авторизация: все endpoints требуют auth
