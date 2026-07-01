"""
Mock collector — returns realistic sample data for development/demo.
Activated automatically when DB and API are both unavailable.
"""
from typing import List, Optional
from datetime import date, datetime, timedelta
import random
import uuid

from .base import BaseCollector

JOBS = [
    ("Daily VM Backup - Production", "VMBackup", "veeam-srv01"),
    ("Agent Backup - Web Servers", "AgentBackup", "veeam-srv01"),
    ("NAS Backup - FileShare", "NASBackup", "veeam-srv02"),
    ("Backup Copy Job - DR Site", "BackupCopy", "veeam-srv01"),
    ("Weekly Full Backup", "VMBackup", "veeam-srv02"),
    ("SQL Server Backup", "AgentBackup", "veeam-srv01"),
]

STATUSES = ["Success", "Success", "Success", "Success", "Failed", "Warning"]


def _random_job(offset_hours: int = 0) -> dict:
    name, jtype, server = random.choice(JOBS)
    start = datetime.now() - timedelta(hours=offset_hours + random.randint(0, 2))
    duration = random.randint(300, 7200)
    end = start + timedelta(seconds=duration)
    status = random.choice(STATUSES)
    return {
        "id": str(uuid.uuid4()),
        "name": name,
        "type": jtype,
        "status": status,
        "server": server,
        "startTime": start.isoformat(),
        "endTime": end.isoformat(),
        "duration": duration,
        "dataSize": round(random.uniform(50, 2000), 1),
    }


class MockCollector(BaseCollector):
    def is_available(self) -> bool:
        return True

    def get_dashboard_summary(self) -> dict:
        return {
            "totalJobs": 24, "success": 20, "failed": 2,
            "running": 1, "warning": 1,
            "successRate": 83.3, "dataProtected": 4582.5,
            "lastUpdated": datetime.now().isoformat(),
        }

    def get_recent_jobs(self, limit: int = 10) -> List[dict]:
        return [_random_job(i * 2) for i in range(limit)]

    def get_job_trend(self, days: int = 7) -> List[dict]:
        result = []
        for i in range(days):
            d = (date.today() - timedelta(days=days - 1 - i)).isoformat()
            result.append({"date": d, "success": random.randint(15, 25),
                           "failed": random.randint(0, 3), "warning": random.randint(0, 2)})
        return result

    def get_job_history(self, start_date, end_date, job_type, status,
                        job_name, server, page, page_size) -> dict:
        all_jobs = [_random_job(i) for i in range(100)]
        if job_type:
            all_jobs = [j for j in all_jobs if j["type"] == job_type]
        if status:
            all_jobs = [j for j in all_jobs if j["status"] == status]
        total = len(all_jobs)
        start = (page - 1) * page_size
        return {
            "items": all_jobs[start:start + page_size],
            "total": total, "page": page, "pageSize": page_size,
            "totalPages": max(1, -(-total // page_size)),
        }

    def get_backup_servers(self) -> List[dict]:
        return [
            {"id": "1", "name": "VEEAM-SRV01", "host": "192.168.1.10",
             "status": "Online", "version": "12.1.0.2131", "osType": "Windows Server 2022"},
            {"id": "2", "name": "VEEAM-SRV02", "host": "192.168.1.11",
             "status": "Online", "version": "12.1.0.2131", "osType": "Windows Server 2019"},
        ]

    def get_proxy_servers(self) -> List[dict]:
        return [
            {"id": "1", "name": "PROXY-01", "host": "192.168.1.20",
             "status": "Online", "type": "Vi", "maxTasks": 4, "currentTasks": 2},
            {"id": "2", "name": "PROXY-02", "host": "192.168.1.21",
             "status": "Online", "type": "Vi", "maxTasks": 4, "currentTasks": 0},
            {"id": "3", "name": "PROXY-AGENT-01", "host": "192.168.1.22",
             "status": "Offline", "type": "Agent", "maxTasks": 2, "currentTasks": 0},
        ]

    def get_repositories(self) -> List[dict]:
        return [
            {"id": "1", "name": "Default Backup Repository", "host": "192.168.1.10",
             "path": "D:\\Backups", "type": "WinLocal",
             "capacityGB": 10240, "usedGB": 7680, "freeGB": 2560, "status": "Online"},
            {"id": "2", "name": "NAS Repository", "host": "192.168.1.30",
             "path": "/mnt/backups", "type": "LinuxLocal",
             "capacityGB": 20480, "usedGB": 8192, "freeGB": 12288, "status": "Online"},
            {"id": "3", "name": "DR Site Repository", "host": "192.168.2.10",
             "path": "E:\\DRBackups", "type": "WinLocal",
             "capacityGB": 15360, "usedGB": 14000, "freeGB": 1360, "status": "Online"},
        ]
