-- ============================================================
-- Veeam Backup Portal - 읽기전용 SQL 계정 생성
-- Veeam 서버의 MSSQL에서 sa 또는 sysadmin 권한으로 실행
-- ============================================================

-- 1. SQL 로그인 계정 생성 (패스워드 변경 필수)
IF NOT EXISTS (SELECT 1 FROM sys.server_principals WHERE name = 'veeam_readonly')
BEGIN
    CREATE LOGIN veeam_readonly
        WITH PASSWORD = 'VeeamPortal@2024!',  -- ← 반드시 변경하세요
             DEFAULT_DATABASE = VeeamBackup,
             CHECK_EXPIRATION = OFF,
             CHECK_POLICY = ON;
    PRINT 'Login [veeam_readonly] created.';
END
GO

-- 2. VeeamBackup DB 내 사용자 생성
USE VeeamBackup;
GO

IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = 'veeam_readonly')
BEGIN
    CREATE USER veeam_readonly FOR LOGIN veeam_readonly;
    PRINT 'User [veeam_readonly] created in VeeamBackup.';
END
GO

-- 3. 읽기전용 권한 부여 (db_datareader = 모든 테이블 SELECT)
ALTER ROLE db_datareader ADD MEMBER veeam_readonly;
GO

-- 4. 필요한 뷰/프로시저 실행 권한 (선택)
GRANT EXECUTE TO veeam_readonly;
GO

-- 5. 연결 테스트
EXECUTE AS USER = 'veeam_readonly';
    SELECT TOP 3 name, creation_time
    FROM dbo.BSessions
    ORDER BY creation_time DESC;
REVERT;
GO

PRINT '================================================';
PRINT '읽기전용 계정 설정 완료!';
PRINT '포탈 .env 파일에 아래 정보를 입력하세요:';
PRINT '  VEEAM_DB_USER=veeam_readonly';
PRINT '  VEEAM_DB_PASSWORD=VeeamPortal@2024!';
PRINT '================================================';
