from typing import Optional, Union

from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, EmailStr, Field


# Data allowed when updating an employee
class EmployeeUpdate(BaseModel):
    name: Optional[str] = Field(
        default=None,
        min_length=1,
        max_length=120,
    )

    salary: Optional[Decimal] = Field(
        default=None,
        ge=0,
        max_digits=12,
        decimal_places=2,
    )

    department: Optional[str] = Field(
        default=None,
        max_length=100,
    )

    email: Optional[EmailStr] = None
    is_active: Optional[bool] = None


# Employee data returned by the API
class EmployeeResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    salary: Decimal
    department: str
    email: Optional[EmailStr] = None
    is_active: bool = True

    # Accept the datetime value stored in the database
    date_of_joining: Optional[Union[datetime, date]] = None

    is_updated: Optional[datetime] = None