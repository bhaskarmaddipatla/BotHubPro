"""
Run once to create the default admin user.
Usage: python scripts/seed_admin.py

Default credentials:
  Email:    admin@bothubpro.com
  Password: Admin@1234
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from app.core.database import SessionLocal, engine, Base
from app.models.user import User, UserRole, UserStatus
from app.core.security import get_password_hash

Base.metadata.create_all(bind=engine)

def seed_admin():
    db = SessionLocal()
    try:
        existing = db.query(User).filter(User.email == "admin@bothubpro.com").first()
        if existing:
            print("✓ Admin user already exists: admin@bothubpro.com")
            return

        admin = User(
            email="admin@bothubpro.com",
            first_name="Admin",
            last_name="BotHubPro",
            hashed_password=get_password_hash("Admin@1234"),
            role=UserRole.admin,
            status=UserStatus.active,
            is_email_verified=True,
            mfa_enabled=False,
        )
        db.add(admin)
        db.commit()
        print("✅ Admin user created successfully!")
        print("   Email:    admin@bothubpro.com")
        print("   Password: Admin@1234")
        print("   ⚠️  Please change this password after first login!")
    finally:
        db.close()

if __name__ == "__main__":
    seed_admin()
