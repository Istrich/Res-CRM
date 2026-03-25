# Plan: Remove budget item from left menu

## Task classification
- Type: Feature change in UI navigation (handled via Architect -> Implementer -> Tester -> Guardian -> Documenter flow).

## Goal and scope
- Remove the `Бюджеты` item from the left sidebar menu because it duplicates information available in dashboards and other sections.
- Keep dashboard budget tab and existing budget-related routes/pages intact to avoid functional regressions.

## Affected modules
- Frontend:
  - `frontend/src/components/layout/Layout.jsx`
  - `frontend/src/pages/DashboardPage.jsx`

## Risks and migrations
- No DB/API migration required.
- Main risk: removing the wrong navigation entry and hiding needed access.
  - Mitigation: keep `Бюджетные проекты` in dashboards and keep routes intact; remove only `/budgets` from sidebar.

## Rollback
- Restore `{ to: '/budgets', icon: '💰', label: 'Бюджеты' }` in `frontend/src/components/layout/Layout.jsx`.

## Implementation steps
1. Keep `Бюджетные проекты` inside `DashboardPage`.
2. Remove only `/budgets` from sidebar `NAV` in `Layout.jsx`.
3. Run focused checks for frontend lint/build and container refresh.

## Acceptance criteria
- Dashboard still shows `Бюджетные проекты`.
- Left sidebar no longer shows `Бюджеты`.
- Other routes/pages continue to work.

## Implementer change-log
- What changed:
  - Restored `BudgetProjectsTab` import, tab config, and render branch in `frontend/src/pages/DashboardPage.jsx`.
  - Removed `/budgets` from sidebar `NAV` in `frontend/src/components/layout/Layout.jsx`.
- Why:
  - The requested change was to remove the left-menu budget entry, not the dashboard budget tab.
- How to verify manually:
  1. Open `/dashboard`.
  2. Confirm "Бюджетные проекты" tab is present.
  3. Confirm "Бюджеты" is absent from the left sidebar.
  4. Switch through dashboard tabs and confirm they render.

## Tester report
- Automated:
  - `npm run build` in `frontend/` - passed after correction
- Manual checklist:
  - Dashboard opens with `Бюджетные проекты`.
  - Left sidebar does not show `Бюджеты`.
  - Remaining navigation entries are clickable.

## Guardian verdict
- VERDICT: APPROVE
- Reasons:
  - Correct scope is sidebar navigation only.
  - Frontend build passes after restoring the dashboard tab and removing only the sidebar item.

## Documenter update
- Updated this plan file with implementation, validation, and review notes for the UI change.
