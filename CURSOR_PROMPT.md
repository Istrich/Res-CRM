# Задача: Привязка стафферов к бюджетам стаффинга + отображение факта в бюджетах

## Контекст
В модуле Стаффинг есть бюджеты (`staffing_budgets`) и стафферы (`staffers`). Сейчас бюджеты не связаны со стафферами — факт считается из ВСЕХ расходов за год, а не из расходов конкретных стафферов. Нужно добавить связь staffer → budget и пересчитывать факт только по привязанным стафферам.

## Что нужно сделать

### 1. Миграция
Файл `backend/migrations/versions/0011_staffer_budget_link.py` уже готов — просто скопируй его в проект как есть. Не меняй его.

### 2. Модель — `backend/app/models/__init__.py`

В классе `Staffer`:
- Добавь поле `staffing_budget_id` (UUID FK → `staffing_budgets.id`, ondelete="SET NULL", nullable=True) — вставь его ПЕРЕД `created_at`, ПОСЛЕ `extension_comment`
- Добавь relationship `staffing_budget` к `StaffingBudget` с `back_populates="staffers"` — вставь ПОСЛЕ relationship `project`

В классе `StaffingBudget`:
- Добавь обратный relationship `staffers` к `Staffer` с `back_populates="staffing_budget"` — вставь ПОСЛЕ relationship `month_plans`

### 3. Схемы — `backend/app/schemas/staffing.py`

- В `StafferCreate` добавь: `staffing_budget_id: Optional[uuid.UUID] = None`
- В `StafferUpdate` добавь: `staffing_budget_id: Optional[uuid.UUID] = None`
- В `StafferOut` добавь: `staffing_budget_id: Optional[uuid.UUID] = None` и `staffing_budget_name: Optional[str] = None`
- В `StafferMatrixRow` добавь аналогично: `staffing_budget_id` и `staffing_budget_name`
- В `StaffingBudgetOut` добавь: `staffer_count: int = 0` и `staffers: list[StaffingBudgetStafferPreview] = []`
- Добавь две новые схемы:

```python
class StaffingBudgetMonthDetailItem(BaseModel):
    month: int
    plan_amount: float = 0.0
    fact_amount: float = 0.0
    has_fact: bool = False

class StaffingBudgetStafferPreview(BaseModel):
    id: uuid.UUID
    full_name: str
    project_name: Optional[str] = None
    hourly_rate: float = 0
    valid_from: date
    valid_to: Optional[date] = None
```

ВАЖНО: `StaffingBudgetStafferPreview` должен быть объявлен ВЫШЕ `StaffingBudgetOut`, т.к. `StaffingBudgetOut` на него ссылается.

### 4. Сервис — `backend/app/services/staffing_service.py`

В функции `build_staffer_out` добавь в возвращаемый объект:
```python
"staffing_budget_id": staffer.staffing_budget_id,
"staffing_budget_name": staffer.staffing_budget.name if staffer.staffing_budget else None,
```

### 5. Роутер — `backend/app/routers/staffing.py`

**5a.** Полностью перепиши функцию `_build_budget_out`. Сейчас она считает fact из `StaffingExpense` за год. Нужно считать из `StafferMonthExpense` только для стафферов, у которых `staffing_budget_id == budget.id`:

```python
def _build_budget_out(budget: StaffingBudget, db: Session) -> StaffingBudgetOut:
    from app.schemas.staffing import StaffingBudgetStafferPreview

    plan_total = sum(float(mp.amount) for mp in budget.month_plans)

    linked_staffers = (
        db.query(Staffer)
        .options(joinedload(Staffer.project))
        .filter(Staffer.staffing_budget_id == budget.id)
        .all()
    )
    linked_ids = [s.id for s in linked_staffers]

    fact_total = 0.0
    if linked_ids:
        fact_rows = (
            db.query(StafferMonthExpense)
            .filter(
                StafferMonthExpense.staffer_id.in_(linked_ids),
                StafferMonthExpense.year == budget.year,
                StafferMonthExpense.actual_amount.isnot(None),
            )
            .all()
        )
        fact_total = sum(float(r.actual_amount) for r in fact_rows)

    delta = plan_total - fact_total

    staffers_preview = [
        StaffingBudgetStafferPreview(
            id=s.id,
            full_name=s.full_name,
            project_name=s.project.name if s.project else None,
            hourly_rate=float(s.hourly_rate),
            valid_from=s.valid_from,
            valid_to=s.valid_to,
        )
        for s in linked_staffers
    ]

    return StaffingBudgetOut(
        id=budget.id,
        name=budget.name,
        year=budget.year,
        total_budget=float(budget.total_budget) if budget.total_budget is not None else None,
        plan_total=plan_total,
        fact_total=fact_total,
        delta=delta,
        staffer_count=len(linked_staffers),
        staffers=staffers_preview,
        created_at=budget.created_at,
        updated_at=budget.updated_at,
    )
```

**5b.** Добавь новый endpoint `GET /budgets/{budget_id}/month-detail` — возвращает 12 элементов (month 1-12) с plan_amount (из month_plans), fact_amount (сумма actual_amount из StafferMonthExpense привязанных стафферов), has_fact (bool — есть ли хоть одна запись с actual_amount для этого месяца). Вставь его ПОСЛЕ endpoint `upsert_budget_month_plan` и ПЕРЕД секцией "Staffer Expense Matrix":

```python
@router.get("/budgets/{budget_id}/month-detail")
def get_budget_month_detail(
    budget_id: uuid.UUID,
    year: int = Query(...),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    from app.schemas.staffing import StaffingBudgetMonthDetailItem

    b = db.query(StaffingBudget).filter(StaffingBudget.id == budget_id).first()
    if not b:
        raise HTTPException(status_code=404, detail="Budget not found")

    plans = (
        db.query(StaffingBudgetMonthPlan)
        .filter(
            StaffingBudgetMonthPlan.staffing_budget_id == budget_id,
            StaffingBudgetMonthPlan.year == year,
        )
        .all()
    )
    plan_by_month = {p.month: float(p.amount) for p in plans}

    linked_ids = [
        row[0] for row in
        db.query(Staffer.id).filter(Staffer.staffing_budget_id == budget_id).all()
    ]

    fact_by_month = {}
    if linked_ids:
        expenses = (
            db.query(StafferMonthExpense)
            .filter(
                StafferMonthExpense.staffer_id.in_(linked_ids),
                StafferMonthExpense.year == year,
            )
            .all()
        )
        for e in expenses:
            if e.actual_amount is not None:
                fact_by_month[e.month] = fact_by_month.get(e.month, 0) + float(e.actual_amount)

    return [
        StaffingBudgetMonthDetailItem(
            month=m,
            plan_amount=plan_by_month.get(m, 0),
            fact_amount=fact_by_month.get(m, 0) if m in fact_by_month else 0,
            has_fact=m in fact_by_month,
        )
        for m in range(1, 13)
    ]
```

**5c.** В `create_staffer` — после проверки `body.project_id` добавь проверку `body.staffing_budget_id`:
```python
    if body.staffing_budget_id:
        if not db.query(StaffingBudget).filter(StaffingBudget.id == body.staffing_budget_id).first():
            raise HTTPException(status_code=404, detail="Staffing budget not found")
```

**5d.** В `update_staffer` — после проверки `project_id` в data добавь:
```python
    if "staffing_budget_id" in data and data["staffing_budget_id"]:
        if not db.query(StaffingBudget).filter(StaffingBudget.id == data["staffing_budget_id"]).first():
            raise HTTPException(status_code=404, detail="Staffing budget not found")
```

**5e.** Везде где `joinedload(StaffingBudget.month_plans)` — добавь рядом `joinedload(StaffingBudget.staffers)`. Это в функциях: `list_budgets`, `get_budget`, `create_budget` (после commit), `update_budget` (после commit).

### 6. Frontend API — `frontend/src/api/index.js`

После строки с `putStaffingBudgetMonthPlan` добавь:
```javascript
export const getStaffingBudgetMonthDetail = (id, year) =>
  api.get(`/staffing/budgets/${id}/month-detail`, { params: { year } }).then(r => r.data)
```

### 7. Frontend — `frontend/src/pages/staffing/StaffersTab.jsx`

- Добавь `staffing_budget_id: ''` в `EMPTY_FORM`
- Добавь импорт `getStaffingBudgets` вверху файла
- Добавь query для бюджетов:
```javascript
const { data: budgets = [] } = useQuery({
  queryKey: ['staffing-budgets'],
  queryFn: () => getStaffingBudgets(),
})
```
- В модалку создания (Modal) после блока «Подрядчик» добавь dropdown:
```jsx
<div className="form-group">
  <label className="label">Бюджет стаффинга</label>
  <select className="select" style={{ width: '100%' }}
    value={form.staffing_budget_id}
    onChange={e => setForm({ ...form, staffing_budget_id: e.target.value })}
  >
    <option value="">— не выбрано —</option>
    {budgets.map(b => <option key={b.id} value={b.id}>{b.name} ({b.year})</option>)}
  </select>
</div>
```
- В `handleCreate` в payload добавь: `staffing_budget_id: form.staffing_budget_id || null`
- В таблицу списка стафферов добавь колонку «Бюджет» — в thead `<th>` и в tbody `<td>{s.staffing_budget_name || '—'}</td>`

### 8. Frontend — `frontend/src/pages/staffing/StafferDetailPage.jsx`

- Добавь импорт `getStaffingBudgets` вверху
- Добавь query для бюджетов (рядом с projects/contractors queries)
- В функции `toForm` добавь: `staffing_budget_id: d.staffing_budget_id || ''`
- В `handleSave` добавь: `staffing_budget_id: f.staffing_budget_id || null`
- В форму редактирования добавь dropdown «Бюджет стаффинга» (аналогично StaffersTab)

### 9. Frontend — `frontend/src/pages/staffing/ExpensesTab.jsx`

В drawer (сайдбар редактирования стаффера):
- В `initForm` (где `setForm({...})` при открытии drawer) добавь: `staffing_budget_id: staffer.staffing_budget_id || ''`
- В `handleSubmit` drawer'а добавь: `staffing_budget_id: form.staffing_budget_id || null`
- В JSX drawer'а добавь dropdown «Бюджет стаффинга» (аналогично StaffersTab)

### 10. Frontend — `frontend/src/pages/staffing/StaffingBudgetDetail.jsx`

Полностью замени файл готовым файлом `StaffingBudgetDetail.jsx` из архива. Не правь его частями — замени целиком.

## Правила

- НЕ меняй существующую логику, которая не связана с этой задачей
- НЕ удаляй существующие поля, endpoints или компоненты
- НЕ меняй файл миграции — он готов
- Используй тот же стиль кода, что и в остальном проекте (SQLAlchemy 2.0 Mapped[], Pydantic v2, TanStack Query)
- Все Optional поля с UUID должны быть `Optional[uuid.UUID] = None`
- Убедись что все новые импорты добавлены (StaffingBudget в роутере уже импортирован)
- Проверь что `StaffingBudgetStafferPreview` объявлен ДО `StaffingBudgetOut` в schemas

## Порядок применения

1. Скопируй миграцию
2. Правки backend (model → schemas → service → router)
3. Правки frontend (api → StaffersTab → StafferDetailPage → ExpensesTab → StaffingBudgetDetail)
4. `docker compose exec backend alembic upgrade head`
5. Перезапуск
