from fastapi import APIRouter, Depends, HTTPException, status, Request, BackgroundTasks
import logging

logger = logging.getLogger(__name__)
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


EMAIL_HTML_TEMPLATE = """
<div style="font-family:sans-serif;max-width:480px;margin:auto;background:#0f172a;padding:32px;border-radius:12px">
  <div style="margin-bottom:24px">
    <span style="font-size:22px;font-weight:700;color:#3b82f6">BotHub Pro</span>
  </div>
  <h2 style="color:#f1f5f9;margin-top:0">Welcome, {first_name}!</h2>
  <p style="color:#94a3b8">Click the button below to verify your email address and activate your account.</p>
  <a href="{verify_url}" style="display:inline-block;padding:12px 28px;background:#3b82f6;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;margin:8px 0">
    Verify Email Address
  </a>
  <p style="margin-top:20px;color:#64748b;font-size:13px">Or copy this link:<br><a href="{verify_url}" style="color:#3b82f6">{verify_url}</a></p>
  <p style="color:#475569;font-size:12px;margin-top:24px;border-top:1px solid #1e293b;padding-top:16px">
    This link expires in 24 hours. If you didn't create an account, ignore this email.
  </p>
</div>
"""


def _build_email_content(first_name: str, verify_url: str) -> tuple[str, str]:
    html = EMAIL_HTML_TEMPLATE.format(first_name=first_name, verify_url=verify_url)
    text = f"Welcome to BotHub Pro, {first_name}!\n\nVerify your email: {verify_url}\n\nThis link expires in 24 hours."
    return html, text


def _smtp_from_email() -> str:
    # Gmail (and most SMTP providers) require From to match the authenticated user
    if settings.SMTP_HOST and settings.SMTP_USER and settings.FROM_EMAIL == "noreply@bothubpro.com":
        return settings.SMTP_USER
    return settings.FROM_EMAIL


def _send_via_sendgrid(email: str, subject: str, html: str) -> None:
    import sendgrid
    from sendgrid.helpers.mail import Mail
    message = Mail(
        from_email=settings.FROM_EMAIL,
        to_emails=email,
        subject=subject,
        html_content=html,
    )
    sg = sendgrid.SendGridAPIClient(api_key=settings.SENDGRID_API_KEY)
    response = sg.send(message)
    if response.status_code >= 400:
        raise RuntimeError(f"SendGrid returned {response.status_code}")


def _send_via_smtp(email: str, subject: str, html: str, plain: str) -> None:
    import smtplib
    from email.mime.multipart import MIMEMultipart
    from email.mime.text import MIMEText
    from_addr = _smtp_from_email()
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = from_addr
    msg["To"] = email
    msg.attach(MIMEText(plain, "plain"))
    msg.attach(MIMEText(html, "html"))
    logger.info(f"SMTP connecting to {settings.SMTP_HOST}:{settings.SMTP_PORT} as {settings.SMTP_USER}, from={from_addr}")
    with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=15) as server:
        if settings.SMTP_USE_TLS:
            server.starttls()
        if settings.SMTP_USER and settings.SMTP_PASSWORD:
            server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
        server.sendmail(from_addr, [email], msg.as_string())


def send_verification_email(email: str, first_name: str, token: str) -> None:
    verify_url = f"{settings.FRONTEND_URL}/auth/verify-email?token={token}"
    subject = "Verify your BotHub Pro account"
    html, plain = _build_email_content(first_name, verify_url)

    if settings.SENDGRID_API_KEY:
        try:
            _send_via_sendgrid(email, subject, html)
            logger.info(f"Verification email sent via SendGrid to {email}")
            return
        except Exception as e:
            logger.error(f"SendGrid failed for {email}: {e}")

    if settings.SMTP_HOST:
        try:
            _send_via_smtp(email, subject, html, plain)
            logger.info(f"Verification email sent via SMTP to {email}")
            return
        except Exception as e:
            logger.error(f"SMTP failed for {email}: {e}")

    # No email provider configured — log the link so dev can manually verify
    logger.warning(
        f"[NO EMAIL PROVIDER] Verification link for {email}: {verify_url}"
    )


def _email_provider_configured() -> bool:
    return bool(settings.SENDGRID_API_KEY or settings.SMTP_HOST)


@router.post("/register", status_code=status.HTTP_201_CREATED)
async def register(request_data: RegisterRequest, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.email == request_data.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    has_provider = _email_provider_configured()
    verification_token = generate_secure_token()

    # In dev with no email provider, auto-verify so users aren't stuck
    auto_verified = not has_provider and settings.ENVIRONMENT == "development"

    user = User(
        email=request_data.email,
        first_name=request_data.first_name,
        last_name=request_data.last_name,
        hashed_password=get_password_hash(request_data.password),
        email_verification_token=None if auto_verified else verification_token,
        is_email_verified=auto_verified,
        status=UserStatus.active if auto_verified else UserStatus.pending_verification,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    if auto_verified:
        return {
            "message": "Registration successful. Your account is active (dev mode: email verification skipped).",
            "user_id": str(user.id),
            "email_verified": True,
        }

    background_tasks.add_task(send_verification_email, user.email, user.first_name, verification_token)

    verify_url = f"{settings.FRONTEND_URL}/auth/verify-email?token={verification_token}"
    response: dict = {
        "message": "Registration successful. Please check your email to verify your account.",
        "user_id": str(user.id),
        "email_verified": False,
    }
    # Include link in response when no provider is configured (production misconfiguration)
    if not has_provider:
        response["verification_url"] = verify_url
        response["message"] = (
            "Registration successful. No email provider is configured — "
            "use the verification_url in this response to verify your account."
        )
    return response


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


@router.post("/resend-verification")
async def resend_verification(
    body: dict,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    email = body.get("email", "").strip().lower()
    if not email:
        raise HTTPException(status_code=400, detail="Email is required")
    user = db.query(User).filter(User.email == email).first()
    # Always return 200 to avoid leaking whether an email exists
    if not user or user.is_email_verified:
        return {"message": "If that email is registered and unverified, a new link has been sent."}
    token = generate_secure_token()
    user.email_verification_token = token
    db.commit()
    background_tasks.add_task(send_verification_email, user.email, user.first_name, token)
    return {"message": "Verification email resent. Please check your inbox (and spam folder)."}


@router.post("/admin/verify-user")
async def admin_verify_user(
    body: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    from app.models.user import UserRole
    if current_user.role != UserRole.admin:
        raise HTTPException(status_code=403, detail="Admin only")
    email = body.get("email", "").strip().lower()
    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.is_email_verified = True
    user.email_verification_token = None
    user.status = UserStatus.active
    db.commit()
    return {"message": f"User {email} manually verified and activated."}


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
