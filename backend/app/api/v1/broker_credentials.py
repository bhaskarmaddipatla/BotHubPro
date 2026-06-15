from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from uuid import UUID
from pydantic import BaseModel
from app.core.database import get_db
from app.api.deps import get_current_active_user
from app.models.user import User
from app.models.api_key import APIKey
import base64

router = APIRouter()


def simple_encrypt(value: str) -> str:
    """Basic encoding - use proper encryption (Fernet) in production."""
    return base64.b64encode(value.encode()).decode()


def simple_decrypt(value: str) -> str:
    return base64.b64decode(value.encode()).decode()


class IBKRCredentials(BaseModel):
    host: str = "127.0.0.1"
    port: int = 7497
    client_id: int = 1
    account: str
    paper_trading: bool = True


class BrokerKeyCreate(BaseModel):
    name: str
    provider: str
    api_key: str
    api_secret: str = ""


class BrokerKeyResponse(BaseModel):
    id: UUID
    name: str
    provider: str
    is_active: bool

    class Config:
        from_attributes = True


@router.get("/", response_model=List[BrokerKeyResponse])
async def list_broker_keys(current_user: User = Depends(get_current_active_user), db: Session = Depends(get_db)):
    return db.query(APIKey).filter(APIKey.user_id == current_user.id, APIKey.is_active == True).all()


@router.post("/ibkr")
async def save_ibkr_credentials(
    creds: IBKRCredentials,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    import json
    existing = db.query(APIKey).filter(
        APIKey.user_id == current_user.id,
        APIKey.provider == "ibkr"
    ).first()

    creds_json = json.dumps(creds.model_dump())
    encrypted = simple_encrypt(creds_json)

    if existing:
        existing.encrypted_key = encrypted
        existing.name = f"IBKR {'Paper' if creds.paper_trading else 'Live'} - {creds.account}"
        db.commit()
        return {"message": "IBKR credentials updated"}

    key = APIKey(
        user_id=current_user.id,
        name=f"IBKR {'Paper' if creds.paper_trading else 'Live'} - {creds.account}",
        provider="ibkr",
        encrypted_key=encrypted,
    )
    db.add(key)
    db.commit()
    return {"message": "IBKR credentials saved"}


@router.get("/ibkr")
async def get_ibkr_credentials(current_user: User = Depends(get_current_active_user), db: Session = Depends(get_db)):
    import json
    key = db.query(APIKey).filter(
        APIKey.user_id == current_user.id,
        APIKey.provider == "ibkr"
    ).first()
    if not key:
        return None
    creds = json.loads(simple_decrypt(key.encrypted_key))
    creds.pop("account", None)
    return creds


@router.post("/test-connection")
async def test_ibkr_connection(current_user: User = Depends(get_current_active_user), db: Session = Depends(get_db)):
    import json
    import socket
    import time
    key = db.query(APIKey).filter(
        APIKey.user_id == current_user.id,
        APIKey.provider == "ibkr"
    ).first()
    if not key:
        raise HTTPException(status_code=404, detail="No IBKR credentials found. Save them in Settings first.")
    creds = json.loads(simple_decrypt(key.encrypted_key))
    host = creds.get("host", "127.0.0.1")
    port = int(creds.get("port", 7497))
    try:
        start = time.monotonic()
        sock = socket.create_connection((host, port), timeout=5)
        latency_ms = (time.monotonic() - start) * 1000
        sock.close()
        return {"reachable": True, "host": host, "port": port, "latency_ms": round(latency_ms, 2), "message": f"Successfully connected to {host}:{port}"}
    except Exception as e:
        return {"reachable": False, "host": host, "port": port, "latency_ms": None, "message": str(e)}


@router.delete("/{key_id}")
async def delete_broker_key(key_id: UUID, current_user: User = Depends(get_current_active_user), db: Session = Depends(get_db)):
    key = db.query(APIKey).filter(APIKey.id == key_id, APIKey.user_id == current_user.id).first()
    if not key:
        raise HTTPException(status_code=404, detail="Not found")
    key.is_active = False
    db.commit()
    return {"message": "Deleted"}
