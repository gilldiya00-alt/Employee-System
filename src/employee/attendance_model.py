from sqlalchemy import (
    Column,
    Integer,
    ForeignKey,
    Date,
    DateTime,
    Numeric,
    String,
    UniqueConstraint,
)
from src.utlis.db import Base


class AttendanceModel(Base):
    __tablename__ = "attendance"

    __table_args__ = (
        UniqueConstraint(
            "employee_id",
            "attendance_date",
            name="unique_employee_attendance_per_day",
        ),
    )

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)

    employee_id = Column(
        Integer,
        ForeignKey("employee.id", ondelete="CASCADE"),
        nullable=False,
        index=True,)

    attendance_date = Column(Date, nullable=False, index=True)
    check_in = Column(DateTime, nullable=True)
    check_out = Column(DateTime, nullable=True)
    working_hours = Column(Numeric(6, 2), nullable=False, default=0)
    status = Column(String(20), nullable=False, default="present")