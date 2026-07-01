from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional
import datetime
import os
import re

from app.core.config import settings

router = APIRouter(prefix="/settings", tags=["settings"])


class TestConnectionRequest(BaseModel):
    host: str
    port: int = 5432
    name: str = "VeeamBackup"
    user: str
    password: str


class SaveConnectionRequest(BaseModel):
    host: str
    port: int = 5432
    name: str = "VeeamBackup"
    user: str
    password: Optional[str] = None  # None = keep existing password


# ── 현재 상태 조회 ─────────────────────────────────────────────────────────────

@router.get("/status")
def get_status():
    from app.collectors import get_collector
    from app.collectors.db_collector import DBCollector

    try:
        collector = get_collector()
        collector_name = type(collector).__name__
        db_available = isinstance(collector, DBCollector)
    except Exception:
        collector_name = "None"
        db_available = False

    # 최신 데이터 날짜 조회
    data_date: Optional[str] = None
    if db_available:
        try:
            from sqlalchemy import create_engine, text
            engine = create_engine(settings.db_url, connect_args={"connect_timeout": 5})
            with engine.connect() as conn:
                row = conn.execute(text(
                    "SELECT MAX(creation_time::date) FROM \"backup.model.jobsessions\""
                )).fetchone()
                if row and row[0]:
                    data_date = str(row[0])
            engine.dispose()
        except Exception:
            pass

    return {
        "collector": collector_name,
        "dbAvailable": db_available,
        "db": {
            "host": settings.VEEAM_DB_HOST or "",
            "port": settings.VEEAM_DB_PORT,
            "name": settings.VEEAM_DB_NAME,
            "user": settings.VEEAM_DB_USER,
            "passwordSet": bool(settings.VEEAM_DB_PASSWORD),
        },
        "dataDate": data_date,
        "checkedAt": datetime.datetime.now().isoformat(),
    }


# ── 연결 테스트 ────────────────────────────────────────────────────────────────

@router.post("/test-connection")
def test_connection(req: TestConnectionRequest):
    from urllib.parse import quote_plus
    from sqlalchemy import create_engine, text

    pw = quote_plus(req.password)
    url = (
        f"postgresql+psycopg2://{req.user}:{pw}"
        f"@{req.host}:{req.port}/{req.name}"
    )
    try:
        engine = create_engine(
            url,
            pool_pre_ping=True,
            connect_args={"connect_timeout": 5},
        )
        with engine.connect() as conn:
            row = conn.execute(text(
                "SELECT COUNT(*) FROM \"backup.model.jobsessions\""
            )).fetchone()
            session_count = int(row[0]) if row else 0
        engine.dispose()
        return {
            "success": True,
            "message": f"연결 성공 — 백업 세션 {session_count:,}건 확인",
        }
    except Exception as e:
        msg = str(e)
        # psycopg2 오류는 너무 길어서 핵심만 추출
        if "could not connect" in msg or "Connection refused" in msg:
            msg = f"호스트({req.host}:{req.port})에 연결할 수 없습니다."
        elif "password authentication failed" in msg:
            msg = "사용자 이름 또는 비밀번호가 올바르지 않습니다."
        elif "does not exist" in msg:
            msg = f"데이터베이스 '{req.name}'이(가) 존재하지 않습니다."
        return {"success": False, "message": msg}


# ── 연결 설정 저장 ─────────────────────────────────────────────────────────────

@router.post("/save-connection")
def save_connection(req: SaveConnectionRequest):
    """
    .env 파일의 DB 설정을 업데이트하고 콜렉터를 리셋합니다.
    비밀번호가 None이면 기존 값을 유지합니다.
    """
    env_path = os.path.join(os.path.dirname(__file__), "..", "..", ".env")
    env_path = os.path.abspath(env_path)

    # 현재 .env 읽기
    if os.path.exists(env_path):
        with open(env_path, "r", encoding="utf-8") as f:
            content = f.read()
    else:
        content = ""

    def set_env_var(text: str, key: str, value: str) -> str:
        pattern = rf"^{key}=.*$"
        replacement = f"{key}={value}"
        if re.search(pattern, text, flags=re.MULTILINE):
            return re.sub(pattern, replacement, text, flags=re.MULTILINE)
        return text + f"\n{replacement}"

    content = set_env_var(content, "VEEAM_DB_HOST", req.host)
    content = set_env_var(content, "VEEAM_DB_PORT", str(req.port))
    content = set_env_var(content, "VEEAM_DB_NAME", req.name)
    content = set_env_var(content, "VEEAM_DB_USER", req.user)
    if req.password is not None:
        content = set_env_var(content, "VEEAM_DB_PASSWORD", req.password)

    with open(env_path, "w", encoding="utf-8") as f:
        f.write(content)

    # 인메모리 settings 업데이트
    settings.VEEAM_DB_HOST = req.host
    settings.VEEAM_DB_PORT = req.port
    settings.VEEAM_DB_NAME = req.name
    settings.VEEAM_DB_USER = req.user
    if req.password is not None:
        settings.VEEAM_DB_PASSWORD = req.password

    # 엔진 재생성을 위해 콜렉터 리셋
    from app.collectors import reset_collector
    reset_collector()

    return {"success": True, "message": "설정이 저장되었습니다. 연결을 재초기화합니다."}


# ── 수동 Sync ──────────────────────────────────────────────────────────────────

@router.post("/sync")
def trigger_sync():
    """콜렉터 캐시를 리셋하고 즉시 재연결을 수행합니다."""
    from app.collectors import reset_collector, get_collector
    from app.collectors.db_collector import DBCollector

    reset_collector()

    try:
        collector = get_collector()
        collector_name = type(collector).__name__
        db_available = isinstance(collector, DBCollector)
        return {
            "success": True,
            "collector": collector_name,
            "dbAvailable": db_available,
            "syncedAt": datetime.datetime.now().isoformat(),
            "message": f"Sync 완료 — {collector_name} 사용 중",
        }
    except Exception as e:
        return {
            "success": False,
            "collector": "None",
            "dbAvailable": False,
            "message": str(e),
        }
