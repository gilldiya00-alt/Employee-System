from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import sessionmaker, declarative_base

from src.utlis.settings import settings


# Database connection
engine = create_engine(
    settings.DB_CONNECTION,
    pool_pre_ping=True
)

# Base class for all database models
Base = declarative_base()

# Database session factory
LocalSession = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine
)


# Dependency used by FastAPI routes
def get_db():
    db = LocalSession()

    try:
        yield db
    finally:
        db.close()


def ensure_employee_manager_column():
    with engine.begin() as connection:
        columns = {
            column["name"]
            for column in inspect(connection).get_columns("employee")
        }

        if "manager_id" not in columns:
            if connection.dialect.name == "postgresql":
                add_column_if_missing = " IF NOT EXISTS"
            else:
                add_column_if_missing = ""

            connection.execute(
                text(
                    "ALTER TABLE employee"
                    f" ADD COLUMN{add_column_if_missing} manager_id INTEGER"
                    " REFERENCES manager(id) ON DELETE SET NULL"
                )
            )

        connection.execute(
            text(
                "CREATE INDEX IF NOT EXISTS ix_employee_manager_id"
                " ON employee (manager_id)"
            )
        )
