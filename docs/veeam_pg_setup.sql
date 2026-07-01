-- ============================================================
-- Veeam v12 PostgreSQL 읽기전용 계정 생성
-- Veeam 서버에서 postgres 슈퍼유저로 실행
-- psql -U postgres VeeamBackup < veeam_pg_setup.sql
-- ============================================================

-- 1. 읽기전용 역할 생성
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'veeam_readonly') THEN
        CREATE ROLE veeam_readonly WITH
            LOGIN
            PASSWORD 'VeeamPortal@2024!'   -- ← 반드시 변경
            NOSUPERUSER NOCREATEDB NOCREATEROLE;
        RAISE NOTICE 'Role veeam_readonly created.';
    ELSE
        RAISE NOTICE 'Role veeam_readonly already exists.';
    END IF;
END
$$;

-- 2. VeeamBackup DB 접근 허용
GRANT CONNECT ON DATABASE "VeeamBackup" TO veeam_readonly;

-- 3. public 스키마 테이블 전체 SELECT 권한
GRANT USAGE  ON SCHEMA public TO veeam_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO veeam_readonly;

-- 이후 추가되는 테이블에도 자동 적용
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT ON TABLES TO veeam_readonly;

-- 4. 시퀀스 읽기 (일부 쿼리에 필요)
GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO veeam_readonly;

-- 5. 연결 테스트
SET ROLE veeam_readonly;
SELECT COUNT(*) AS session_count FROM bsessions;
RESET ROLE;

-- ============================================================
-- pg_hba.conf 에 아래 줄 추가 후 pg_reload_conf() 실행
-- (Veeam 서버의 PostgreSQL 외부 접속 허용)
--
-- host  VeeamBackup  veeam_readonly  <포탈서버IP>/32  md5
--
-- pg_hba.conf 위치 확인:
--   SHOW hba_file;
-- 재로드:
--   SELECT pg_reload_conf();
-- ============================================================
