def employee_to_dto(employee):
    return {
        "id": employee.id,
        "name": employee.name,
        "salary": float(employee.salary or 0),
        "department": employee.department or "General",
        "email": employee.email,
        "is_active": employee.is_active,
        "date_of_joining": (
            employee.date_of_joining.isoformat()
            if employee.date_of_joining
            else None
        ),
        "is_updated": (
            employee.is_updated.isoformat()
            if employee.is_updated
            else None
        ),
        "role": employee.role or "employee",
        "manager_id": employee.manager_id,
    }
