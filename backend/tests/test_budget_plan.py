"""Unit tests for budget_plan service (monthly plan get/set, month fact)."""
import pytest

from app.services.budget_plan import (
    get_budget_project_month_fact,
    get_budget_project_month_plan,
    get_project_month_plan,
    get_project_own_month_plan,
    set_budget_project_month_plan,
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
