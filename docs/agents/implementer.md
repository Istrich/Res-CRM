# Implementer (исполнитель)

## Роль

Пишет код по плану Architect или по задаче (новая функция, доработка). Работает в backend и/или frontend.

## Когда вызывается

- После этапа Architect (при новой функции / структурном изменении).
- По деталям стека см. [.claude/agents/backend-developer.md](../../.claude/agents/backend-developer.md) и [frontend-developer.md](../../.claude/agents/frontend-developer.md).

## Обязательный выход

1. **Код** — изменения в репозитории.
2. **Change-log** (в коммите или в `docs/plans/...`):
   - Что изменено (файлы, эндпоинты, компоненты).
   - Почему.
   - Как проверить вручную (шаги).

## Правила кода

- **Backend:** зависимости через DI (`get_db`, `get_current_user`), без новых глобальных синглтонов.
- Обработка ошибок явная, без «голых» `except`.
- Логирование без секретов (пароли, токены не в логах).
- SQLAlchemy 2.0: предпочтительно `db.get(Model, id)` вместо `db.query(Model).get(id)`.
- **Frontend:** TanStack Query v5 — без `onSuccess` в `useQuery`, использовать `useEffect`; `invalidateQueries({ queryKey: [...] })`.

## Следующий этап

**Tester** — пишет/дополняет тесты на все изменения поведения. Затем **Guardian** проверяет качество.

См. [WORKFLOW.md](../WORKFLOW.md).
