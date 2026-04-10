"""Unit tests for budget_plan service (monthly plan get/set, month fact)."""
import pytest
from app.models import StaffingExpense

from app.services.budget_plan import (
    get_budget_project_month_fact,
    get_budget_project_month_plan,
    get_project_month_plan,
    get_project_own_month_plan,
    get_budget_project_month_fact_forecast_override_flags,
    set_budget_project_month_plan,
    set_budget_project_month_fact_forecast_overrides,
    set_project_own_month_plan,
)


class TestBudgetPlanService:
    def test_get_plan_empty(self, db, make_budget_project):
        bp = make_budget_project(year=2024)
        plan = get_budget_project_month_plan(db, bp.id, 2024)
        assert len(plan) == 12
        assert all(p["month"] == i + 1 and p["amount"] == 0 for i, p in enumerate(plan))

    def test_set_plan_updates_total_budget(self, db, make_budget_project):
        bp = make_budget_project(year=2024, total_budget=0)
        items = [{"month": m, "amount": 10_000} for m in range(1, 13)]
        result = set_budget_project_month_plan(db, bp.id, 2024, items)
        assert len(result) == 12
        assert sum(p["amount"] for p in result) == 120_000
        db.refresh(bp)
        assert float(bp.total_budget) == 120_000

    def test_set_plan_partial_months(self, db, make_budget_project):
        bp = make_budget_project(year=2024)
        items = [{"month": 1, "amount": 50_000}, {"month": 2, "amount": 60_000}]
        result = set_budget_project_month_plan(db, bp.id, 2024, items)
        assert len(result) == 12
        assert result[0]["amount"] == 50_000
        assert result[1]["amount"] == 60_000
        assert all(result[i]["amount"] == 0 for i in range(2, 12))

    def test_get_project_month_plan_no_bp(self, db, make_project, make_budget_project):
        bp = make_budget_project(year=2024)
        proj = make_project(name="P", budget_project=bp)
        plan = get_project_month_plan(db, proj.id, 2024)
        assert plan is not None
        assert len(plan) == 12

    def test_get_project_month_plan_standalone_project(self, db):
        from app.models import Project
        proj = Project(name="Standalone", budget_project_id=None)
        db.add(proj)
        db.commit()
        db.refresh(proj)
        plan = get_project_month_plan(db, proj.id, 2024)
        assert plan is None

    def test_project_own_plan_has_priority_over_budget_project(self, db, make_budget_project, make_project):
        bp = make_budget_project(year=2024)
        proj = make_project(name="P", budget_project=bp)
        # budget project plan: 10_000 each month
        bp_items = [{"month": m, "amount": 10_000} for m in range(1, 13)]
        set_budget_project_month_plan(db, bp.id, 2024, bp_items)
        # project own plan: 5_000 each month
        proj_items = [{"month": m, "amount": 5_000} for m in range(1, 13)]
        set_project_own_month_plan(db, proj.id, 2024, proj_items)

        own = get_project_own_month_plan(db, proj.id, 2024)
        eff = get_project_month_plan(db, proj.id, 2024)

        assert own is not None and eff is not None
        assert sum(p["amount"] for p in own) == 5_000 * 12
        assert sum(p["amount"] for p in eff) == 5_000 * 12

    def test_get_budget_project_month_fact_empty(self, db, make_budget_project):
        bp = make_budget_project(year=2024)
        fact = get_budget_project_month_fact(db, bp.id, 2024)
        assert len(fact) == 12
        assert all(f["amount"] == 0 for f in fact)

    def test_get_budget_project_month_fact_uses_manual_override_when_present(self, db, make_budget_project):
        bp = make_budget_project(year=2024)

        set_budget_project_month_fact_forecast_overrides(
            db,
            bp.id,
            2024,
            items=[{"month": 3, "amount": 555.0}],
        )

        fact = get_budget_project_month_fact(db, bp.id, 2024)
        assert len(fact) == 12
        assert fact[2]["month"] == 3
        assert fact[2]["amount"] == 555.0
        assert all(f["amount"] == 0 for f in (fact[:2] + fact[3:]))

        flags = get_budget_project_month_fact_forecast_override_flags(db, bp.id, 2024)
        assert flags[2]["is_manual"] is True
        assert all(not x["is_manual"] for i, x in enumerate(flags) if i != 2)

    def test_get_budget_project_month_fact_includes_staffing_vacancy_fact(self, db, make_budget_project, make_project):
        bp = make_budget_project(year=2024)
        p1 = make_project(name="P1", budget_project=bp)
        p2 = make_project(name="P2", budget_project=bp)

        db.add(StaffingExpense(project_id=p1.id, year=2024, month=4, fact_amount=200.0))
        db.add(StaffingExpense(project_id=p2.id, year=2024, month=4, fact_amount=300.0))
        db.commit()

        fact = get_budget_project_month_fact(db, bp.id, 2024)
        assert fact[3]["month"] == 4
        assert fact[3]["amount"] == pytest.approx(500.0)
