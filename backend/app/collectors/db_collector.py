"""
Veeam Backup & Replication v12 PostgreSQL DB Collector.

실제 확인된 테이블 구조:
  "backup.model.jobsessions"    - 세션 이력 (job_name, job_type, result, state 포함)
  "backup.model.backupjobsessions" - 백업 통계 (processed_size, total_size 등, id로 JOIN)
  bjobs                         - Job 정의 (name, type, latest_result)
  backuprepositories            - 저장소 목록 (용량 없음)
  reportrepositoriesview        - 저장소 + 용량 (free_space, total_space, used_space bytes)
  backupproxies                 - 프록시 (MaxTasksCount는 options XML 내)
  hosts                         - 인프라 호스트

state 값: 5=Running, -1=Completed
result 값: 0=Success, 2=Warning, 3=Failed, -1=None/Unknown

백업 관련 job_type: 0=VMBackup, 1=BackupCopy, 2=Replication,
                    12000=WinAgentBackup, 12003=LinuxAgentBackup, 28=NASBackup
"""
from typing import List, Optional
from datetime import date, datetime
import logging
import re

from sqlalchemy import create_engine, text

from app.core.config import settings
from .base import BaseCollector

log = logging.getLogger(__name__)

# 백업 관련 job_type만 필터링 (인프라 스캔·카탈로그 정리 등 제외)
BACKUP_JOB_TYPES = (0, 1, 2, 12000, 12003, 28, 4030)
BACKUP_JOB_TYPES_SQL = ",".join(str(t) for t in BACKUP_JOB_TYPES)

# Agent 잡(12000/12003)은 Policy 세션(IP 없음)과 대상서버 세션(IP/호스트명 포함)이 각각 생성됨.
# 중복 방지를 위해 Policy 세션(부모)을 제외하고 실제 대상서버 세션만 조회.
# ' - ' 포함 여부로 구분: 포함된 세션이 실제 백업 세션.
AGENT_DEDUP_FILTER = """
  AND NOT (
    s.job_type IN (12000, 12003)
    AND s.job_name::text NOT LIKE '% - %'
  )
"""

# job_type → 프론트 표시 문자열
JOB_TYPE_LABELS = {
    0:     "VMBackup",
    1:     "BackupCopy",
    2:     "Replication",
    12000: "AgentBackup",
    12003: "AgentBackup",
    28:    "NASBackup",
    4030:  "RMANPlugin",
}

# result 코드 → 상태 문자열
RESULT_LABELS = {0: "Success", 2: "Warning", 3: "Failed"}


class DBCollector(BaseCollector):
    def __init__(self):
        self._engine = None

    def _get_engine(self):
        if self._engine is None:
            self._engine = create_engine(
                settings.db_url,
                pool_pre_ping=True,
                pool_timeout=10,
                connect_args={
                    "connect_timeout": 5,
                    "options": "-c statement_timeout=30000",
                },
            )
        return self._engine

    def is_available(self) -> bool:
        if not settings.VEEAM_DB_HOST or not settings.VEEAM_DB_USER:
            return False
        try:
            with self._get_engine().connect() as conn:
                conn.execute(text("SELECT 1"))
            log.info("DBCollector: PostgreSQL connection OK")
            return True
        except Exception as e:
            log.warning(f"DBCollector unavailable: {e}")
            return False

    def _exec(self, sql: str, params: dict = None) -> List[dict]:
        with self._get_engine().connect() as conn:
            result = conn.execute(text(sql), params or {})
            keys = list(result.keys())
            return [dict(zip(keys, row)) for row in result.fetchall()]

    # ─── Dashboard ────────────────────────────────────────────────────────────

    def get_dashboard_summary(self) -> dict:
        # 가장 최근 세션이 있는 날짜를 기준으로 집계 (오늘 데이터가 없어도 동작)
        rows = self._exec(f"""
            WITH latest_date AS (
                SELECT MAX(creation_time::date) AS d
                FROM "backup.model.jobsessions"
                WHERE job_type IN ({BACKUP_JOB_TYPES_SQL})
            )
            SELECT
                COUNT(*)                                                            AS total_jobs,
                COALESCE(SUM(CASE WHEN s.result = 0 THEN 1 ELSE 0 END), 0)        AS success,
                COALESCE(SUM(CASE WHEN s.result = 3 THEN 1 ELSE 0 END), 0)        AS failed,
                COALESCE(SUM(CASE WHEN s.state  = 5 THEN 1 ELSE 0 END), 0)        AS running,
                COALESCE(SUM(CASE WHEN s.result = 2 THEN 1 ELSE 0 END), 0)        AS warning,
                COALESCE(SUM(b.processed_size) / 1073741824.0, 0)                 AS data_protected_gb,
                (SELECT d FROM latest_date)                                        AS ref_date
            FROM "backup.model.jobsessions" s
            LEFT JOIN "backup.model.backupjobsessions" b ON b.id = s.id
            WHERE s.job_type IN ({BACKUP_JOB_TYPES_SQL})
              AND s.creation_time::date = (SELECT d FROM latest_date)
              {AGENT_DEDUP_FILTER}
        """)
        row = rows[0] if rows else {}
        total   = int(row.get("total_jobs") or 0)
        success = int(row.get("success") or 0)
        ref_date = row.get("ref_date")
        return {
            "totalJobs":     total,
            "success":       success,
            "failed":        int(row.get("failed") or 0),
            "running":       int(row.get("running") or 0),
            "warning":       int(row.get("warning") or 0),
            "successRate":   round(success / total * 100, 1) if total else 0.0,
            "dataProtected": round(float(row.get("data_protected_gb") or 0), 1),
            "lastUpdated":   str(ref_date) if ref_date else datetime.now().isoformat(),
        }

    def get_recent_jobs(self, limit: int = 10) -> List[dict]:
        rows = self._exec(f"""
            SELECT
                s.id::text,
                s.job_name                                                      AS name,
                s.job_type                                                      AS type,
                s.result,
                s.state,
                s.creation_time                                                 AS start_time,
                s.end_time,
                EXTRACT(EPOCH FROM (
                    COALESCE(NULLIF(s.end_time, '1900-01-01'), NOW()) - s.creation_time
                ))::int                                                         AS duration_sec,
                COALESCE(b.processed_size / 1073741824.0, 0)                   AS data_size_gb,
                COALESCE(b.read_size      / 1073741824.0, 0)                   AS read_size_gb,
                COALESCE(b.stored_size    / 1073741824.0, 0)                   AS transfer_size_gb,
                b.is_full,
                b.is_active_full,
                b.session_algorithm,
                CASE WHEN s.job_type IN (0, 4030)
                     THEN (SELECT t.object_name::text
                           FROM "backup.model.backuptasksessions" t
                           WHERE t.session_id = s.id
                           ORDER BY t.creation_time LIMIT 1)
                     ELSE NULL END                                              AS task_object_name
            FROM "backup.model.jobsessions" s
            LEFT JOIN "backup.model.backupjobsessions" b ON b.id = s.id
            WHERE s.job_type IN ({BACKUP_JOB_TYPES_SQL})
              {AGENT_DEDUP_FILTER}
            ORDER BY s.creation_time DESC
            LIMIT :limit
        """, {"limit": limit})
        return [self._normalize(r) for r in rows]

    def get_job_trend(self, days: int = 7) -> List[dict]:
        if days == 1:
            # 1일: 시간별 집계
            rows = self._exec(f"""
                WITH latest_date AS (
                    SELECT MAX(creation_time::date) AS d
                    FROM "backup.model.jobsessions"
                    WHERE job_type IN ({BACKUP_JOB_TYPES_SQL})
                )
                SELECT
                    TO_CHAR(DATE_TRUNC('hour', s.creation_time), 'HH24:00')    AS day,
                    SUM(CASE WHEN s.result = 0 THEN 1 ELSE 0 END)              AS success,
                    SUM(CASE WHEN s.result = 3 THEN 1 ELSE 0 END)              AS failed,
                    SUM(CASE WHEN s.result = 2 THEN 1 ELSE 0 END)              AS warning
                FROM "backup.model.jobsessions" s, latest_date
                WHERE s.job_type IN ({BACKUP_JOB_TYPES_SQL})
                  AND s.creation_time::date = latest_date.d
                  {AGENT_DEDUP_FILTER}
                GROUP BY DATE_TRUNC('hour', s.creation_time)
                ORDER BY DATE_TRUNC('hour', s.creation_time)
            """, {})
        elif days == 30:
            # 1달: 일별 집계
            rows = self._exec(f"""
                WITH latest_date AS (
                    SELECT MAX(creation_time::date) AS d
                    FROM "backup.model.jobsessions"
                    WHERE job_type IN ({BACKUP_JOB_TYPES_SQL})
                )
                SELECT
                    TO_CHAR(s.creation_time::date, 'MM/DD')                     AS day,
                    SUM(CASE WHEN s.result = 0 THEN 1 ELSE 0 END)               AS success,
                    SUM(CASE WHEN s.result = 3 THEN 1 ELSE 0 END)               AS failed,
                    SUM(CASE WHEN s.result = 2 THEN 1 ELSE 0 END)               AS warning
                FROM "backup.model.jobsessions" s, latest_date
                WHERE s.job_type IN ({BACKUP_JOB_TYPES_SQL})
                  AND s.creation_time::date >= (latest_date.d - 29 * INTERVAL '1 day')
                  {AGENT_DEDUP_FILTER}
                GROUP BY s.creation_time::date
                ORDER BY s.creation_time::date
            """, {})
        else:
            # 기본(7일): 일별 집계
            rows = self._exec(f"""
                WITH latest_date AS (
                    SELECT MAX(creation_time::date) AS d
                    FROM "backup.model.jobsessions"
                    WHERE job_type IN ({BACKUP_JOB_TYPES_SQL})
                )
                SELECT
                    s.creation_time::date                                           AS day,
                    SUM(CASE WHEN s.result = 0 THEN 1 ELSE 0 END)                 AS success,
                    SUM(CASE WHEN s.result = 3 THEN 1 ELSE 0 END)                 AS failed,
                    SUM(CASE WHEN s.result = 2 THEN 1 ELSE 0 END)                 AS warning
                FROM "backup.model.jobsessions" s, latest_date
                WHERE s.job_type IN ({BACKUP_JOB_TYPES_SQL})
                  AND s.creation_time::date >= (latest_date.d - (:days - 1) * INTERVAL '1 day')
                  {AGENT_DEDUP_FILTER}
                GROUP BY s.creation_time::date
                ORDER BY day
            """, {"days": days})
        return [
            {
                "date":    str(r["day"]),
                "success": int(r["success"] or 0),
                "failed":  int(r["failed"] or 0),
                "warning": int(r["warning"] or 0),
            }
            for r in rows
        ]

    def get_job_history(
        self,
        start_date: Optional[date],
        end_date: Optional[date],
        job_type: Optional[str],
        status: Optional[str],
        job_name: Optional[str],
        server: Optional[str],
        page: int,
        page_size: int,
    ) -> dict:
        FRONTEND_TYPE_MAP = {
            "VMBackup":    [0],
            "RMANPlugin":  [4030],
            "AgentBackup": [12000, 12003],
            "NASBackup":   [28],
            "BackupCopy":  [1],
            "Replication": [2],
        }

        conditions = [
            f"s.job_type IN ({BACKUP_JOB_TYPES_SQL})",
            # Agent 잡 부모(Policy) 세션 제외 — 대상서버 세션만 표시
            "NOT (s.job_type IN (12000, 12003) AND s.job_name::text NOT LIKE '% - %')",
        ]
        params: dict = {}

        if start_date:
            conditions.append("s.creation_time::date >= :start_date")
            params["start_date"] = str(start_date)
        if end_date:
            conditions.append("s.creation_time::date <= :end_date")
            params["end_date"] = str(end_date)
        if job_type and job_type in FRONTEND_TYPE_MAP:
            type_list = ",".join(str(t) for t in FRONTEND_TYPE_MAP[job_type])
            conditions.append(f"s.job_type IN ({type_list})")
        if status == "Running":
            conditions.append("s.state = 5")
        elif status == "Success":
            conditions.append("s.result = 0")
        elif status == "Warning":
            conditions.append("s.result = 2")
        elif status == "Failed":
            conditions.append("s.result = 3")
        if job_name:
            conditions.append("s.job_name::text ILIKE :job_name")
            params["job_name"] = f"%{job_name}%"
        if server:
            # Agent: IP가 job_name 뒤에 ' - IP' 형식으로 포함
            # VM/RMAN: backuptasksessions.object_name에 VM명/Oracle서버명 포함
            conditions.append("""(
                s.job_name::text ILIKE :server
                OR EXISTS (
                    SELECT 1 FROM "backup.model.backuptasksessions" t
                    WHERE t.session_id = s.id
                      AND t.object_name::text ILIKE :server
                )
            )""")
            params["server"] = f"%{server}%"

        where = " AND ".join(conditions)

        count = self._exec(
            f'SELECT COUNT(*) AS cnt FROM "backup.model.jobsessions" s WHERE {where}',
            params,
        )
        total = int(count[0]["cnt"]) if count else 0

        params["offset"]    = (page - 1) * page_size
        params["page_size"] = page_size

        rows = self._exec(f"""
            SELECT
                s.id::text,
                s.job_name                                                      AS name,
                s.job_type                                                      AS type,
                s.result,
                s.state,
                s.creation_time                                                 AS start_time,
                s.end_time,
                EXTRACT(EPOCH FROM (
                    COALESCE(NULLIF(s.end_time, '1900-01-01'), NOW()) - s.creation_time
                ))::int                                                         AS duration_sec,
                COALESCE(b.processed_size / 1073741824.0, 0)                   AS data_size_gb,
                COALESCE(b.read_size      / 1073741824.0, 0)                   AS read_size_gb,
                COALESCE(b.stored_size    / 1073741824.0, 0)                   AS transfer_size_gb,
                b.is_full,
                b.is_active_full,
                b.session_algorithm,
                CASE WHEN s.job_type IN (0, 4030)
                     THEN (SELECT t.object_name::text
                           FROM "backup.model.backuptasksessions" t
                           WHERE t.session_id = s.id
                           ORDER BY t.creation_time LIMIT 1)
                     ELSE NULL END                                              AS task_object_name
            FROM "backup.model.jobsessions" s
            LEFT JOIN "backup.model.backupjobsessions" b ON b.id = s.id
            WHERE {where}
            ORDER BY s.creation_time DESC
            LIMIT :page_size OFFSET :offset
        """, params)

        return {
            "items":      [self._normalize(r) for r in rows],
            "total":      total,
            "page":       page,
            "pageSize":   page_size,
            "totalPages": max(1, -(-total // page_size)),
        }

    def get_session_detail(self, session_id: str) -> dict:
        TASK_STATUS = {0: "Success", 2: "Warning", 3: "Failed"}

        rows = self._exec("""
            SELECT
                s.id::text,
                s.job_name                                                      AS name,
                s.job_type                                                      AS type,
                s.result,
                s.state,
                s.creation_time                                                 AS start_time,
                s.end_time,
                EXTRACT(EPOCH FROM (
                    COALESCE(NULLIF(s.end_time, '1900-01-01'), NOW()) - s.creation_time
                ))::int                                                         AS duration_sec,
                COALESCE(b.processed_size / 1073741824.0, 0)                   AS data_size_gb,
                COALESCE(b.read_size      / 1073741824.0, 0)                   AS read_size_gb,
                COALESCE(b.stored_size    / 1073741824.0, 0)                   AS transfer_size_gb,
                b.is_full,
                b.is_active_full,
                b.session_algorithm,
                NULL                                                            AS task_object_name
            FROM "backup.model.jobsessions" s
            LEFT JOIN "backup.model.backupjobsessions" b ON b.id = s.id
            WHERE s.id = :sid
        """, {"sid": session_id})

        if not rows:
            return {}

        session = self._normalize(rows[0])

        task_rows = self._exec("""
            SELECT
                t.object_name::text                                             AS object_name,
                t.status,
                t.creation_time                                                 AS start_time,
                t.end_time,
                EXTRACT(EPOCH FROM (
                    COALESCE(NULLIF(t.end_time, '1900-01-01'), NOW()) - t.creation_time
                ))::int                                                         AS duration_sec,
                COALESCE(t.processed_size / 1073741824.0, 0)                   AS processed_gb,
                COALESCE(t.read_size      / 1073741824.0, 0)                   AS read_gb,
                COALESCE(t.stored_size    / 1073741824.0, 0)                   AS transfer_gb,
                COALESCE(t.avg_speed, 0)                                        AS avg_speed,
                COALESCE(t.reason::text, '')                                    AS reason,
                t.progress
            FROM "backup.model.backuptasksessions" t
            WHERE t.session_id = :sid
            ORDER BY t.creation_time
        """, {"sid": session_id})

        tasks = []
        for t in task_rows:
            start = t.get("start_time")
            end   = t.get("end_time")
            tasks.append({
                "objectName":  t.get("object_name") or "",
                "status":      TASK_STATUS.get(t.get("status"), "Unknown"),
                "startTime":   start.isoformat() if isinstance(start, datetime) else str(start or ""),
                "endTime":     end.isoformat() if isinstance(end, datetime) and str(end) != "1900-01-01 00:00:00" else None,
                "duration":    max(0, int(t.get("duration_sec") or 0)) or None,
                "processedGb": round(float(t.get("processed_gb") or 0), 2),
                "readGb":      round(float(t.get("read_gb") or 0), 2),
                "transferGb":  round(float(t.get("transfer_gb") or 0), 2),
                "avgSpeedMbs": round(int(t.get("avg_speed") or 0) / 1048576, 1),
                "reason":      t.get("reason") or "",
                "progress":    int(t.get("progress") or 0),
            })

        session["tasks"] = tasks
        return session

    # ─── Infrastructure ───────────────────────────────────────────────────────

    def get_backup_servers(self) -> List[dict]:
        """hosts.type=3 = This Veeam Backup Server"""
        import xml.etree.ElementTree as ET

        # Veeam os_type → Windows Server 버전 매핑
        OS_TYPE_MAP = {
            0:  "Unknown",
            1:  "Windows XP",
            2:  "Windows Server 2003",
            3:  "Windows Vista",
            4:  "Windows Server 2008",
            5:  "Windows 7",
            6:  "Windows Server 2008 R2",
            7:  "Windows 8",
            8:  "Windows Server 2012",
            9:  "Windows 8.1",
            10: "Windows Server 2012 R2",
            11: "Windows 10",
            12: "Windows Server 2016",
            13: "Windows Server 2019",
            14: "Windows 11",
            15: "Windows Server 2022",
            24: "Windows Server 2022",
            64: "VMware ESXi",
        }

        rows = self._exec("""
            SELECT
                h.id::text,
                h.name::text,
                h.description::text,
                h.dns_name::text,
                h.ip::text,
                h.is_unavailable,
                ph.net_info::text,
                ph.os_type,
                ph.os_platform
            FROM hosts h
            LEFT JOIN physicalhosts ph ON ph.id = h.physical_host_id
            WHERE h.type = 3
        """, {})

        ver_rows = self._exec(
            "SELECT value FROM options WHERE name = 'InstallationVersion' LIMIT 1", {}
        )
        veeam_version = ver_rows[0]["value"] if ver_rows else "Unknown"

        # audit.records username에서 서버 hostname 추출
        hostname_rows = self._exec("""
            SELECT SPLIT_PART(username::text, chr(92), 1) AS hostname
            FROM "audit.records"
            WHERE username LIKE '%\\\\%'
              AND username NOT ILIKE '%mchobs%'
            ORDER BY time_utc DESC
            LIMIT 1
        """, {})
        audit_hostname = hostname_rows[0]["hostname"] if hostname_rows else ""

        result = []
        for r in rows:
            # net_info XML에서 IPv4 주소 추출
            ip_addr = ""
            try:
                xml_root = ET.fromstring(r.get("net_info") or "<root/>")
                for elem in xml_root.iter("IpAddressInfo"):
                    candidate = elem.get("IpAddress", "")
                    if ":" not in candidate:  # IPv6 제외
                        ip_addr = candidate
                        break
            except Exception:
                pass

            hostname = r.get("dns_name") or audit_hostname or ip_addr or ""
            os_type = r.get("os_type") or 0
            os_label = OS_TYPE_MAP.get(os_type, f"Windows Server (type={os_type})")

            result.append({
                "id":           r["id"],
                "name":         hostname or "Veeam Backup Server",
                "host":         ip_addr,
                "status":       "Offline" if r.get("is_unavailable") else "Online",
                "veeamVersion": f"Veeam B&R v{veeam_version}",
                "osType":       os_label,
                "description":  r.get("description") or "",
            })
        return result

    def get_proxy_servers(self) -> List[dict]:
        """MaxTasksCount는 options XML에서 정규식으로 추출"""
        rows = self._exec("""
            SELECT
                p.id::text,
                p.name::text,
                h.name::text                                    AS host_name,
                COALESCE(h.dns_name::text, h.ip::text, '')     AS host_addr,
                p.type,
                p.is_unavailable,
                p.disabled,
                p.is_busy,
                p.options::text                                 AS options_xml
            FROM backupproxies p
            LEFT JOIN hosts h ON h.id = p.host_id
        """)
        result = []
        for r in rows:
            max_tasks = self._parse_xml_int(r.get("options_xml", ""), "MaxTasksCount", 4)
            result.append({
                "id":           r["id"],
                "name":         r["name"],
                "host":         r.get("host_addr") or r.get("host_name") or "",
                "status":       "Offline" if (r.get("is_unavailable") or r.get("disabled")) else "Online",
                "type":         self._proxy_type(r.get("type")),
                "maxTasks":     max_tasks,
                "currentTasks": 1 if r.get("is_busy") else 0,
            })
        return result

    def get_repositories(self) -> List[dict]:
        """
        reportrepositoriesview: free_space, total_space (bytes)
        used_space 는 누적 쓰기량이므로 total - free 로 직접 계산.
        -1 값은 "정보 없음" 처리.
        """
        rows = self._exec("""
            SELECT
                id::text,
                name::text,
                COALESCE(host_name::text, '')                           AS host,
                COALESCE(path::text, '')                                AS path,
                type,
                CASE WHEN total_space > 0 THEN total_space ELSE NULL END AS total_bytes,
                CASE WHEN free_space  > 0 THEN free_space  ELSE NULL END AS free_bytes,
                is_unavailable,
                is_full
            FROM reportrepositoriesview
            WHERE parent_rep_id IS NULL
        """)
        result = []
        for r in rows:
            total = float(r.get("total_bytes") or 0)
            free  = float(r.get("free_bytes")  or 0)
            used  = max(0.0, total - free)
            result.append({
                "id":         r["id"],
                "name":       r["name"],
                "host":       r.get("host") or "",
                "path":       r.get("path") or "",
                "type":       self._repo_type(r.get("type")),
                "capacityGB": round(total / 1073741824, 1),
                "freeGB":     round(free  / 1073741824, 1),
                "usedGB":     round(used  / 1073741824, 1),
                "status":     "Full"    if r.get("is_full") else
                              "Offline" if r.get("is_unavailable") else "Online",
            })
        return result

    # ─── Helpers ──────────────────────────────────────────────────────────────

    def _normalize(self, r: dict) -> dict:
        state  = int(r.get("state") or 0)
        result = int(r.get("result") or 0)
        # state=5 → Running, result: 0=Success, 2=Warning, 3=Failed, -1=Unknown
        if state == 5:
            status = "Running"
        else:
            status = RESULT_LABELS.get(result, "None")

        start = r.get("start_time")
        end   = r.get("end_time")
        # end_time=1900-01-01 은 "아직 끝나지 않음"을 의미
        end_val = None
        if isinstance(end, datetime) and end.year > 1900:
            end_val = end.isoformat()

        # 백업 모드 결정
        # session_algorithm이 가장 정확한 소스:
        #   0  = Active Full (액티브 풀 — 소스에서 전체 데이터를 직접 읽음)
        #   10 = Synthetic Full (합성 풀 — 기존 증분에서 합성)
        #   2  = Forward Incremental (증분)
        #  -1  = 알 수 없음(Oracle 아카이브 등) → is_full/is_active_full 참조
        _sa = r.get("session_algorithm")
        session_algo = int(_sa) if _sa is not None else -1
        is_full        = bool(r.get("is_full"))
        is_active_full = bool(r.get("is_active_full"))

        if session_algo == 0:
            backup_mode = "ActiveFull"
        elif session_algo == 10:
            backup_mode = "SyntheticFull"
        elif session_algo == 2:
            backup_mode = "Incremental"
        else:
            # fallback: is_full 기반
            if is_full and is_active_full:
                backup_mode = "ActiveFull"
            elif is_full:
                backup_mode = "SyntheticFull"
            else:
                backup_mode = "Incremental"

        jtype = int(r.get("type") or 0)
        raw_name = str(r.get("name") or "")

        # 대상 서버/객체 추출
        # - Agent 잡(12000/12003): "JobName - 172.16.21.11" 형식에서 IP 파싱
        # - VM Backup(0) / RMAN Plugin(4030): backuptasksessions.object_name 사용
        # - 그 외: 빈 문자열
        if jtype in (12000, 12003) and " - " in raw_name:
            parts = raw_name.rsplit(" - ", 1)
            job_name = parts[0].strip()
            target_server = parts[1].strip()
        elif jtype in (0, 4030):
            job_name = raw_name
            target_server = str(r.get("task_object_name") or "")
        else:
            job_name = raw_name
            target_server = ""

        return {
            "id":           str(r.get("id", "")),
            "name":         job_name,
            "type":         JOB_TYPE_LABELS.get(jtype, "VMBackup"),
            "status":       status,
            "server":       target_server,
            "startTime":    start.isoformat() if isinstance(start, datetime) else str(start or ""),
            "endTime":      end_val,
            "duration":     max(0, int(r.get("duration_sec") or 0)) or None,
            "dataSize":     round(float(r.get("data_size_gb")      or 0), 2) or None,
            "readSize":     round(float(r.get("read_size_gb")      or 0), 2) or None,
            "transferSize": round(float(r.get("transfer_size_gb")  or 0), 2) or None,
            "backupMode":   backup_mode,
        }

    @staticmethod
    def _parse_xml_int(xml: str, tag: str, default: int = 0) -> int:
        m = re.search(rf"<{tag}>(\d+)</{tag}>", xml)
        return int(m.group(1)) if m else default

    @staticmethod
    def _proxy_type(code) -> str:
        return {0: "Vi", 1: "HyperV", 2: "Cloud", 3: "Agent", 6: "File"}.get(
            int(code or 0), "Vi"
        )

    @staticmethod
    def _repo_type(code) -> str:
        return {
            0: "WinLocal", 1: "LinuxLocal", 2: "CIFS",
            3: "DataDomain", 4: "HPStoreOnce", 6: "Quantum",
            10: "ObjectStorage",
        }.get(int(code or 0), "Unknown")
