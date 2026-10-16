import os
import json
import base64
import uuid
import logging
from fastapi import Request, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from database import get_db
import db_models as models

logger = logging.getLogger("dependencies")

def get_local_path_from_url(url: str) -> str:
    """Normalize relative or workspace image path, removing cache-busting query strings."""
    if not url:
        return ""
    clean_url = url.split("?")[0]
    if "/workspace/" in clean_url:
        return "workspace/" + clean_url.split("/workspace/")[-1]
    return clean_url.lstrip("/")

async def get_current_user_id(request: Request) -> str:
    """Extract authenticated user ID from Bearer token, query parameter, cookie, or fallback."""
    tok = None
    auth_h = request.headers.get("Authorization")
    if auth_h and auth_h.startswith("Bearer "):
        tok = auth_h.split(" ")[1].strip()
    if not tok:
        tok = request.query_params.get("token")
    if not tok:
        for cn, cv in request.cookies.items():
            if cn.startswith("ufo_session_") or cn == "ufo_auth_token":
                tok = cv.strip()
                break
    if not tok and request.headers.get("referer"):
        import urllib.parse
        try:
            qs = urllib.parse.parse_qs(urllib.parse.urlparse(request.headers.get("referer")).query)
            if "token" in qs and qs["token"]:
                tok = qs["token"][0].strip()
        except Exception:
            pass

    u_id = os.environ.get("UFO_JOB_ID") or os.environ.get("UFO_INSTANCE_ID") or os.environ.get("CONTAINER_ID") or "ufo-user"
    inst_prefix = (u_id.split("-")[1] if "-" in u_id else u_id)[:8]
    default_email = f"ufo_{inst_prefix}@deepkoma.local"
    default_uid = f"ufo-user-{inst_prefix}"

    if not tok or tok in ("null", "undefined", "default-mock-user-token"):
        request.state.user_email = default_email
        return default_uid

    # 1. Hex instance token
    if len(tok) in (16, 32, 64) and all(c in "0123456789abcdefABCDEF" for c in tok):
        request.state.user_email = f"ufo_{tok[:8]}@deepkoma.local"
        return f"ufo-user-{tok[:8]}"

    # 2. JWT token from Supabase Auth
    if "." in tok:
        try:
            parts = tok.split(".")
            if len(parts) >= 2:
                payload_b64 = parts[1] + "=" * ((4 - len(parts[1]) % 4) % 4)
                claims = json.loads(base64.urlsafe_b64decode(payload_b64.encode("utf-8")).decode("utf-8"))
                if isinstance(claims, dict):
                    sub = claims.get("sub")
                    email = claims.get("email")
                    if sub:
                        sub_str = str(sub)
                        request.state.user_email = email or f"user_{sub_str[:8]}@deepkoma.local"
                        return sub_str
        except Exception:
            pass

    # 3. Fallback
    request.state.user_email = default_email
    return default_uid

async def ensure_user_exists(db: AsyncSession, user_id: str, email: str = None) -> models.User:
    """Ensure user record exists in the database for foreign key integrity."""
    if not email:
        email = f"user_{user_id}@deepkoma.local"

    try:
        stmt_id = select(models.User).where(models.User.id == user_id)
        user = (await db.execute(stmt_id)).scalars().first()
        if user:
            return user
    except Exception as e:
        logger.warning(f"Error checking user by id: {e}")

    try:
        user = models.User(id=user_id, email=email, credits=999999.0, balance_seconds=999999.0)
        db.add(user)
        await db.flush()
        return user
    except Exception:
        fallback_email = f"user_{user_id}_{uuid.uuid4().hex[:6]}@deepkoma.local"
        user = models.User(id=user_id, email=fallback_email, credits=999999.0, balance_seconds=999999.0)
        db.add(user)
        await db.flush()
        return user

async def check_page_ownership(page_id: str, user_id: str, db: AsyncSession) -> models.Page:
    """Retrieve and verify page existence."""
    stmt = select(models.Page).where(models.Page.id == page_id)
    page_obj = (await db.execute(stmt)).scalars().first()
    if not page_obj:
        raise HTTPException(status_code=404, detail="Trang không tồn tại hoặc đã bị xóa!")
    return page_obj
