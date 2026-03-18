# План: вкладка «Настройки» — полный бэкап / восстановление БД

**Сценарий:** новая функция (Architect → Implementer → Guardian → Tester → Documenter)

## Цель
Полная выгрузка и загрузка данных PostgreSQL через UI, чтобы не терять реальные данные при доработках.

## Подход
- **Экспорт:** `pg_dump -Fc` (custom format) — схема + данные + `alembic_version`.
- **Импорт:** завершение сессий к БД → `DROP SCHEMA public CASCADE` → `CREATE SCHEMA public` → `pg_restore --no-owner --no-acl`.
- **Доступ:** только авторизованный пользователь (`get_current_user`), как у остальных API.

## Риски
| Риск | Митигация |
|------|-----------|
| Восстановление затирает все данные | Двойное подтверждение в UI; в API — явный флаг `confirm=true` |
| Несовместимость версий схемы | Бэкап с той же миграционной ветки; в README предупреждение |
| Нет `pg_dump` в образе | Установка `postgresql-client` в Dockerfile |
| SQLite / не Postgres | 400 с понятным текстом |

## Rollback
Откат: удалить роутер backup, страницу настроек, зависимость в Dockerfile (вернуть образ без client).

## Шаги
1. Dockerfile: `postgresql-client`
2. `app/services/backup.py` — парсинг URL, dump/restore
3. `app/routers/backup.py` — GET export, POST restore (multipart)
4. Frontend: маршрут `/settings`, пункт меню, страница с двумя действиями
5. Документация README

## Guardian (предварительно)
- Не логировать пароль БД; stderr pg_dump без полного вывода в клиент при 500 (краткое сообщение).
- Лимит размера файла восстановления (например 512 MiB).

## Tester (чек-лист)
- Скачать бэкап → файл не пустой, префикс PGDMP у custom dump.
- После восстановления данные совпадают с бэкапом (smoke: логин, список сотрудников).

## Guardian — VERDICT: **APPROVE**
- Секреты БД не попадают в ответы; пароль только в `PGPASSWORD` для subprocess.
- Восстановление только с `confirm=true` + проверка magic `PGDMP`; лимит файла 512 МБ.
- После restore вызывается `engine.dispose()` и `get_or_create_admin`, чтобы пул не держал мёртвые коннекты и был доступ к UI.

## Documenter
- Обновлены: `README.md` (раздел про бэкап), этот план.

## Change-log (Implementer)
| Что | Где |
|-----|-----|
| API `GET /backup/export`, `POST /backup/restore` | `backend/app/routers/backup.py` |
| pg_dump/pg_restore + парсинг DSN | `backend/app/services/backup.py` |
| postgresql-client в образе | `backend/Dockerfile` |
| Страница «Настройки», маршрут `/settings` | `frontend/src/pages/SettingsPage.jsx`, `main.jsx`, `Layout.jsx` |
| Клиент API | `frontend/src/api/index.js` |
| Тесты отказов (SQLite / confirm / magic) | `backend/tests/test_backup.py` |

**Проверка:** в Docker поднять stack → войти → Настройки → скачать `.dump` → (опционально) восстановить на копии БД.
