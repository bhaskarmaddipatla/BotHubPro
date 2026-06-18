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
    host: str = "host.docker.internal"
    port: int = 7497
    client_id: int = 1
    account: str = ""
    paper_trading: bool = True
    paper_account: str = ""   # stored separately so switching modes restores the right ID
    live_account: str = ""


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
        sock = socket.create_connection((host, port), timeout=7)
        latency_ms = (time.monotonic() - start) * 1000
        sock.close()
        return {"reachable": True, "host": host, "port": port, "latency_ms": round(latency_ms, 2), "message": f"Successfully connected to {host}:{port}"}
    except socket.timeout:
        hint = " — if TWS is on your local PC, use host.docker.internal or your LAN IP instead of 127.0.0.1" if host == "127.0.0.1" else ""
        return {"reachable": False, "host": host, "port": port, "latency_ms": None, "message": f"Timed out connecting to {host}:{port}{hint}"}
    except ConnectionRefusedError:
        return {"reachable": False, "host": host, "port": port, "latency_ms": None, "message": f"Connection refused at {host}:{port} — is TWS/IB Gateway running with API enabled?"}
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


# ── Moomoo ────────────────────────────────────────────────────────────────────

class MoomooCredentials(BaseModel):
    api_key: str
    api_secret: str
    account_id: str = ""
    paper_trading: bool = True


@router.post("/moomoo")
async def save_moomoo_credentials(
    creds: MoomooCredentials,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    import json
    existing = db.query(APIKey).filter(
        APIKey.user_id == current_user.id,
        APIKey.provider == "moomoo",
    ).first()
    encrypted = simple_encrypt(json.dumps(creds.model_dump()))
    if existing:
        existing.encrypted_key = encrypted
        existing.name = f"Moomoo {'Paper' if creds.paper_trading else 'Live'} - {creds.account_id or 'default'}"
        db.commit()
        return {"message": "Moomoo credentials updated"}
    db.add(APIKey(
        user_id=current_user.id,
        name=f"Moomoo {'Paper' if creds.paper_trading else 'Live'} - {creds.account_id or 'default'}",
        provider="moomoo",
        encrypted_key=encrypted,
    ))
    db.commit()
    return {"message": "Moomoo credentials saved"}


@router.get("/moomoo")
async def get_moomoo_credentials(current_user: User = Depends(get_current_active_user), db: Session = Depends(get_db)):
    import json
    key = db.query(APIKey).filter(
        APIKey.user_id == current_user.id,
        APIKey.provider == "moomoo",
        APIKey.is_active == True,
    ).first()
    if not key:
        return None
    creds = json.loads(simple_decrypt(key.encrypted_key))
    creds["api_secret"] = "••••••••"  # mask secret
    return creds


@router.get("/status")
async def broker_setup_status(current_user: User = Depends(get_current_active_user), db: Session = Depends(get_db)):
    """Returns which brokers are configured and whether they appear complete."""
    ibkr = db.query(APIKey).filter(APIKey.user_id == current_user.id, APIKey.provider == "ibkr", APIKey.is_active == True).first()
    moomoo = db.query(APIKey).filter(APIKey.user_id == current_user.id, APIKey.provider == "moomoo", APIKey.is_active == True).first()
    import json
    result = {"ibkr": None, "moomoo": None}
    if ibkr:
        c = json.loads(simple_decrypt(ibkr.encrypted_key))
        result["ibkr"] = {"configured": True, "host": c.get("host"), "port": c.get("port"), "account": c.get("account", ""), "paper_trading": c.get("paper_trading", True)}
    if moomoo:
        c = json.loads(simple_decrypt(moomoo.encrypted_key))
        result["moomoo"] = {"configured": True, "account_id": c.get("account_id", ""), "paper_trading": c.get("paper_trading", True)}
    return result
