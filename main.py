
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.utlis.db import Base, engine, ensure_employee_manager_column

# Import models so SQLAlchemy can create their tables
from src.user.models import UserModel
from src.manager.models import ManagerModel
from src.employee.models import EmployeeModel
from src.employee.attendance_model import AttendanceModel
from src.employee.leave_model import LeaveModel
from src.salary.models import SalaryModel

# Import routers
from src.user.router import router as user_router
from src.user.account_router import router as account_router
from src.employee.router import router as employee_router
from src.employee.attendance_router import router as attendance_router
from src.employee.leave_router import router as leave_router
from src.manager.router import router as manager_router
from src.salary.router import salary as salary_router


# Create database tables
Base.metadata.create_all(bind=engine)
ensure_employee_manager_column()


# Create FastAPI application
app = FastAPI(title="Employee Management System")


# CORS configuration for the frontend

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:63342",
        "http://127.0.0.1:63342",
        "http://localhost:5500",
        "http://127.0.0.1:5500",
    ],
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
# Root endpoint
@app.get("/")
def read_root():
    return {
        "message": "Employee Management System API is running"
    }


# Register routers
app.include_router(user_router)
app.include_router(account_router)
app.include_router(employee_router)
app.include_router(attendance_router)
app.include_router(leave_router)
app.include_router(manager_router)
app.include_router(salary_router)
