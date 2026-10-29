
import logging
from fastapi import HTTPException
from sqlalchemy.orm import Session

from src.manager.models import ManagerModel
from src.user.models import UserModel
from src.user.controller import hash_password
from src.manager.dtos import manager_to_dto


logger = logging.getLogger(__name__)


def create_manager(data, db: Session):
    email = str(data.email).lower().strip()
    name = data.name.strip()
    department = (data.department or "").strip() or "General"

    # Check whether this email is already registered.
    existing_user = (
        db.query(UserModel)
        .filter(UserModel.email == email)
        .first()
    )

    if existing_user:
        raise HTTPException(
            status_code=409,
            detail="This email is already registered",
        )

    try:
        # Create the login account.
        user = UserModel(
            name=name,
            email=email,
            password_hash=hash_password(data.password),
            role="manager",
            is_active=True,
        )

        db.add(user)
        db.flush()

        # Create the manager profile linked to the login account.
        manager = ManagerModel(
            user_id=user.id,
            name=name,
            department=department,
        )

        db.add(manager)
        db.commit()

        db.refresh(user)
        db.refresh(manager)

        return manager_to_dto(manager, user)

    except HTTPException:
        db.rollback()
        raise

    except Exception as exc:
        db.rollback()

        # Print the actual error and traceback in the Uvicorn terminal.
        logger.exception("Failed to create manager account")

        raise HTTPException(
            status_code=500,
            detail=(
                "Could not create manager account. "
                "Check the backend terminal for the actual error."
            ),
        ) from exc


def get_all_managers(db: Session):
    managers = (
        db.query(ManagerModel)
        .order_by(ManagerModel.id)
        .all()
    )

    result = []

    for manager in managers:
        user = (
            db.query(UserModel)
            .filter(UserModel.id == manager.user_id)
            .first()
        )

        if user:
            result.append(manager_to_dto(manager, user))

    return result


def get_manager_by_user_id(user_id: int, db: Session):
    manager = (
        db.query(ManagerModel)
        .filter(ManagerModel.user_id == user_id)
        .first()
    )

    if not manager:
        raise HTTPException(
            status_code=404,
            detail="Manager profile not found",
        )

    user = (
        db.query(UserModel)
        .filter(UserModel.id == manager.user_id)
        .first()
    )

    if not user:
        raise HTTPException(
            status_code=404,
            detail="Manager login account not found",
        )

    return manager_to_dto(manager, user)
