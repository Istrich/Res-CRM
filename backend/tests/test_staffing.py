"""
Tests for the Staffing module.

Covers:
- staffer_active_in_month business logic
- CRUD API for contractors, staffers, expenses, budgets (happy path + 404 + auth)
- File upload stubs (contractors documents, invoices)
- Budget plan/fact/delta
"""
import os
import uuid
from datetime import date
from unittest.mock import MagicMock, patch

import pytest

# Tests use SQLite in-memory DB from conftest.py
from app.models import (
    Contractor,
    ContractorDocument,
    Staffer,
    StaffingBudget,
    StaffingBudgetMonthPlan,
    StaffingExpense,
    StaffingInvoice,
    Project,
)
from app.services.staffing_service import (
    calculate_plan_for_month,
    staffer_active_in_month,
)


# ===========================================================================
# Unit tests — business logic
# ===========================================================================

class TestStafferActiveInMonth:
    def test_active_whole_month(self):
        s = Staffer(valid_from=date(2024, 1, 1), valid_to=None)
        assert staffer_active_in_month(s, 2024, 3) is True

    def test_starts_mid_month_still_active(self):
        s = Staffer(valid_from=date(2024, 3, 15), valid_to=None)
        assert staffer_active_in_month(s, 2024, 3) is True

    def test_ends_last_day(self):
        s = Staffer(valid_from=date(2024, 1, 1), valid_to=date(2024, 3, 31))
        assert staffer_active_in_month(s, 2024, 3) is True

    def test_ends_before_month(self):
        s = Staffer(valid_from=date(2024, 1, 1), valid_to=date(2024, 2, 28))
        assert staffer_active_in_month(s, 2024, 3) is False

    def test_starts_after_month_end(self):
        s = Staffer(valid_from=date(2024, 4, 1), valid_to=None)
        assert staffer_active_in_month(s, 2024, 3) is False

    def test_ends_on_first_day(self):
        s = Staffer(valid_from=date(2024, 3, 1), valid_to=date(2024, 3, 1))
        assert staffer_active_in_month(s, 2024, 3) is True

    def test_valid_to_before_first_day(self):
        s = Staffer(valid_from=date(2024, 1, 1), valid_to=date(2024, 2, 29))
        # Feb 2024 has 29 days; valid_to = Feb 29 means active in Feb
        assert staffer_active_in_month(s, 2024, 2) is True
        # valid_to = Feb 29 < Mar 1, so not active in March
        assert staffer_active_in_month(s, 2024, 3) is False


# ===========================================================================
# Contractor API
# ===========================================================================

class TestContractorsAPI:
    def test_list_empty(self, authed_client):
        r = authed_client.get("/staffing/contractors")
        assert r.status_code == 200
        assert r.json() == []

    def test_create(self, authed_client):
        r = authed_client.post("/staffing/contractors", json={"name": "ООО Тест"})
        assert r.status_code == 201
        data = r.json()
        assert data["name"] == "ООО Тест"
        assert data["staffer_count"] == 0

    def test_create_requires_auth(self, client):
        r = client.post("/staffing/contractors", json={"name": "X"})
        assert r.status_code == 401

    def test_get_not_found(self, authed_client):
        r = authed_client.get(f"/staffing/contractors/{uuid.uuid4()}")
        assert r.status_code == 404

    def test_update(self, authed_client):
        c = authed_client.post("/staffing/contractors", json={"name": "Старое имя"}).json()
        r = authed_client.patch(f"/staffing/contractors/{c['id']}", json={"name": "Новое имя"})
        assert r.status_code == 200
        assert r.json()["name"] == "Новое имя"

    def test_delete(self, authed_client):
        c = authed_client.post("/staffing/contractors", json={"name": "Del"}).json()
        r = authed_client.delete(f"/staffing/contractors/{c['id']}")
        assert r.status_code == 204
        r2 = authed_client.get(f"/staffing/contractors/{c['id']}")
        assert r2.status_code == 404

    def test_create_invalid_empty_name(self, authed_client):
        r = authed_client.post("/staffing/contractors", json={"name": ""})
        assert r.status_code == 422


# ===========================================================================
# Staffer API
# ===========================================================================

class TestStaffersAPI:
    def _make_contractor(self, authed_client, name="Подрядчик"):
        return authed_client.post("/staffing/contractors", json={"name": name}).json()

    def test_list_empty(self, authed_client):
        r = authed_client.get("/staffing/staffers")
        assert r.status_code == 200
        assert r.json() == []

    def test_create_minimal(self, authed_client):
        r = authed_client.post("/staffing/staffers", json={
            "last_name": "Иванов",
            "hourly_rate": 2500.0,
            "valid_from": "2024-01-01",
        })
        assert r.status_code == 201
        data = r.json()
        assert data["last_name"] == "Иванов"
        assert data["hourly_rate"] == 2500.0

    def test_create_with_contractor(self, authed_client):
        c = self._make_contractor(authed_client)
        r = authed_client.post("/staffing/staffers", json={
            "last_name": "Петров",
            "hourly_rate": 3000.0,
            "valid_from": "2024-03-01",
            "contractor_id": c["id"],
        })
        assert r.status_code == 201
        assert r.json()["contractor_name"] == "Подрядчик"

    def test_create_contractor_not_found(self, authed_client):
        r = authed_client.post("/staffing/staffers", json={
            "last_name": "Сидоров",
            "hourly_rate": 1000.0,
            "valid_from": "2024-01-01",
            "contractor_id": str(uuid.uuid4()),
        })
        assert r.status_code == 404

    def test_get_not_found(self, authed_client):
        r = authed_client.get(f"/staffing/staffers/{uuid.uuid4()}")
        assert r.status_code == 404

    def test_update(self, authed_client):
        s = authed_client.post("/staffing/staffers", json={
            "last_name": "Апд",
            "hourly_rate": 1000.0,
            "valid_from": "2024-01-01",
        }).json()
        r = authed_client.patch(f"/staffing/staffers/{s['id']}", json={"hourly_rate": 2000.0})
        assert r.status_code == 200
        assert r.json()["hourly_rate"] == 2000.0

    def test_delete(self, authed_client):
        s = authed_client.post("/staffing/staffers", json={
            "last_name": "Del",
            "hourly_rate": 100.0,
            "valid_from": "2024-01-01",
        }).json()
        assert authed_client.delete(f"/staffing/staffers/{s['id']}").status_code == 204
        assert authed_client.get(f"/staffing/staffers/{s['id']}").status_code == 404

    def test_filter_by_year(self, authed_client):
        authed_client.post("/staffing/staffers", json={
            "last_name": "В2024",
            "hourly_rate": 100.0,
            "valid_from": "2024-01-01",
            "valid_to": "2024-12-31",
        })
        authed_client.post("/staffing/staffers", json={
            "last_name": "В2025",
            "hourly_rate": 100.0,
            "valid_from": "2025-01-01",
        })
        r2024 = authed_client.get("/staffing/staffers", params={"year": 2024})
        names_2024 = [s["last_name"] for s in r2024.json()]
        assert "В2024" in names_2024
        assert "В2025" not in names_2024

    def test_requires_auth(self, client):
        r = client.get("/staffing/staffers")
        assert r.status_code == 401

    def test_create_staffing_budget_not_found(self, authed_client):
        r = authed_client.post(
            "/staffing/staffers",
            json={
                "last_name": "НетБюджета",
                "hourly_rate": 1000.0,
                "valid_from": "2024-01-01",
                "staffing_budget_id": str(uuid.uuid4()),
            },
        )
        assert r.status_code == 404

    def test_update_staffing_budget_not_found(self, authed_client):
        s = authed_client.post(
            "/staffing/staffers",
            json={
                "last_name": "ПатчБюджет",
                "hourly_rate": 1000.0,
                "valid_from": "2024-01-01",
            },
        ).json()
        r = authed_client.patch(
            f"/staffing/staffers/{s['id']}",
            json={"staffing_budget_id": str(uuid.uuid4())},
        )
        assert r.status_code == 404


# ===========================================================================
# Expenses API
# ===========================================================================

class TestExpensesAPI:
    def _make_project(self, db):
        from app.models import BudgetProject
        bp = BudgetProject(name="BP", year=2024, total_budget=1_000_000)
        db.add(bp)
        p = Project(name="Проект", budget_project_id=bp.id)
        db.add(p)
        db.commit()
        db.refresh(p)
        return p

    def test_list_empty(self, authed_client):
        r = authed_client.get("/staffing/expenses", params={"year": 2024})
        assert r.status_code == 200
        assert r.json() == []

    def test_upsert_and_get(self, authed_client, db):
        p = self._make_project(db)
        r = authed_client.put(
            f"/staffing/expenses/{p.id}/2024/3",
            json={"fact_amount": 150000.0, "fact_hours": 200.0},
        )
        assert r.status_code == 200
        data = r.json()
        assert data["fact_amount"] == 150000.0
        assert data["fact_hours"] == 200.0
        assert data["month"] == 3

    def test_upsert_idempotent(self, authed_client, db):
        p = self._make_project(db)
        authed_client.put(f"/staffing/expenses/{p.id}/2024/5", json={"fact_amount": 10000.0})
        r = authed_client.put(f"/staffing/expenses/{p.id}/2024/5", json={"fact_amount": 20000.0})
        assert r.status_code == 200
        assert r.json()["fact_amount"] == 20000.0

    def test_upsert_project_not_found(self, authed_client):
        r = authed_client.put(
            f"/staffing/expenses/{uuid.uuid4()}/2024/3",
            json={"fact_amount": 1000.0},
        )
        assert r.status_code == 404

    def test_upsert_invalid_month(self, authed_client, db):
        p = self._make_project(db)
        r = authed_client.put(
            f"/staffing/expenses/{p.id}/2024/13",
            json={"fact_amount": 1000.0},
        )
        assert r.status_code == 422

    def test_summary(self, authed_client, db):
        p = self._make_project(db)
        authed_client.put(f"/staffing/expenses/{p.id}/2024/1", json={"fact_amount": 50000.0})
        authed_client.put(f"/staffing/expenses/{p.id}/2024/2", json={"fact_amount": 30000.0})
        r = authed_client.get("/staffing/expenses/summary", params={"year": 2024})
        assert r.status_code == 200
        rows = r.json()
        assert len(rows) == 1
        assert rows[0]["fact_total"] == 80000.0

    def test_requires_auth(self, client):
        r = client.get("/staffing/expenses", params={"year": 2024})
        assert r.status_code == 401


# ===========================================================================
# Invoices API (stub — no actual file I/O)
# ===========================================================================

class TestInvoicesAPI:
    def _make_expense(self, authed_client, db):
        from app.models import BudgetProject
        bp = BudgetProject(name="BP", year=2024, total_budget=500000)
        db.add(bp)
        p = Project(name="Проект2", budget_project_id=bp.id)
        db.add(p)
        db.commit()
        db.refresh(p)
        r = authed_client.put(f"/staffing/expenses/{p.id}/2024/6", json={"fact_amount": 1000.0})
        return r.json()

    def test_list_invoices_empty(self, authed_client, db):
        exp = self._make_expense(authed_client, db)
        r = authed_client.get(f"/staffing/expenses/{exp['id']}/invoices")
        assert r.status_code == 200
        assert r.json() == []

    def test_list_invoices_expense_not_found(self, authed_client):
        r = authed_client.get(f"/staffing/expenses/{uuid.uuid4()}/invoices")
        assert r.status_code == 404

    def test_upload_invoice(self, authed_client, db, tmp_path):
        exp = self._make_expense(authed_client, db)
        fake_pdf = b"%PDF-1.4 fake content"

        # Patch file save so tests don't write to disk
        with patch("app.routers.staffing._save_upload", return_value=(str(tmp_path / "inv.pdf"), "application/pdf")):
            r = authed_client.post(
                f"/staffing/expenses/{exp['id']}/invoices",
                files={"file": ("invoice.pdf", fake_pdf, "application/pdf")},
            )
        assert r.status_code == 201
        data = r.json()
        assert data["filename"] == "invoice.pdf"

    def test_delete_invoice(self, authed_client, db, tmp_path):
        exp = self._make_expense(authed_client, db)
        # Create fake file so delete doesn't fail
        fake_file = tmp_path / "inv2.pdf"
        fake_file.write_bytes(b"pdf")

        with patch("app.routers.staffing._save_upload", return_value=(str(fake_file), "application/pdf")):
            inv = authed_client.post(
                f"/staffing/expenses/{exp['id']}/invoices",
                files={"file": ("invoice2.pdf", b"pdf", "application/pdf")},
            ).json()

        r = authed_client.delete(f"/staffing/invoices/{inv['id']}")
        assert r.status_code == 204


# ===========================================================================
# Contractor Documents API (stub)
# ===========================================================================

class TestContractorDocumentsAPI:
    def _make_contractor(self, authed_client):
        return authed_client.post("/staffing/contractors", json={"name": "Контрактор"}).json()

    def test_upload_document(self, authed_client, tmp_path):
        c = self._make_contractor(authed_client)
        fake_doc = tmp_path / "contract.pdf"
        fake_doc.write_bytes(b"%PDF")

        with patch("app.routers.staffing._save_upload", return_value=(str(fake_doc), "application/pdf")):
            r = authed_client.post(
                f"/staffing/contractors/{c['id']}/documents",
                files={"file": ("contract.pdf", b"%PDF", "application/pdf")},
            )
        assert r.status_code == 201
        assert r.json()["filename"] == "contract.pdf"

    def test_list_documents_contractor_not_found(self, authed_client):
        r = authed_client.get(f"/staffing/contractors/{uuid.uuid4()}/documents")
        assert r.status_code == 404

    def test_delete_document(self, authed_client, tmp_path):
        c = self._make_contractor(authed_client)
        fake_file = tmp_path / "c.pdf"
        fake_file.write_bytes(b"pdf")
        with patch("app.routers.staffing._save_upload", return_value=(str(fake_file), "application/pdf")):
            doc = authed_client.post(
                f"/staffing/contractors/{c['id']}/documents",
                files={"file": ("c.pdf", b"pdf", "application/pdf")},
            ).json()
        r = authed_client.delete(f"/staffing/contractors/{c['id']}/documents/{doc['id']}")
        assert r.status_code == 204


# ===========================================================================
# Staffing Budgets API
# ===========================================================================

class TestStaffingBudgetsAPI:
    def test_list_empty(self, authed_client):
        r = authed_client.get("/staffing/budgets")
        assert r.status_code == 200
        assert r.json() == []

    def test_create(self, authed_client):
        r = authed_client.post("/staffing/budgets", json={
            "name": "Бюджет стаффинга 2024",
            "year": 2024,
            "total_budget": 2_000_000.0,
        })
        assert r.status_code == 201
        data = r.json()
        assert data["name"] == "Бюджет стаффинга 2024"
        assert data["total_budget"] == 2_000_000.0

    def test_get_not_found(self, authed_client):
        r = authed_client.get(f"/staffing/budgets/{uuid.uuid4()}")
        assert r.status_code == 404

    def test_update(self, authed_client):
        b = authed_client.post("/staffing/budgets", json={"name": "Старый", "year": 2024}).json()
        r = authed_client.patch(f"/staffing/budgets/{b['id']}", json={"name": "Новый"})
        assert r.status_code == 200
        assert r.json()["name"] == "Новый"

    def test_delete(self, authed_client):
        b = authed_client.post("/staffing/budgets", json={"name": "Del", "year": 2024}).json()
        assert authed_client.delete(f"/staffing/budgets/{b['id']}").status_code == 204
        assert authed_client.get(f"/staffing/budgets/{b['id']}").status_code == 404

    def test_month_plan_upsert_and_get(self, authed_client):
        b = authed_client.post("/staffing/budgets", json={"name": "Plan", "year": 2024}).json()
        items = [{"month": m, "amount": m * 100_000} for m in range(1, 13)]
        r = authed_client.put(
            f"/staffing/budgets/{b['id']}/month-plan",
            json={"year": 2024, "items": items},
        )
        assert r.status_code == 200
        plans = r.json()
        assert len(plans) == 12
        total = sum(p["amount"] for p in plans)
        assert total == sum(m * 100_000 for m in range(1, 13))

    def test_month_plan_budget_not_found(self, authed_client):
        r = authed_client.get(f"/staffing/budgets/{uuid.uuid4()}/month-plan", params={"year": 2024})
        assert r.status_code == 404

    def test_plan_fact_delta_from_linked_staffers(self, authed_client, db):
        """Delta = plan_total - fact_total; fact = sum(actual_amount) for staffers with staffing_budget_id."""
        from app.models import BudgetProject
        bp_model = BudgetProject(name="BP", year=2024, total_budget=500000)
        db.add(bp_model)
        p = Project(name="Proj", budget_project_id=bp_model.id)
        db.add(p)
        db.commit()
        db.refresh(p)

        b = authed_client.post("/staffing/budgets", json={"name": "Budget", "year": 2024}).json()
        items = [{"month": m, "amount": 100_000} for m in range(1, 13)]
        authed_client.put(f"/staffing/budgets/{b['id']}/month-plan", json={"year": 2024, "items": items})

        # Project-level StaffingExpense must NOT affect staffing budget fact
        authed_client.put(f"/staffing/expenses/{p.id}/2024/1", json={"fact_amount": 50_000.0})
        authed_client.put(f"/staffing/expenses/{p.id}/2024/2", json={"fact_amount": 80_000.0})
        r0 = authed_client.get(f"/staffing/budgets/{b['id']}")
        assert r0.json()["fact_total"] == 0.0
        assert r0.json()["staffer_count"] == 0

        s = authed_client.post(
            "/staffing/staffers",
            json={
                "last_name": "Линк",
                "hourly_rate": 1000.0,
                "valid_from": "2024-01-01",
                "staffing_budget_id": b["id"],
            },
        ).json()
        assert s["staffing_budget_name"] == "Budget"

        authed_client.put(
            f"/staffing/staffer-expenses/{s['id']}/2024/1",
            json={"actual_amount": 50_000.0},
        )
        authed_client.put(
            f"/staffing/staffer-expenses/{s['id']}/2024/2",
            json={"actual_amount": 80_000.0},
        )

        r = authed_client.get(f"/staffing/budgets/{b['id']}")
        assert r.status_code == 200
        data = r.json()
        assert data["plan_total"] == 1_200_000.0
        assert data["fact_total"] == 130_000.0
        assert data["delta"] == pytest.approx(1_070_000.0)
        assert data["staffer_count"] == 1
        assert len(data["staffers"]) == 1
        assert data["staffers"][0]["hourly_rate"] == 1000.0

    def test_requires_auth(self, client):
        r = client.get("/staffing/budgets")
        assert r.status_code == 401

    def test_month_detail_happy(self, authed_client):
        b = authed_client.post("/staffing/budgets", json={"name": "MonthDet", "year": 2024}).json()
        authed_client.put(
            f"/staffing/budgets/{b['id']}/month-plan",
            json={
                "year": 2024,
                "items": [{"month": 1, "amount": 10000}, {"month": 2, "amount": 20000}],
            },
        )
        s = authed_client.post(
            "/staffing/staffers",
            json={
                "last_name": "Факт",
                "hourly_rate": 500.0,
                "valid_from": "2024-01-01",
                "staffing_budget_id": b["id"],
            },
        ).json()
        authed_client.put(
            f"/staffing/staffer-expenses/{s['id']}/2024/1",
            json={"actual_amount": 5000.0},
        )
        r = authed_client.get(f"/staffing/budgets/{b['id']}/month-detail", params={"year": 2024})
        assert r.status_code == 200
        rows = r.json()
        assert len(rows) == 12
        m1 = next(x for x in rows if x["month"] == 1)
        assert m1["plan_amount"] == 10000.0
        assert m1["fact_amount"] == 5000.0
        assert m1["has_fact"] is True
        m3 = next(x for x in rows if x["month"] == 3)
        assert m3["plan_amount"] == 0.0
        assert m3["has_fact"] is False

    def test_month_detail_budget_not_found(self, authed_client):
        r = authed_client.get(f"/staffing/budgets/{uuid.uuid4()}/month-detail", params={"year": 2024})
        assert r.status_code == 404

    def test_month_detail_requires_year(self, authed_client):
        b = authed_client.post("/staffing/budgets", json={"name": "Y", "year": 2024}).json()
        r = authed_client.get(f"/staffing/budgets/{b['id']}/month-detail")
        assert r.status_code == 422

    def test_month_detail_requires_auth(self, client):
        r = client.get(f"/staffing/budgets/{uuid.uuid4()}/month-detail", params={"year": 2024})
        assert r.status_code == 401


# ===========================================================================
# calculate_plan_for_month (service unit test)
# ===========================================================================

class TestCalculatePlanForMonth:
    def test_no_working_hours_returns_zeros(self, db):
        # No WorkingHoursYearMonth row → returns (0, 0)
        from app.models import BudgetProject
        bp = BudgetProject(name="BP", year=2024, total_budget=100000)
        db.add(bp)
        p = Project(name="P", budget_project_id=bp.id)
        db.add(p)
        db.commit()
        db.refresh(p)
        plan_amount, plan_hours = calculate_plan_for_month(db, p.id, 2024, 3)
        assert plan_amount == 0.0
        assert plan_hours == 0.0

    def test_with_active_staffers(self, db):
        from app.models import BudgetProject, WorkingHoursYearMonth
        bp = BudgetProject(name="BP2", year=2024, total_budget=100000)
        db.add(bp)
        p = Project(name="P2", budget_project_id=bp.id)
        db.add(p)
        wh = WorkingHoursYearMonth(year=2024, month=3, hours=160)
        db.add(wh)
        db.commit()
        db.refresh(p)

        s1 = Staffer(last_name="А", hourly_rate=1000.0, valid_from=date(2024, 1, 1), project_id=p.id)
        s2 = Staffer(last_name="Б", hourly_rate=1500.0, valid_from=date(2024, 1, 1), project_id=p.id)
        db.add_all([s1, s2])
        db.commit()

        plan_amount, plan_hours = calculate_plan_for_month(db, p.id, 2024, 3)
        assert plan_hours == pytest.approx(320.0)   # 160 * 2
        assert plan_amount == pytest.approx(400000.0)  # 160*1000 + 160*1500

    def test_inactive_staffer_excluded(self, db):
        from app.models import BudgetProject, WorkingHoursYearMonth
        bp = BudgetProject(name="BP3", year=2024, total_budget=100000)
        db.add(bp)
        p = Project(name="P3", budget_project_id=bp.id)
        db.add(p)
        wh = WorkingHoursYearMonth(year=2024, month=5, hours=160)
        db.add(wh)
        db.commit()
        db.refresh(p)

        active = Staffer(last_name="Акт", hourly_rate=1000.0, valid_from=date(2024, 1, 1), project_id=p.id)
        inactive = Staffer(
            last_name="Неакт",
            hourly_rate=9999.0,
            valid_from=date(2024, 1, 1),
            valid_to=date(2024, 4, 30),  # expired before May
            project_id=p.id,
        )
        db.add_all([active, inactive])
        db.commit()

        plan_amount, plan_hours = calculate_plan_for_month(db, p.id, 2024, 5)
        assert plan_hours == pytest.approx(160.0)
        assert plan_amount == pytest.approx(160_000.0)
