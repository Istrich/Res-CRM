# Bugfix: sync month rate in employees list

## Classification
- Type: Bugfix
- Scope: backend list projection for employees (`GET /employees`)

## Debugger change-log
- What changed:
  - `backend/app/services/employees_service.py`: `build_assignment_out` now supports `rate_override`; `build_list_item` now applies month-specific rate overrides for active assignments.
  - `backend/app/routers/employees.py`: `list_employees` now loads `AssignmentMonthRate` for selected `year/month` and passes overrides into list item builder.
  - `backend/tests/test_api_employees.py`: added regression test for month override rate in employees list.
- Why:
  - Employees table showed base assignment rate (`employee_projects.rate`) and ignored month override (`assignment_month_rates`), causing mismatch with project card and data drift in UI decisions.
- How to verify manually:
  1. Open project employee card and set monthly assignment rate override for selected month/year.
  2. Open Employees page with the same month/year filter.
  3. Confirm `Проекты / Ставки` shows override value, not base assignment rate.

## Tester report
- Added regression API test:
  - `test_list_uses_month_rate_override_for_selected_month`
- Coverage focus:
  - Ensures `/employees?year=YYYY&month=MM` returns overridden rate from `assignment_month_rates`.

## Guardian verdict
- VERDICT: APPROVE
- Reasons:
  - Fix is local and does not change contracts.
  - No forbidden architecture/storage changes.
  - Regression test added for the exact mismatch scenario.
