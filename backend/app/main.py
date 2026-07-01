from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.api import dashboard, history, infrastructure, settings as settings_api

app = FastAPI(
    title="Veeam Backup Management Portal API",
    version="1.0.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(dashboard.router, prefix="/api/v1")
app.include_router(history.router, prefix="/api/v1")
app.include_router(infrastructure.router, prefix="/api/v1")
app.include_router(settings_api.router, prefix="/api/v1")


@app.get("/api/health")
def health():
    from app.collectors import get_collector
    from app.collectors.db_collector import DBCollector
    from app.collectors.api_collector import APICollector
    from app.collectors.mock_collector import MockCollector

    collector = get_collector()
    collector_name = type(collector).__name__

    # 각 소스 가용 여부 체크 (캐시된 콜렉터 재사용)
    source_status = {
        "db":         DBCollector().is_available(),
        "api":        APICollector().is_available(),
        "mock_active": isinstance(collector, MockCollector),
    }

    return {
        "status":    "ok",
        "collector": collector_name,
        "db": {
            "type":      settings.VEEAM_DB_TYPE,
            "host":      settings.VEEAM_DB_HOST or "(not configured)",
            "database":  settings.VEEAM_DB_NAME,
            "available": source_status["db"],
        },
        "api": {
            "host":      settings.VEEAM_API_HOST or "(not configured)",
            "available": source_status["api"],
        },
        "note": "MockCollector 사용 중 — .env 파일에 실제 Veeam 연결 정보를 입력하세요"
                if source_status["mock_active"] else None,
    }
