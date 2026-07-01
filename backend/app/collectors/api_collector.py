"""
Veeam Backup & Replication REST API collector (v11+).
Falls back to this when DB is not accessible.
"""
from typing import List, Optional
from datetime import date, datetime, timedelta
import logging
import httpx

from app.core.config import settings
from .base import BaseCollector

log = logging.getLogger(__name__)

BEARER_CACHE: dict = {}


class APICollector(BaseCollector):
    def _get_token(self) -> str:
        if BEARER_CACHE.get("token") and BEARER_CACHE.get("expires_at", datetime.min) > datetime.now():
            return BEARER_CACHE["token"]

        resp = httpx.post(
            f"{settings.VEEAM_API_HOST}/api/oauth2/token",
            data={"grant_type": "password",
                  "username": settings.VEEAM_API_USER,
                  "password": settings.VEEAM_API_PASSWORD},
            verify=settings.VEEAM_API_VERIFY_SSL,
            timeout=10,
        )
        resp.raise_for_status()
        data = resp.json()
        BEARER_CACHE["token"] = data["access_token"]
        BEARER_CACHE["expires_at"] = datetime.now() + timedelta(seconds=data.get("expires_in", 900) - 30)
        return BEARER_CACHE["token"]

    def _get(self, path: str, params: dict = None) -> dict:
        headers = {"Authorization": f"Bearer {self._get_token()}",
                   "x-api-version": "1.1-rev1"}
        resp = httpx.get(
            f"{settings.VEEAM_API_HOST}/api/v1{path}",
            headers=headers,
            params=params,
            verify=settings.VEEAM_API_VERIFY_SSL,
            timeout=30,
        )
        resp.raise_for_status()
        return resp.json()

    def is_available(self) -> bool:
        if not settings.VEEAM_API_HOST or not settings.VEEAM_API_USER:
            return False
        try:
            self._get_token()
            return True
        except Exception as e:
            log.warning(f"API collector unavailable: {e}")
            return False

    def get_dashboard_summary(self) -> dict:
        sessions = self._get("/sessions", {"limit": 500, "typeFilter": "BackupJob"})
        items = sessions.get("data", [])
        today = date.today().isoformat()
        today_items = [i for i in items if (i.get("creationTime") or "")[:10] == today]
        success = sum(1 for i in today_items if i.get("result", {}).get("result") == "Success")
        failed  = sum(1 for i in today_items if i.get("result", {}).get("result") == "Failed")
        warning = sum(1 for i in today_items if i.get("result", {}).get("result") == "Warning")
        running = sum(1 for i in today_items if i.get("state") == "Working")
        total = len(today_items)
        return {
            "totalJobs": total,
            "success": success, "failed": failed,
            "running": running, "warning": warning,
            "successRate": round(success / total * 100, 1) if total else 0,
            "dataProtected": 0.0,
            "lastUpdated": datetime.now().isoformat(),
        }

    def get_recent_jobs(self, limit: int = 10) -> List[dict]:
        data = self._get("/sessions", {"limit": limit, "typeFilter": "BackupJob"})
        return [self._normalize_session(s) for s in data.get("data", [])]

    def get_job_trend(self, days: int = 7) -> List[dict]:
        from collections import defaultdict
        data = self._get("/sessions", {"limit": 1000, "typeFilter": "BackupJob"})
        buckets: dict = defaultdict(lambda: {"success": 0, "failed": 0, "warning": 0})
        cutoff = date.today() - timedelta(days=days - 1)
        for s in data.get("data", []):
            d = (s.get("creationTime") or "")[:10]
            if d and date.fromisoformat(d) >= cutoff:
                r = s.get("result", {}).get("result", "")
                if r == "Success": buckets[d]["success"] += 1
                elif r == "Failed": buckets[d]["failed"] += 1
                elif r == "Warning": buckets[d]["warning"] += 1
        return [{"date": k, **v} for k, v in sorted(buckets.items())]

    def get_job_history(self, start_date, end_date, job_type, status,
                        job_name, server, page, page_size) -> dict:
        params = {"limit": page_size, "offset": (page - 1) * page_size,
                  "typeFilter": "BackupJob"}
        data = self._get("/sessions", params)
        items = [self._normalize_session(s) for s in data.get("data", [])]
        total = data.get("pagination", {}).get("total", len(items))
        return {"items": items, "total": total, "page": page,
                "pageSize": page_size, "totalPages": max(1, -(-total // page_size))}

    def get_backup_servers(self) -> List[dict]:
        data = self._get("/backupInfrastructure/backupServers")
        return [{"id": s.get("id", ""), "name": s.get("name", ""),
                 "host": s.get("name", ""), "status": "Online",
                 "version": s.get("vbrVersion", ""), "osType": "Windows"}
                for s in data.get("data", [])]

    def get_proxy_servers(self) -> List[dict]:
        data = self._get("/backupInfrastructure/proxies")
        return [{"id": p.get("id", ""), "name": p.get("name", ""),
                 "host": p.get("name", ""), "status": "Online",
                 "type": p.get("type", ""), "maxTasks": p.get("maxTaskCount", 0),
                 "currentTasks": 0}
                for p in data.get("data", [])]

    def get_repositories(self) -> List[dict]:
        data = self._get("/backupInfrastructure/repositories")
        return [{"id": r.get("id", ""), "name": r.get("name", ""),
                 "host": r.get("hostName", ""), "path": r.get("path", ""),
                 "type": r.get("type", ""),
                 "capacityGB": (r.get("capacityGB") or 0),
                 "usedGB": (r.get("usedSpaceGB") or 0),
                 "freeGB": (r.get("freeGB") or 0),
                 "status": "Online"}
                for r in data.get("data", [])]

    @staticmethod
    def _normalize_session(s: dict) -> dict:
        result = s.get("result", {})
        return {
            "id": s.get("id", ""),
            "name": s.get("name", ""),
            "type": "VMBackup",
            "status": result.get("result", "None") if result else ("Running" if s.get("state") == "Working" else "None"),
            "server": "",
            "startTime": s.get("creationTime", ""),
            "endTime": s.get("endTime"),
            "duration": None,
            "dataSize": None,
        }
