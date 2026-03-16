import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.dependencies import get_current_user
from app.models import AssignmentMonthRate, Employee, EmployeeProject, Project, User
from app.schemas.employee import AssignmentOut, EmployeeListItem
from app.schemas.project import ProjectCreate, ProjectOut, ProjectUpdate, ProjectWithStats
from app.services.calc import assignment_active_in_month, get_employee_month_total_rate, get_project_budget_summary

router = APIRouter(prefix="/projects", tags=["projects"])


def _project_with_stats(db: Session, proj: Project, year: Optional[int]) -> ProjectWithStats:
    stats = get_project_budget_summary(db, proj.id, year) if year else {}
    employee_count = (
        db.query(EmployeeProject)
        .filter(EmployeeProject.project_id == proj.id)
        .distinct(EmployeeProject.employee_id)
        .count()
    )
    return ProjectWithStats(
        id=proj.id,
        name=proj.name,
        budget_project_id=proj.budget_project_id,
        budget_project_name=proj.budget_project.name if proj.budget_project else None,
        created_at=proj.created_at,
        updated_at=proj.updated_at,
        employee_count=employee_count,
        spent=stats.get("spent", 0),
        forecast=stats.get("forecast", 0),
        last_calculated_at=stats.get("last_calculated_at"),
    )


@router.get("", response_model=list[ProjectWithStats])
def list_projects(
    budget_project_id: Optional[uuid.UUID] = Query(None),
    year: Optional[int] = Query(None),
    search: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    q = db.query(Project).options(joinedload(Project.budget_project))
    if budget_project_id:
        q = q.filter(Project.budget_project_id == budget_project_id)
    if search:
        q = q.filter(Project.name.ilike(f"%{search}%"))
    projects = q.order_by(Project.name).all()
    return [_project_with_stats(db, p, year) for p in projects]


@router.post("", response_model=ProjectOut, status_code=status.HTTP_201_CREATED)
def create_project(
    body: ProjectCreate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    proj = Project(**body.model_dump())
    db.add(proj)
    db.commit()
    db.refresh(proj)
    return ProjectOut(
        id=proj.id,
        name=proj.name,
        budget_project_id=proj.budget_project_id,
        budget_project_name=proj.budget_project.name if proj.budget_project else None,
        created_at=proj.created_at,
        updated_at=proj.updated_at,
    )


@router.get("/{project_id}", response_model=ProjectWithStats)
def get_project(
    project_id: uuid.UUID,
    year: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    proj = (
        db.query(Project)
        .options(joinedload(Project.budget_project))
        .filter(Project.id == project_id)
        .first()
    )
    if not proj:
        raise HTTPException(status_code=404, detail="Project not found")
    return _project_with_stats(db, proj, year)


@router.patch("/{project_id}", response_model=ProjectOut)
def update_project(
    project_id: uuid.UUID,
    body: ProjectUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    proj = db.query(Project).filter(Project.id == project_id).first()
    if not proj:
        raise HTTPException(status_code=404, detail="Project not found")

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(proj, field, value)

    db.commit()
    db.refresh(proj)
    return ProjectOut(
        id=proj.id,
        name=proj.name,
        budget_project_id=proj.budget_project_id,
        budget_project_name=proj.budget_project.name if proj.budget_project else None,
        created_at=proj.created_at,
        updated_at=proj.updated_at,
    )


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project(
    project_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    proj = db.query(Project).filter(Project.id == project_id).first()
    if not proj:
        raise HTTPException(status_code=404, detail="Project not found")
    db.delete(proj)
    db.commit()


# ---------------------------------------------------------------------------
# Project employees list
# ---------------------------------------------------------------------------

@router.get("/{project_id}/employees")
def get_project_employees(
    project_id: uuid.UUID,
    year: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    proj = db.query(Project).filter(Project.id == project_id).first()
    if not proj:
        raise HTTPException(status_code=404, detail="Project not found")

    assignments = (
        db.query(EmployeeProject)
        .options(joinedload(EmployeeProject.employee))
        .filter(EmployeeProject.project_id == project_id)
        .all()
    )

    # Load monthly overrides for the given year if requested
    year_overrides: dict[uuid.UUID, dict[int, float]] = {}
    if year is not None:
        overrides = (
            db.query(AssignmentMonthRate)
            .filter(
                AssignmentMonthRate.assignment_id.in_([a.id for a in assignments]),
                AssignmentMonthRate.year == year,
            )
            .all()
        )
        for o in overrides:
            year_overrides.setdefault(o.assignment_id, {})[o.month] = float(o.rate)

    result = []
    default_rate_by_asgn = {a.id: float(a.rate) for a in assignments}
    for asgn in assignments:
        emp = asgn.employee
        row = {
            "assignment_id": str(asgn.id),
            "employee_id": str(emp.id),
            "display_name": emp.display_name,
            "title": emp.title,
            "department": emp.department,
            "specialization": emp.specialization,
            "is_position": emp.is_position,
            "rate": float(asgn.rate),
            "valid_from": asgn.valid_from.isoformat(),
            "valid_to": asgn.valid_to.isoformat() if asgn.valid_to else None,
            "hire_date": emp.hire_date.isoformat() if emp.hire_date else None,
            "termination_date": emp.termination_date.isoformat() if emp.termination_date else None,
        }
        if year is not None:
            row["monthly_rates"] = [
                (year_overrides.get(asgn.id, {}).get(m, default_rate_by_asgn[asgn.id])
                 if assignment_active_in_month(asgn, year, m) else 0)
                for m in range(1, 13)
            ]
            row["monthly_total_rates"] = [
                get_employee_month_total_rate(db, emp.id, year, m) for m in range(1, 13)
            ]
        result.append(row)

    return result


@router.delete("/{project_id}/employees/{assignment_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_employee_from_project(
    project_id: uuid.UUID,
    assignment_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    asgn = (
        db.query(EmployeeProject)
        .filter(
            EmployeeProject.id == assignment_id,
            EmployeeProject.project_id == project_id,
        )
        .first()
    )
    if not asgn:
        raise HTTPException(status_code=404, detail="Assignment not found")
    db.delete(asgn)
    db.commit()
