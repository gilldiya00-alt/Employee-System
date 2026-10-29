from sqlalchemy import (
    Boolean,
    Column,
    Date,
    DateTime,
    Integer,
    Numeric,
    String,
    ForeignKey
)

from src.utlis.db import Base


class EmployeeModel(Base):
    __tablename__ = "employee"

    id = Column(
        Integer,
        primary_key=True,
        index=True,
        autoincrement=True
    )

    name = Column(String(120), nullable=False)

    salary = Column(
        Numeric(12, 2),
        nullable=False,
        default=0
    )

    department = Column(
        String(100),
        nullable=False,
        default="General"
    )

    email = Column(
        String(255),
        nullable=True
    )

    password = Column(
        String(255),
        nullable=True
    )

    is_active = Column(
        Boolean,
        nullable=False,
        default=True
    )

    date_of_joining = Column(
        Date,
        nullable=True
    )

    is_updated = Column(
        DateTime,
        nullable=True
    )

    role = Column(
        String(50),
        nullable=False,
        default="employee"
    )

    manager_id = Column(
    Integer,
    ForeignKey("manager.id", ondelete="SET NULL"),
    nullable=True,
    index=True,
)
