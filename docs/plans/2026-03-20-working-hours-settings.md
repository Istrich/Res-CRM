# План: рабочие часы по месяцам (вкладка «Настройки»)
**Сценарий:** новая функция (Architect → Implementer → Guardian → Tester → Documenter)

## Цель
Добавить во вкладку `Настройки` форму для ввода количества рабочих часов по 12 месяцам выбранного `года` (используется глобальный селектор года).
Данные будут храниться в БД и использоваться для расчета часовой ставки сотрудников в будущем. Сейчас реализуем только CRUD: чтение/сохранение.

## Подход
- Бэкенд: добавить новую ORM-модель `WorkingHoursYearMonth` (year + month → hours) и API:
  - `GET /api/settings/working-hours?year=YYYY`
  - `PUT /api/settings/working-hours?year=YYYY` с payload `{"items":[{"month":1,"hours":...},...12]}`
- Фронтенд: расширить `frontend/src/pages/SettingsPage.jsx`:
  - получить `year` из `useYearStore()`
  - сделать `GET` текущих значений часов
  - отобразить 12 `input type="number"` (Янв..Дек)
  - `PUT` после нажатия кнопки «Сохранить»

## Риски
| Риск | Митигация |
|------|-----------|
| Нет миграций — таблица появится только при `create_all` | В тестах/локально это ок. Для продакшена — добавить migration позже (отложено). |
| Некорректные значения часов (NaN/отрицательные/месяц вне 1..12) | Pydantic v2 валидация + fallback на фронтенде (пустое -> 0). |
| Несоответствие размера `items` | Валидация `len(items)==12` + проверка множеств месяцев 1..12. |

## Rollback
- Удалить роутер `backend/app/routers/settings.py`
- Удалить ORM-модель и схемы, откатить изменения в `SettingsPage.jsx` и `frontend/src/api/index.js`.

## Шаги
1. Backend:
   1) `backend/app/models/__init__.py`: добавить `WorkingHoursYearMonth`
   2) `backend/app/schemas/settings.py`: Pydantic схемы для GET/PUT
   3) `backend/app/routers/settings.py`: реализация `GET/PUT`
   4) `backend/app/main.py`: подключить новый роутер
   5) `backend/tests/test_settings_working_hours.py`: интеграционные тесты API + unit на ограничения
2. Frontend:
   1) `frontend/src/api/index.js`: добавить `getWorkingHours`, `putWorkingHours`
   2) `frontend/src/pages/SettingsPage.jsx`: UI и отправка данных

## Guardian (предварительно)
- Не логировать секреты.
- Ограничить доступ к API через `get_current_user`.
- Проверить, что `GET` всегда возвращает 12 элементов (Jan..Dec), даже если записи в БД отсутствуют.

## Tester (чек-лист)
- В тестах:
  - PUT сохраняет 12 значений и обновляет существующие
  - GET для года без данных возвращает 12 нулей
  - Отрицательные часы отклоняются (422)
  - Месяц вне 1..12 отклоняется (422)
- Вручную:
  - открыть `/settings`, выбрать год в сайдбаре
  - ввести отличные значения в нескольких месяцах
  - нажать «Сохранить» и убедиться, что после перезагрузки формы значения сохранились

## Guardian — VERDICT: TBD

## Documenter
- Обновить документацию: этот план (выполнено) и при необходимости `CONTEXT.md`/README (только если есть подходящий раздел для настроек).

## Change-log (Implementer)
| Что | Где |
|-----|-----|
| Таблица working hours (year/month) | `backend/app/models/__init__.py` |
| API settings working hours | `backend/app/routers/settings.py`, `backend/app/schemas/settings.py`, `backend/app/main.py` |
| UI редактирования (12 месяцев) | `frontend/src/pages/SettingsPage.jsx` |
| Клиент API | `frontend/src/api/index.js` |
| Тесты | `backend/tests/test_settings_working_hours.py` |

