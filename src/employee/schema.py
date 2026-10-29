from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class EmployeeCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    email: EmailStr
    password: str = Field(min_length=8, max_length=72)

    salary: Decimal = Field(
        ge=0,
        max_digits=12,
        decimal_places=2,
    )

    department: str = Field(default="General", max_length=100)
    manager_id: int | None = Field(default=None, gt=0)


class EmployeeUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    salary: Decimal | None = Field(
        default=None,
        ge=0,
        max_digits=12,
        decimal_places=2,
    )
    department: str | None = Field(default=None, max_length=100)
    email: EmailStr | None = None
    is_active: bool | None = None
    manager_id: int | None = Field(default=None, gt=0)


class EmployeeResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    salary: Decimal
    department: str
    email: EmailStr | None = None
    is_active: bool = True
    date_of_joining: datetime | date | None = None
    is_updated: datetime | None = None
    role: str = "employee"
    manager_id: int | None = None