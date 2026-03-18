# План обновления README.md и CONTEXT.md

## 0) Классификация
Рефакторинг без изменения поведения (обновление документации под фактический код).

## 1) Architect — план
Цель: чтобы `README.md` и `CONTEXT.md` описывали текущую реализацию вместо устаревших предположений (в частности, auth через `localStorage` и заголовок `Authorization`).

Риски:
- Документация может снова “уехать” относительно кода (особенно auth/CORS).
- Неполное отражение новых эндпоинтов (например, batch upsert зарплат) или новых файлов (middleware/types/dashboard_service).

Rollback:
- Восстановить `README.md` и `CONTEXT.md` из git (до коммита) если выявится несоответствие.

Шаги:
1. Снять факты с кода: cookies/auth, `CORS_ORIGINS`/`COOKIE_SECURE`, endpoints (`/auth/logout`, `/employees/:id/salary/batch`), структуру backend/services.
2. Обновить оба документа синхронно.
3. Прогнать минимальную проверку: `ReadLints` для Markdown (нет IDE-диагностик).

## 2) Implementer — change-log
Обновлено:
- `README.md`
  - добавлена секция “Авторизация и безопасность” (HttpOnly cookie `access_token`, `/auth/logout`, rate limit `5/min` на `/auth/login`, поведение `/health`),
  - обновлены `backend/.env` переменные (`CORS_ORIGINS`, `COOKIE_SECURE`, `DEBUG_MODE`),
  - уточнена структура backend (добавлены `middleware.py`, `types.py`, `utils.py`, `dashboard_service.py`, `employees_service.py`),
  - добавлена подсказка “копируй `backend/.env.example` -> `backend/.env`” в quick start.
- `CONTEXT.md`
  - заменён устаревший поток “localStorage + Authorization header” на фактический “HttpOnly cookie + `withCredentials` + `isAuthenticated` флаг в `sessionStorage`”,
  - добавлены `/auth/logout` и `/employees/:id/salary/batch` в “API cheat sheet”,
  - обновлены секции ограничений (CORS/cookies на production) и описание структуры backend/services.

## 3) Guardian — VERDICT
APPROVE
- Документы теперь отражают текущий cookie-based auth и реальную структуру backend/services.
- Были исправлены ключевые расхождения: `localStorage` и основная роль `Authorization: Bearer` больше не указаны как “основной” механизм.

## 4) Tester — проверено
- Проверка соответствия фактам из кода выполнена поиском по репозиторию и чтением ключевых файлов (`backend/app/routers/auth.py`, `backend/app/dependencies.py`, `frontend/src/api/client.js`, `frontend/src/store/auth.js`, `frontend/src/components/layout/Layout.jsx`).
- `ReadLints` по `README.md` и `CONTEXT.md`: ошибок не найдено.

## 5) Documenter — что изменилось
- Обновлены документы разработки/контракта: `README.md`, `CONTEXT.md`.
- Добавлена план-страница в `docs/plans/` для историчности изменений документации.

