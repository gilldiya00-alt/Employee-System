from getpass import getpass

from sqlalchemy import func

from src.user.controller import hash_password
from src.user.models import UserModel
from src.utlis.db import LocalSession
from src.utlis.settings import settings


def reset_admin_password():
    db = LocalSession()

    try:
        admin_email = settings.admin_email.strip().lower()
        admin = (
            db.query(UserModel)
            .filter(func.lower(UserModel.email) == admin_email)
            .first()
        )

        if not admin or admin.role != "admin":
            raise RuntimeError(
                "The configured admin account was not found. "
                "Run create_admin.py first."
            )

        password = getpass("New admin password (8-72 characters): ")
        confirmation = getpass("Confirm new admin password: ")

        if not 8 <= len(password) <= 72:
            raise ValueError("The password must be between 8 and 72 characters.")

        if password != confirmation:
            raise ValueError("The passwords do not match.")

        admin.password_hash = hash_password(password)
        db.commit()
        print("Admin password reset successfully.")
    finally:
        db.close()


if __name__ == "__main__":
    reset_admin_password()
