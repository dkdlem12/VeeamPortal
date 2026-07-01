from fastapi import APIRouter
from app.collectors import get_collector

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/summary")
def dashboard_summary():
    return get_collector().get_dashboard_summary()


@router.get("/recent-jobs")
def recent_jobs(limit: int = 10):
    return get_collector().get_recent_jobs(limit)


@router.get("/trend")
def job_trend(days: int = 7):
    return get_collector().get_job_trend(days)
