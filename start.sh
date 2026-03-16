#!/bin/bash
# Запуск Res-CRM: БД + backend (миграции) + подсказка про frontend
set -e
cd "$(dirname "$0")"

echo "→ Запуск Docker (PostgreSQL + backend)..."
sudo docker compose up -d

echo "→ Ожидание готовности backend..."
sleep 3

echo "→ Миграции БД..."
sudo docker compose exec backend alembic upgrade head

echo ""
echo "Готово."
echo "  Backend:  http://localhost:8000"
echo "  Swagger:  http://localhost:8000/docs"
echo ""
echo "Веб-интерфейс (логин, дашборд) — это FRONTEND, он не в Docker."
echo "Запустите в отдельном терминале:"
echo "  cd $(dirname "$0")/frontend && npm install && npm run dev"
echo "  Затем откройте: http://localhost:3000  (логин: admin / admin123)"
