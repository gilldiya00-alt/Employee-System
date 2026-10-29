from src.utlis.db import LocalSession
from src.utlis.settings import settings
from src.user.controller import hash_password
from src.user.models import UserModel


def create_admin():
    db = LocalSession()
    email = settings.admin_email.strip().lower()

    try:
        existing_user = (
            db.query(UserModel)
            .filter(UserModel.email.ilike(email))
            .first()
        )

        if existing_user:
            if existing_user.role != "admin":
                raise RuntimeError(
                    "The configured admin email belongs to a non-admin account."
                )

            print("Configured admin account already exists; no changes made.")
            return

        admin = UserModel(
            name="Admin",
            email=email,
            password_hash=hash_password(settings.admin_password),
            role="admin",
            is_active=True,
        )

        db.add(admin)
        db.commit()
        print("Configured admin account created successfully.")

    except Exception:
        db.rollback()
        raise

    finally:
        db.close()


if __name__ == "__main__":
    create_admin()
