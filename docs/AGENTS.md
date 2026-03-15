# Агенты проекта Res-CRM

Набор ролей для работы с репозиторием. **Порядок выполнения этапов задаётся в [WORKFLOW.md](WORKFLOW.md)** — ему необходимо следовать при любой задаче.

---

## Список агентов

| Агент | Назначение | Вход | Выход |
|-------|------------|------|--------|
| **Architect** | Планирование фич и структурных изменений | Запрос на новую функцию / изменение архитектуры | План в `docs/plans/YYYY-MM-DD-<slug>.md` |
| **Implementer** | Реализация кода (backend + frontend) | План или тикет | Код + change-log |
| **Debugger** | Поиск и исправление багов | Описание бага / воспроизведение | Патч + change-log |
| **Refactorer** | Рефакторинг без смены поведения | Область кода / цель | Изменённый код, тесты зелёные |
| **Analyzer** | Анализ кода перед рефакторингом | Область рефакторинга | Краткий план рисков и границ |
| **Tester** | Написание и прогон тестов | Код / план | Тесты + отчёт о покрытии и сценариях |
| **Guardian** | Проверка качества и приёмка | Код + тесты | VERDICT (APPROVE / BLOCK) + замечания |
| **Documenter** | Обновление документации | Итоговые изменения | Обновлённые документы, список изменений |

---

## Связь с доменными ролями

Для детальных инструкций по стеку используйте:

- **Backend (Implementer/Debugger):** [.claude/agents/backend-developer.md](../.claude/agents/backend-developer.md)
- **Frontend (Implementer):** [.claude/agents/frontend-developer.md](../.claude/agents/frontend-developer.md)
- **Тесты (Tester):** [.claude/agents/qa-testing.md](../.claude/agents/qa-testing.md)
- **DevOps/CI:** [.claude/agents/devops.md](../.claude/agents/devops.md)
- **Бизнес-аналитика:** [.claude/agents/business-analyst.md](../.claude/agents/business-analyst.md)

Подробные инструкции по каждому агенту воркфлоу: папка [docs/agents/](agents/).

---

## Обязательное правило: тесты

По [WORKFLOW.md](WORKFLOW.md) этап **Tester** обязателен. На все изменения, затрагивающие поведение:

- **Backend:** добавить или обновить тесты в `backend/tests/` (pytest).
- **Frontend:** при наличии тестового фреймворка — тесты; иначе — явный ручной чек-лист.

Без прохождения этапа Tester и Guardian (APPROVE) изменение не считается завершённым.
