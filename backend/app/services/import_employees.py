"""
Parse Excel file for employee import.
Expected columns (first row): Фамилия, Имя, Отчество, Специализация, Должность,
Подразделение, Дата найма, Дата увольнения, Комментарий.
"""

import io
from datetime import date, datetime
from typing import Any

from openpyxl import load_workbook


HEADER_MAP = {
    "фамилия": "last_name",
    "имя": "first_name",
    "отчество": "middle_name",
    "специализация": "specialization",
    "должность": "title",
    "подразделение": "department",
    "дата найма": "hire_date",
    "дата увольнения": "termination_date",
    "комментарий": "comment",
}


def _parse_date(value: Any) -> date | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    if isinstance(value, str):
        s = value.strip()
        if not s:
            return None
        if len(s) == 10 and s[4] == "-" and s[7] == "-":
            try:
                return date(int(s[:4]), int(s[5:7]), int(s[8:10]))
            except (ValueError, TypeError):
                pass
        parts = s.replace(",", ".").split(".")
        if len(parts) == 3:
            try:
                a, b, c = parts[0].strip(), parts[1].strip(), parts[2].strip()
                if len(c) == 4 and len(a) <= 2 and len(b) <= 2:
                    return date(int(c), int(b), int(a))
                if len(a) == 4 and len(b) <= 2 and len(c) <= 2:
                    return date(int(a), int(b), int(c))
            except (ValueError, TypeError):
                pass
    return None


def parse_employee_excel(file_content: bytes) -> list[dict[str, Any]]:
    """
    Parse first sheet of an Excel file. First row = headers.
    Returns list of dicts with keys: last_name, first_name, middle_name, title,
    department, specialization, hire_date, termination_date, comment.
    """
    wb = load_workbook(io.BytesIO(file_content), data_only=True)
    ws = wb.active
    if ws is None:
        return []

    # Header row
    col_count = ws.max_column or 0
    header_to_col = {}
    for c in range(1, col_count + 1):
        h = ws.cell(row=1, column=c).value
        if h is not None:
            key = str(h).strip().lower()
            if key in HEADER_MAP:
                header_to_col[HEADER_MAP[key]] = c

    if "title" not in header_to_col:
        # Fallback: columns by position 1=Фамилия, 2=Имя, ... 9=Комментарий
        default_cols = ["last_name", "first_name", "middle_name", "specialization", "title", "department", "hire_date", "termination_date", "comment"]
        for i, key in enumerate(default_cols, 1):
            if i <= col_count:
                header_to_col[key] = i

    rows = []
    for r in range(2, (ws.max_row or 1) + 1):
        row_dict = {}
        for key, col in header_to_col.items():
            val = ws.cell(row=r, column=col).value
            if key in ("hire_date", "termination_date"):
                row_dict[key] = _parse_date(val)
            else:
                row_dict[key] = (str(val).strip() or None) if val is not None else None
        rows.append(row_dict)

    return rows
