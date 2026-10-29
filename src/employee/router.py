
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from src.utlis.db import get_db
from src.user.auth import get_current_user, is_admin
from src.employee import controller
from src.employee.models import EmployeeModel
from src.employee.schema import (
    EmployeeCreate,
    EmployeeUpdate,
    EmployeeResponse,
)
from src.manager.models import ManagerModel


router = APIRouter(
    prefix="/employee",
    tags=["Employees"],
)


# --------------------------------------------------
# Admin creates an employee and assigns a manager.
# --------------------------------------------------
@router.post(
    "/create_employee",
    response_model=EmployeeResponse,
)
def create_employee(
    payload: EmployeeCreate,
    db: Session = Depends(get_db),
    admin=Depends(is_admin),
):
    return controller.create_employee(payload, db)


# --------------------------------------------------
# List employees according to the logged-in role.
# Admin: all employees
# Manager: assigned employees only
# Employee: own record only
# --------------------------------------------------
@router.get("/", response_model=list[EmployeeResponse])
def get_employees(
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    if user.role == "admin":
        return controller.get_all_employees(db)

    if user.role == "manager":
        return controller.get_employees_by_manager(
            user.id,
            db,
        )

    if user.role == "employee":
        employee = (
            db.query(EmployeeModel)
            .filter(
                EmployeeModel.email.ilike(user.email)
            )
            .first()
        )

        if not employee:
            return []

        return [
            controller.get_employee_by_id(employee.id, db)
        ]

    raise HTTPException(
        status_code=403,
        detail="You are not authorized to view employees.",
    )


# --------------------------------------------------
# Get the logged-in user's profile.
# --------------------------------------------------
@router.get("/me")
def get_my_profile(
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    if user.role == "admin":
        return {
            "id": user.id,
            "name": user.name,
            "email": user.email,
            "role": "admin",
        }

    if user.role == "manager":
        manager = (
            db.query(ManagerModel)
            .filter(ManagerModel.user_id == user.id)
            .first()
        )

        if not manager:
            raise HTTPException(
                status_code=404,
                detail="Manager profile not found.",
            )

        return {
            "id": manager.id,
            "user_id": manager.user_id,
            "name": manager.name,
            "department": manager.department,
            "email": user.email,
            "role": "manager",
        }

    if user.role == "employee":
        employee = (
            db.query(EmployeeModel)
            .filter(
                EmployeeModel.email.ilike(user.email)
            )
            .first()
        )

        if not employee:
            raise HTTPException(
                status_code=404,
                detail="Employee profile not found.",
            )

        result = controller.get_employee_by_id(
            employee.id,
            db,
        )

        result["role"] = "employee"
        return result

    raise HTTPException(
        status_code=403,
        detail="You are not authorized to view this profile.",
    )


# --------------------------------------------------
# Get one employee by ID.
# Admin: any employee
# Manager: assigned employees only
# Employee: own record only
# --------------------------------------------------
@router.get(
    "/{employee_id}",
    response_model=EmployeeResponse,
)
def get_employee(
    employee_id: int,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    if user.role == "admin":
        return controller.get_employee_by_id(
            employee_id,
            db,
        )

    if user.role == "manager":
        return controller.get_employee_for_manager(
            employee_id,
            user.id,
            db,
        )

    if user.role == "employee":
        employee = (
            db.query(EmployeeModel)
            .filter(EmployeeModel.id == employee_id)
            .first()
        )

        if not employee:
            raise HTTPException(
                status_code=404,
                detail="Employee not found.",
            )

        if (
            not user.email
            or not employee.email
            or employee.email.lower() != user.email.lower()
        ):
            raise HTTPException(
                status_code=403,
                detail="You can only view your own profile.",
            )

        return controller.get_employee_by_id(
            employee_id,
            db,
        )

    raise HTTPException(
        status_code=403,
        detail="You are not authorized to view this employee.",
    )


# --------------------------------------------------
# Admin updates employee details and manager assignment.
# --------------------------------------------------
@router.put(
    "/update_employee/{employee_id}",
    response_model=EmployeeResponse,
)
def update_employee(
    employee_id: int,
    payload: EmployeeUpdate,
    db: Session = Depends(get_db),
    admin=Depends(is_admin),
):
    return controller.update_employee(
        employee_id,
        payload,
        db,
    )
