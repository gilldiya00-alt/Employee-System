from getpass import getpass

from sqlalchemy import func

from src.user.controller import hash_password
from src.user.models import UserModel
from src.utlis.db import LocalSession


def reset_account_password():
    email = input("Account email to reset: ").strip().lower()
    if not email:
        raise ValueError("An account email is required.")

    password = getpass("New password (8-72 characters): ")
    confirmation = getpass("Confirm new password: ")

    if not 8 <= len(password) <= 72:
        raise ValueError("The password must be between 8 and 72 characters.")

    if password != confirmation:
        raise ValueError("The passwords do not match.")

    db = LocalSession()
    try:
        user = (
            db.query(UserModel)
            .filter(func.lower(UserModel.email) == email)
            .first()
        )

        if not user:
            raise RuntimeError(
                "No login account was found for that email. "
                "Check the address or create the account first."
            )

        user.password_hash = hash_password(password)
        db.commit()
        print(f"Password reset successfully for the {user.role} account.")
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    reset_account_password()
