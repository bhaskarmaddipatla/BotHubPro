from fastapi import APIRouter, Depends, HTTPException, status, Request, BackgroundTasks
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
import pyotp
import qrcode
import qrcode.image.svg
import io
import base64
from app.core.database import get_db
from app.core.security import (
    verify_password, get_password_hash, create_access_token,
    create_refresh_token, decode_token, generate_secure_token
)
from app.core.config import settings
from app.models.user import User, UserStatus
from app.models.audit_log import AuditLog
from app.schemas.auth import (
    RegisterRequest, LoginRequest, TokenResponse, RefreshTokenRequest,
    MFASetupResponse, MFAVerifyRequest, PasswordResetRequest, PasswordResetConfirm
)
from app.api.deps import get_current_user, get_current_active_user

router = APIRouter()


def create_audit_log(db: Session, user_id, action: str, request: Request = None, details: dict = None):
    log = AuditLog(
        user_id=user_id,
        action=action,
        ip_address=request.client.host if request else None,
        details=details
    )
    db.add(log)
    db.commit()


@router.post("/register", status_code=status.HTTP_201_CREATED)
async def register(request_data: RegisterRequest, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.email == request_data.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    verification_token = generate_secure_token()
    user = User(
        email=request_data.email,
        first_name=request_data.first_name,
        last_name=request_data.last_name,
        hashed_password=get_password_hash(request_data.password),
        email_verification_token=verification_token,
        status=UserStatus.pending_verification
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return {"message": "Registration successful. Please verify your email.", "user_id": str(user.id)}


@router.get("/verify-email/{token}")
async def verify_email(token: str, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email_verification_token == token).first()
    if not user:
        raise HTTPException(status_code=400, detail="Invalid verification token")
    user.is_email_verified = True
    user.email_verification_token = None
    user.status = UserStatus.active
    db.commit()
    return {"message": "Email verified successfully"}


@router.post("/login", response_model=TokenResponse)
async def login(request: Request, request_data: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == request_data.email).first()

    if not user or not verify_password(request_data.password, user.hashed_password):
        if user:
            failed = int(user.failed_login_attempts or 0) + 1
            user.failed_login_attempts = str(failed)
            if failed >= 5:
                user.locked_until = datetime.utcnow() + timedelta(minutes=30)
            db.commit()
        raise HTTPException(status_code=401, detail="Invalid credentials")

    if user.locked_until and user.locked_until > datetime.utcnow():
        raise HTTPException(status_code=423, detail="Account temporarily locked")

    if user.mfa_enabled and user.mfa_verified:
        if not request_data.mfa_code:
            return TokenResponse(requires_mfa=True, access_token="", refresh_token="", user_id=str(user.id))
        totp = pyotp.TOTP(user.mfa_secret)
        if not totp.verify(request_data.mfa_code):
            raise HTTPException(status_code=401, detail="Invalid MFA code")

    user.failed_login_attempts = "0"
    user.locked_until = None
    user.last_login = datetime.utcnow()
    db.commit()

    create_audit_log(db, user.id, "user.login", request)

    access_token = create_access_token({"sub": str(user.id)})
    refresh_token = create_refresh_token({"sub": str(user.id)})
    return TokenResponse(access_token=access_token, refresh_token=refresh_token)


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(request_data: RefreshTokenRequest):
    payload = decode_token(request_data.refresh_token)
    if not payload or payload.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="Invalid refresh token")
    user_id = payload.get("sub")
    access_token = create_access_token({"sub": user_id})
    refresh_token = create_refresh_token({"sub": user_id})
    return TokenResponse(access_token=access_token, refresh_token=refresh_token)


@router.post("/mfa/setup", response_model=MFASetupResponse)
async def setup_mfa(current_user: User = Depends(get_current_active_user), db: Session = Depends(get_db)):
    secret = pyotp.random_base32()
    current_user.mfa_secret = secret
    db.commit()

    totp = pyotp.TOTP(secret)
    provisioning_uri = totp.provisioning_uri(name=current_user.email, issuer_name=settings.MFA_ISSUER)

    qr = qrcode.QRCode(version=1, box_size=10, border=5)
    qr.add_data(provisioning_uri)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    buffer = io.BytesIO()
    img.save(buffer, format="PNG")
    qr_code_b64 = base64.b64encode(buffer.getvalue()).decode()

    return MFASetupResponse(
        secret=secret,
        qr_code_url=f"data:image/png;base64,{qr_code_b64}",
        provisioning_uri=provisioning_uri
    )


@router.post("/mfa/verify")
async def verify_mfa(
    request_data: MFAVerifyRequest,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    if not current_user.mfa_secret:
        raise HTTPException(status_code=400, detail="MFA not set up")

    totp = pyotp.TOTP(current_user.mfa_secret)
    if not totp.verify(request_data.code):
        raise HTTPException(status_code=400, detail="Invalid MFA code")

    current_user.mfa_enabled = True
    current_user.mfa_verified = True
    db.commit()
    return {"message": "MFA enabled successfully"}


@router.post("/logout")
async def logout(current_user: User = Depends(get_current_user)):
    return {"message": "Logged out successfully"}
