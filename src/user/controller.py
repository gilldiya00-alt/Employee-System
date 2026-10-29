from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from jose import jwt
from pwdlib import PasswordHash
from sqlalchemy import func
from sqlalchemy.orm import Session

from src.user.models import UserModel
from src.user.dtos import user_to_dto
from src.utlis.settings import settings


password_hasher = PasswordHash.recommended()

# Demo-only blacklist; it resets when the server restarts.
blacklisted_tokens = set()


def hash_password(password: str) -> str:
    return password_hasher.hash(password)


def verify_password(
    password: str,
    hashed_password: str
) -> bool:
    try:
        return password_hasher.verify(
            password,
            hashed_password
        )
    except Exception:
        return False


def create_access_token(user: UserModel) -> str:
    expire = datetime.now(timezone.utc) + timedelta(
        minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES
    )

    payload = {
        "sub": str(user.id),
        "role": user.role,
        "exp": expire,
    }

    return jwt.encode(
        payload,
        settings.SECRET_KEY,
        algorithm=settings.ALGORITHM,
    )


def login_user(
    email: str,
    password: str,
    db: Session
):
    normalized_email = email.strip().lower()

    user = (
        db.query(UserModel)
        .filter(func.lower(UserModel.email) == normalized_email)
        .first()
    )

    if not user or not verify_password(
        password,
        user.password_hash
    ):
        raise HTTPException(
            status_code=401,
            detail="Incorrect email or password",
        )

    if not user.is_active:
        raise HTTPException(
            status_code=403,
            detail="This account is inactive",
        )

    token = create_access_token(user)

    return {
        "access_token": token,
        "token_type": "bearer",
        "user": user_to_dto(user),
    }
