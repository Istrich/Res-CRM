from app.models import WorkingHoursYearMonth


class TestWorkingHoursAPI:
    def test_get_returns_12_months_of_zeros(self, authed_client):
        r = authed_client.get("/settings/working-hours?year=2024")
        assert r.status_code == 200
        data = r.json()
        assert data["year"] == 2024
        assert len(data["items"]) == 12
        assert [it["month"] for it in data["items"]] == list(range(1, 13))
        assert all(float(it["hours"]) == 0.0 for it in data["items"])

    def test_put_upserts_and_gets_updated_values(self, authed_client, db):
        items = [{"month": m, "hours": float(m * 10)} for m in range(1, 13)]
        r = authed_client.put("/settings/working-hours?year=2024", json={"items": items})
        assert r.status_code == 200
        data = r.json()
        assert data["items"][0]["hours"] == 10.0
        assert data["items"][5]["hours"] == 60.0

        rows = db.query(WorkingHoursYearMonth).filter(WorkingHoursYearMonth.year == 2024).all()
        assert len(rows) == 12

        # Update 1 month
        items2 = items.copy()
        items2[5] = {"month": 6, "hours": 999.5}
        r2 = authed_client.put("/settings/working-hours?year=2024", json={"items": items2})
        assert r2.status_code == 200
        data2 = r2.json()
        assert data2["items"][5]["hours"] == 999.5

    def test_put_negative_hours_rejected(self, authed_client):
        items = [{"month": m, "hours": 10.0} for m in range(1, 13)]
        items[2] = {"month": 3, "hours": -1.0}
        r = authed_client.put("/settings/working-hours?year=2024", json={"items": items})
        assert r.status_code == 422

    def test_put_missing_months_rejected(self, authed_client):
        items = [{"month": m, "hours": 10.0} for m in range(1, 5)]  # only 4 months
        r = authed_client.put("/settings/working-hours?year=2024", json={"items": items})
        assert r.status_code == 422

