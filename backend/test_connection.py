"""Veeam PostgreSQL DB 연결 및 데이터 테스트"""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))
from dotenv import load_dotenv; load_dotenv()
from app.core.config import settings
from sqlalchemy import create_engine, text

print("=" * 60)
print("Veeam DB 연결 테스트 (PostgreSQL)")
print("=" * 60)
print(f"  호스트  : {settings.VEEAM_DB_HOST}:{settings.VEEAM_DB_PORT}")
print(f"  DB 이름 : {settings.VEEAM_DB_NAME}")
print(f"  사용자  : {settings.VEEAM_DB_USER}")
print("-" * 60)

engine = create_engine(settings.db_url, connect_args={"connect_timeout": 5})
BACKUP_TYPES = "0,1,2,12000,12003,28"

def run(label, sql, params=None):
    with engine.connect() as conn:
        return conn.execute(text(sql), params or {}).fetchall()

try:
    run("ping", "SELECT 1")
    print("✓ DB 연결 성공!\n")

    # 1. 전체 세션 건수
    rows = run("cnt", f"""
        SELECT COUNT(*) AS total,
               MIN(creation_time) AS oldest,
               MAX(creation_time) AS newest
        FROM "backup.model.jobsessions"
        WHERE job_type IN ({BACKUP_TYPES})
    """)
    r = rows[0]
    print(f"  백업 세션 전체: {r[0]}건")
    print(f"    최오래된: {r[1]}")
    print(f"    최  신  : {r[2]}")

    # 2. 오늘 현황
    rows = run("today", f"""
        SELECT
            COUNT(*) AS total,
            SUM(CASE WHEN result=0 THEN 1 ELSE 0 END) AS success,
            SUM(CASE WHEN result=3 THEN 1 ELSE 0 END) AS failed,
            SUM(CASE WHEN result=2 THEN 1 ELSE 0 END) AS warning,
            SUM(CASE WHEN state=5  THEN 1 ELSE 0 END) AS running
        FROM "backup.model.jobsessions"
        WHERE job_type IN ({BACKUP_TYPES})
          AND creation_time::date = CURRENT_DATE
    """)
    r = rows[0]
    print(f"\n  오늘 현황 (총 {r[0]}건):")
    print(f"    성공={r[1]}  실패={r[2]}  경고={r[3]}  진행중={r[4]}")

    # 3. 최근 Job 5건
    rows = run("recent", f"""
        SELECT s.job_name, s.job_type, s.result, s.state,
               s.creation_time,
               COALESCE(b.processed_size/1073741824.0,0) AS gb
        FROM "backup.model.jobsessions" s
        LEFT JOIN "backup.model.backupjobsessions" b ON b.id = s.id
        WHERE s.job_type IN ({BACKUP_TYPES})
        ORDER BY s.creation_time DESC LIMIT 5
    """)
    print(f"\n  최근 Job:")
    STATUS = {0:"성공", 2:"경고", 3:"실패", -1:"-"}
    for r in rows:
        st = "진행중" if r[3]==5 else STATUS.get(r[2],"-")
        print(f"    [{st}] {r[0]} ({str(r[4])[:16]}) {round(float(r[5]),1)}GB")

    # 4. 저장소
    rows = run("repo", """
        SELECT name, type, free_space, total_space, used_space, is_unavailable
        FROM reportrepositoriesview
    """)
    print(f"\n  저장소 ({len(rows)}개):")
    for r in rows:
        if (r[4] or 0) > 0:
            pct = round(float(r[4])/float(r[3])*100) if (r[3] or 0) > 0 else 0
            print(f"    {r[0]}: {round(float(r[4])/1073741824,1)}GB 사용 / {round(float(r[3])/1073741824,1)}GB ({pct}%)")
        else:
            print(f"    {r[0]}: 용량 정보 없음 (unavail={r[5]})")

    # 5. 프록시
    rows = run("proxy", """
        SELECT p.name, p.type, p.is_unavailable, p.is_busy
        FROM backupproxies p
    """)
    print(f"\n  프록시 ({len(rows)}개):")
    for r in rows:
        st = "오프라인" if r[2] else ("사용중" if r[3] else "대기중")
        print(f"    [{st}] {r[0]} (type={r[1]})")

    print("\n" + "=" * 60)
    print("✓ 모든 테스트 통과! 백엔드를 재시작하면 실제 데이터가 표시됩니다.")
    print("=" * 60)

except Exception as e:
    print(f"\n✗ 오류: {e}")
    sys.exit(1)
