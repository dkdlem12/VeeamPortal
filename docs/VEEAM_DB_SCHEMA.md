# Veeam Backup & Replication v12 PostgreSQL DB 구조 정리

> Veeam B&R v12.3 의 내장 PostgreSQL DB(`VeeamBackup`)를 본 포탈 개발 과정에서 직접 분석하여 정리한 문서.
> 모든 테이블/컬럼/코드값은 실제 운영 DB에서 확인한 내용이다.

---

## 1. 핵심 개념

- Veeam v12 부터 기본 DB가 **Microsoft SQL Server → PostgreSQL** 로 전환됨.
- 다수의 테이블이 `"backup.model.xxx"` 처럼 **점(.)이 포함된 따옴표 식별자**를 사용 → SQL 작성 시 반드시 큰따옴표로 감싸야 함.
- 세션/통계/태스크가 별도 테이블로 분리되어 있고 **`id` / `session_id` 로 JOIN** 한다.
- 용량·옵션 등 일부 정보는 컬럼이 아니라 **XML 문자열(`options`, `net_info`)** 안에 들어 있어 파싱이 필요하다.

---

## 2. 세션/이력 관련 테이블

### 2.1 `"backup.model.jobsessions"` — 세션 이력 (메인)
Job 1회 실행 = 1 row. 대시보드/수행이력의 기본 소스.

| 컬럼 | 설명 |
|------|------|
| `id` | 세션 PK (UUID). 통계/태스크 테이블과 JOIN 키 |
| `job_name` | Job 이름. Agent 잡은 `"JobName - 172.16.21.11"` 형태로 대상 IP 포함 |
| `job_type` | Job 유형 코드 (아래 표 참조) |
| `result` | 결과 코드: `0`=Success, `2`=Warning, `3`=Failed, `-1`=None/미완 |
| `state` | 상태 코드: `5`=Running, `-1`=Completed |
| `creation_time` | 시작 시각 |
| `end_time` | 종료 시각. **`1900-01-01` = 아직 끝나지 않음(미완)** 의미 |

#### job_type 코드
| 코드 | 의미 | 포탈 표시 |
|------|------|-----------|
| 0 | VM Backup | VMBackup |
| 1 | Backup Copy | BackupCopy |
| 2 | Replication | Replication |
| 28 | NAS Backup | NASBackup |
| 12000 | Windows Agent Backup | AgentBackup |
| 12003 | Linux Agent Backup | AgentBackup |
| 4030 | Oracle RMAN Plugin | RMANPlugin |

> 그 외 코드는 인프라 스캔·카탈로그 정리 등 비백업 작업이므로 포탈에서는 제외한다.

#### Agent 잡 중복 주의
Agent 잡(12000/12003)은 **Policy 세션(부모, IP 없음)** 과 **대상서버 세션(IP/호스트명 포함)** 이 각각 생성된다.
구분 기준은 `job_name` 의 `' - '` 포함 여부 — 포함된 세션이 실제 백업 세션이다. 중복 제거 시:
```sql
AND NOT (job_type IN (12000, 12003) AND job_name NOT LIKE '% - %')
```

### 2.2 `"backup.model.backupjobsessions"` — 세션별 백업 통계
`jobsessions.id = backupjobsessions.id` 로 1:1 JOIN.

| 컬럼 | 설명 |
|------|------|
| `processed_size` | 처리한 원본 데이터량 (bytes) → Processed |
| `read_size` | 소스에서 읽은 데이터량 (bytes) → Read |
| `stored_size` | 저장소로 전송/저장된 데이터량 (bytes) → Transferred |
| `is_full` | 풀 백업 여부 |
| `is_active_full` | 액티브 풀 여부 |
| `session_algorithm` | **백업 모드의 가장 정확한 소스** (아래) |

#### session_algorithm → 백업 모드
| 값 | 모드 |
|----|------|
| 0 | Active Full (액티브 풀 — 소스에서 전체 직접 read) |
| 10 | Synthetic Full (합성 풀 — 기존 증분에서 합성) |
| 2 | Forward Incremental (증분) |
| -1 | 알 수 없음(Oracle 아카이브 등) → `is_full`/`is_active_full` 로 fallback |

### 2.3 `"backup.model.backuptasksessions"` — 객체(VM/디스크)별 태스크
세션 1개에 객체별로 N row. `session_id = jobsessions.id` 로 JOIN.

| 컬럼 | 설명 |
|------|------|
| `session_id` | 부모 세션 ID |
| `object_name` | 백업 대상 객체명 (VM명 / Oracle 서버명 등) |
| `status` | `0`=Success, `2`=Warning, `3`=Failed |
| `creation_time` / `end_time` | 태스크 시작/종료 |
| `processed_size` / `read_size` / `stored_size` | 객체별 사이즈 (bytes) |
| `avg_speed` | 평균 처리 속도 (bytes/s) |
| `reason` | 실패/경고 사유 텍스트 |
| `progress` | 진행률 |

> VM Backup(0)·RMAN(4030)은 `job_name` 에 대상명이 없으므로, **대상 서버명을 이 테이블의 `object_name`** 에서 가져온다.

---

## 3. Job 정의 / 인프라 테이블

### 3.1 `bjobs` — Job 정의
`name`, `type`, `latest_result` 등 Job 자체의 설정.

### 3.2 `hosts` — 인프라 호스트
| `type` | 의미 |
|--------|------|
| 3 | **Veeam Backup Server 자기 자신 ("This server")** |
| 1 | vCenter 서버 |
| 6 | ESXi 호스트 |

주요 컬럼: `name`, `dns_name`, `ip`, `is_unavailable`, `physical_host_id`(→ physicalhosts JOIN).
※ type=3 레코드는 `name='This server'`, `dns_name=NULL` 인 경우가 많아 호스트명을 다른 소스에서 보완해야 한다(아래 4번).

### 3.3 `physicalhosts` — 물리 호스트 상세
`hosts.physical_host_id = physicalhosts.id`.

| 컬럼 | 설명 |
|------|------|
| `net_info` | **IP 주소가 담긴 XML.** `<IpAddressInfo IpAddress="...">` 에서 IPv4 추출 |
| `os_type` | OS 버전 코드 (아래 매핑) |
| `os_platform` | `1`=Windows |

#### os_type → OS 버전
| 코드 | OS | | 코드 | OS |
|------|----|----|------|----|
| 4 | Windows Server 2008 | | 12 | Windows Server 2016 |
| 6 | Windows Server 2008 R2 | | 13 | Windows Server 2019 |
| 8 | Windows Server 2012 | | 15 / 24 | Windows Server 2022 |
| 10 | Windows Server 2012 R2 | | 64 | VMware ESXi |

### 3.4 `backupproxies` — 백업 프록시
`MaxTasksCount` 는 컬럼이 아니라 `options` XML 안에 있음 → `<MaxTasksCount>N</MaxTasksCount>` 정규식 파싱.
type: 0=Vi, 1=HyperV, 2=Cloud, 3=Agent, 6=File.

### 3.5 저장소
- `backuprepositories` — 저장소 목록(**용량 정보 없음**).
- `reportrepositoriesview` — 저장소 + 용량 뷰. `free_space`, `total_space` (bytes).
  - `used_space` 는 누적 쓰기량이라 부정확 → **`total - free` 로 직접 계산**.
  - 값이 `-1` 이면 "정보 없음" 처리.
  - `parent_rep_id IS NULL` 로 최상위만 조회(SOBR 멤버 중복 방지).
  - type: 0=WinLocal, 1=LinuxLocal, 2=CIFS, 3=DataDomain, 4=HPStoreOnce, 6=Quantum, 10=ObjectStorage.

---

## 4. 메타데이터 / 부가 정보

### 4.1 `options` — 제품 전역 설정 (key-value)
```sql
SELECT value FROM options WHERE name = 'InstallationVersion';  -- → '12.3'
```
> **제한:** DB에는 마이너 버전(`12.3`)만 있고 풀 빌드번호(`12.3.0.310`)는 저장되지 않는다.

### 4.2 `"audit.records"` — 감사 로그
`username` 필드가 `HOSTNAME\Administrator` 형식 → Veeam 서버 hostname 추출에 활용.
```sql
SELECT SPLIT_PART(username, chr(92), 1) AS hostname  -- chr(92) = 백슬래시
FROM "audit.records"
WHERE username LIKE '%\\%'
ORDER BY time_utc DESC LIMIT 1;
```
> `hosts.type=3` 의 `dns_name` 이 NULL일 때 이 값으로 서버 호스트명을 보완한다.

---

## 5. 단위/변환 규칙

| 항목 | 규칙 |
|------|------|
| 사이즈 (bytes → GB) | `/ 1073741824.0` (1024³) |
| 속도 (bytes/s → MB/s) | `/ 1048576` (1024²) |
| 소요시간 | `EXTRACT(EPOCH FROM (COALESCE(NULLIF(end_time,'1900-01-01'), NOW()) - creation_time))::int` |
| 미완 세션 종료시각 | `end_time = '1900-01-01'` → NULL 처리 |

---

## 6. 자주 쓰는 패턴 요약

- **최근 데이터 기준일 산출** (오늘 데이터가 없어도 동작):
  ```sql
  WITH latest_date AS (
    SELECT MAX(creation_time::date) AS d FROM "backup.model.jobsessions"
    WHERE job_type IN (0,1,2,12000,12003,28,4030)
  )
  ```
- **세션 + 통계 JOIN**: `LEFT JOIN "backup.model.backupjobsessions" b ON b.id = s.id`
- **세션 + 태스크 JOIN**: `... t WHERE t.session_id = s.id`
- **서버명 검색** (Agent는 job_name의 IP, VM/RMAN은 task의 object_name):
  ```sql
  (s.job_name ILIKE :q OR EXISTS (
     SELECT 1 FROM "backup.model.backuptasksessions" t
     WHERE t.session_id = s.id AND t.object_name ILIKE :q))
  ```

---

*작성: 본 포탈(`backend/app/collectors/db_collector.py`) 구현 기준 / Veeam B&R v12.3*
