# Plan: Staffing Module

**Date:** 2026-03-20  
**Type:** New Feature (large)  
**Chain:** Architect → Implementer → Guardian → Tester → Documenter  
**Source:** staffing-plan.md in repo root

---

## Scope

Add a full staffing module: 7 new DB tables, full CRUD REST API, 8 frontend pages,
file uploads (contracts + invoices). New "Стаффинг" entry in sidebar.

## Risks & Mitigation

| Risk | Mitigation |
|------|-----------|
| Large files overload server | 50 MB limit, chunked streaming |
| Files lost on container recreate | Docker named volume `staffing_uploads_data` |
| N+1 on contractors list | joinedload / subqueryload |
| Plan recalculates on staffer save | recalc on staffer create/update |
| Name conflict with `budgets` module | Separate `/staffing/` prefix |

## Migration Strategy

- Single migration `0008_staffing_module` (forward + rollback)
- All 7 tables created atomically
- Indexes on all FKs and frequently filtered columns

## Rollback

1. `alembic downgrade 0007_add_indexes`
2. Delete `app/routers/staffing.py`, `app/services/staffing_service.py`, `app/schemas/staffing.py`
3. Remove 7 model classes from `app/models/__init__.py`
4. Delete `frontend/src/pages/staffing/`
5. Remove nav item from `Layout.jsx` and routes from `main.jsx`
6. Remove `staffing_uploads/` directory
7. Remove `staffing_uploads_data` volume from `docker-compose.yml`

## Implementation Steps

### Этап 1 — Backend models + migration + schemas
1. 7 SQLAlchemy models in `app/models/__init__.py`
2. Alembic migration `0008_staffing_module.py`
3. Pydantic schemas `app/schemas/staffing.py`

### Этап 2 — Backend service + router
4. `app/services/staffing_service.py` — business logic
5. `app/routers/staffing.py` — all 20+ endpoints
6. Register router in `app/main.py` and `app/routers/__init__.py`
7. Add `STAFFING_UPLOADS_DIR` to config

### Этап 3 — Frontend API + nav
8. 20+ API functions in `src/api/index.js`
9. New routes in `src/main.jsx`
10. New nav item in `Layout.jsx`

### Этап 4 — Frontend pages (8 components)
11. `StaffingPage.jsx` (tabs host)
12. `StaffersTab.jsx` + `StafferDetailPage.jsx`
13. `ContractorsTab.jsx` + `ContractorDetailPage.jsx`
14. `ExpensesTab.jsx`
15. `StaffingBudgetsTab.jsx` + `StaffingBudgetDetail.jsx`

### Этап 5 — Tests
16. `backend/tests/test_staffing.py`

### Этап 6 — Docs
17. Update README.md, CONTEXT.md, .gitignore, docker-compose.yml
