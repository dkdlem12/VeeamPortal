from fastapi import APIRouter
from app.collectors import get_collector
from app.core.config import settings

router = APIRouter(prefix="/infrastructure", tags=["infrastructure"])


@router.get("/backup-servers")
def backup_servers():
    return get_collector().get_backup_servers()


@router.get("/proxy-servers")
def proxy_servers():
    return get_collector().get_proxy_servers()


@router.get("/repositories")
def repositories():
    return get_collector().get_repositories()


@router.get("/grafana-token")
def grafana_token():
    return {"url": settings.GRAFANA_URL, "token": settings.GRAFANA_API_KEY}
