# План: автозапуск бэкенда и фронтенда после перезагрузки

## Классификация
Новая функция (инфраструктура / деплой).

## Риски
- Порт 3000: при `profile full` занят nginx; не запускать одновременно `npm run dev` на 3000.
- Docker должен стартовать при загрузке ОС (systemd / Docker Desktop).
- Первый старт `full`: долгая сборка образа frontend.

## Rollback
- Убрать профиль `full`, вернуть только `db` + `backend`; отключить systemd/LaunchAgent.

## Реализация
- `frontend/Dockerfile` + `nginx.conf` — SPA + прокси `/api`.
- `docker-compose.yml`: сервис `frontend`, `profiles: [full]`.
- `backend/docker-entrypoint.sh` + Dockerfile: `alembic upgrade head` перед uvicorn.
- Шаблоны: `deploy/systemd/`, `deploy/launchd/`.

## Guardian
APPROVE — не меняет Chroma/cards/prompts; compose без host network.

## Tester
- `docker compose --profile full config` валиден.
- После `up`: http://localhost:3000 открывается, логин работает.

## Documenter
- README, CONTEXT, этот план.
