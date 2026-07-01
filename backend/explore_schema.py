"""세션 테이블 탐색 - 점 포함 테이블명"""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))
from dotenv import load_dotenv; load_dotenv()
from app.core.config import settings
from sqlalchemy import create_engine, text

engine = create_engine(settings.db_url, connect_args={"connect_timeout": 5})

def run(label, sql, params=None):
    print(f"\n=== {label} ===")
    try:
        with engine.connect() as conn:
            rows = conn.execute(text(sql), params or {}).fetchall()
            for r in rows:
                print(" ", r)
            if not rows:
                print("  (결과 없음)")
    except Exception as e:
        print(f"  오류: {e}")

# 세션 관련 테이블 건수 일괄 확인
session_tables = [
    'backup.model.jobsessions',
    'backup.model.backupjobsessions',
    'backup.model.backuptasksessions',
    'bsessioninfo',
]
for tbl in session_tables:
    run(f'"{tbl}" 건수 및 최신', f"""
        SELECT COUNT(*) AS cnt, MAX(creation_time) AS newest
        FROM "{tbl}"
    """)

# backup.model.jobsessions 컬럼
run('"backup.model.jobsessions" 컬럼', """
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'backup.model.jobsessions'
    ORDER BY ordinal_position LIMIT 25
""")

# backup.model.jobsessions 최근 5건
run('"backup.model.jobsessions" 최근 5건', """
    SELECT *
    FROM "backup.model.jobsessions"
    ORDER BY creation_time DESC
    LIMIT 5
""")

# backup.model.backupjobsessions 컬럼
run('"backup.model.backupjobsessions" 컬럼', """
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'backup.model.backupjobsessions'
    ORDER BY ordinal_position LIMIT 25
""")

# backup.model.backupjobsessions 최근 5건
run('"backup.model.backupjobsessions" 최근 5건', """
    SELECT *
    FROM "backup.model.backupjobsessions"
    ORDER BY creation_time DESC
    LIMIT 5
""")

# reportrepositoriesview 실제 데이터 (free_space, total_space, used_space)
run('reportrepositoriesview 용량 데이터', """
    SELECT name, host_name, type,
           free_space, total_space, used_space,
           is_unavailable, is_full
    FROM reportrepositoriesview
""")

# backupproxies + hosts JOIN 샘플 (프록시 상세)
run('프록시 + 호스트 조인', """
    SELECT p.name, p.type, p.is_unavailable, p.disabled,
           h.name AS host_name, h.dns_name, h.ip,
           p.options
    FROM backupproxies p
    LEFT JOIN hosts h ON h.id = p.host_id
    LIMIT 5
""")
