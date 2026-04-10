# Vacancy Postcalc Bugfix (2026-04-10)

## Task Type
- Bugfix

## Debugger Change-Log
- **What changed**:
  - Added a unified postcalc aggregation path in `backend/app/services/calc.py`:
    - `get_project_monthly_postcalc()`
    - staffing fact loader with anti-double-count between staffing sources.
  - Updated budget/postcalc consumers to use unified postcalc totals:
    - `backend/app/services/budget_plan.py`
    - `backend/app/services/dashboard_service.py`
    - `backend/app/routers/budgets.py`
    - `backend/app/services/export.py`
  - Updated UI hints where postcalc is shown:
    - `frontend/src/pages/ProjectDetailPage.jsx`
    - `frontend/src/pages/BudgetProjectDetailPage.jsx`
  - Added coverage for vacancy accounting scenarios:
    - `backend/tests/test_calc.py`
    - `backend/tests/test_budget_plan.py`
- **Why**:
  - Vacancy/staffing expenses were not consistently included in project and budget-project postcalc values.
  - As a result, postcalc numbers could diverge across budget screens and staffing screens.
- **Anti-double-count rule**:
  - Inside staffing sources, per-staffer fact (`StafferMonthExpense.actual_amount`) has priority.
  - Aggregate project-level staffing fact (`StaffingExpense.fact_amount`) is used only when per-staffer fact is absent for the same `(project, month)`.
- **How to verify manually**:
  1. Create a budget project and project.
  2. Add staffing fact for a month (via staffing expenses or staffer matrix).
  3. Open project budget and budget project budget pages for that year.
  4. Confirm monthly and totals include staffing vacancy fact.
  5. Add both staffing sources for the same month and confirm no double count from staffing internals.

## Guardian
- **VERDICT**: APPROVE
- **Reasons**:
  - Unified source-of-truth for postcalc is introduced and reused in all key budget/postcalc endpoints.
  - No lint regressions in changed files.
  - Tests for vacancy-only, salary-only, mixed scenarios were added.
- **Notes**:
  - Local automated test execution is blocked in current environment because `pytest` is not installed.

## Tester
- **Covered by tests**:
  - vacancy-only staffing fact included in postcalc;
  - salary-only behavior remains intact;
  - mixed salary+staffing scenario with anti-double-count across staffing sources.
- **Manual checklist**:
  - Verify `/budgets/projects/{id}` monthly row includes staffing amounts.
  - Verify `/budgets/budget-projects/{id}` monthly fact includes staffing amounts.
  - Verify dashboard monthly project and budget-project tables reflect same totals.
  - Verify export for project budgets matches API totals.

## Documenter
- Updated this workflow artifact:
  - `docs/plans/2026-04-10-vacancy-postcalc-bugfix.md`
- Documented:
  - new aggregation rule,
  - anti-double-count behavior,
  - verification checklist.
