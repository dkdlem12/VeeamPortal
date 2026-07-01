# Veeam Portal — Windows 실행 가이드 (개발/테스트)

macOS에서 만든 프로젝트를 Windows 11에서 개발/테스트 용도로 실행하는 방법.
운영(상시 서비스) 배포는 [DEPLOY_LINUX.md](DEPLOY_LINUX.md) 참고.

---

## 0. 사전 요구사항

| 구분 | 버전 | winget 설치 명령 |
|------|------|------------------|
| Python | 3.10+ (3.12 권장) | `winget install --id Python.Python.3.12 -e` |
| Node.js | 18+ (LTS 권장) | `winget install --id OpenJS.NodeJS.LTS -e` |

> 설치 후에는 **터미널(PowerShell)을 새로 열어야** PATH가 반영됩니다.
> 확인: `python --version`, `node -v`, `npm -v`

---

## 1. 최초 셋업 (한 번만)

프로젝트 폴더에서 PowerShell 실행:

```powershell
cd C:\Users\LSH\Desktop\Veeam_Portal
.\setup-windows.ps1
```

이 스크립트가 자동으로:
1. `backend\venv` 가상환경 생성
2. 백엔드 의존성 설치 (`backend\requirements.txt`)
3. 프론트엔드 의존성 설치 (`frontend\node_modules`)
4. `backend\.env` 가 없으면 `.env.example` 에서 복사

> **중요:** macOS에서 만든 `backend/venv` 와 `frontend/node_modules` 는
> Windows에서 동작하지 않습니다(플랫폼별 바이너리). 위 셋업으로 새로 만들어야 합니다.

수동으로 하려면:
```powershell
# 백엔드
python -m venv backend\venv
backend\venv\Scripts\python -m pip install -r backend\requirements.txt
# 프론트엔드
cd frontend; npm install; cd ..
```

---

## 2. `.env` 설정

`backend\.env` 를 열어 Veeam 접속 정보를 입력합니다.

```ini
VEEAM_DB_HOST=172.22.4.21        # Veeam 서버 IP
VEEAM_DB_PORT=5432
VEEAM_DB_NAME=VeeamBackup
VEEAM_DB_USER=veeam_readonly
VEEAM_DB_PASSWORD=...
CORS_ORIGINS=http://localhost:5173
```

> DB/REST API 둘 다 접속 불가하면 자동으로 **MockCollector(더미 데이터)** 로 동작합니다.
> 현재 상태는 http://127.0.0.1:8000/api/health 에서 확인 가능
> (`collector`, `db.available`, `api.available`).

> **주소는 IPv4(`127.0.0.1`) 로 통일돼 있습니다.** vite dev 서버는
> `vite.config.ts` 의 `server.host: '127.0.0.1'` 설정으로 IPv4에만 바인딩하며,
> 프론트가 호출하는 API 주소(`frontend/.env` 의 `VITE_API_URL`)도 `127.0.0.1` 입니다.

---

## 3. 실행

### 방법 A — 한 번에 (권장)
```powershell
.\run-all.ps1
```
또는 파일 탐색기에서 **`START.bat` 더블클릭**.
백엔드/프론트엔드가 각각 새 창으로 뜹니다.

### 방법 B — 따로 실행
```powershell
.\run-backend.ps1     # 백엔드만  → http://localhost:8000
.\run-frontend.ps1    # 프론트만  → http://localhost:5173
```

접속:
- **포탈(웹 UI):** http://127.0.0.1:5173
- **API 문서(Swagger):** http://127.0.0.1:8000/api/docs
- **헬스 체크:** http://127.0.0.1:8000/api/health

종료는 각 창에서 **Ctrl+C**.

---

## 4. 자주 겪는 문제

| 증상 | 원인 / 해결 |
|------|------------|
| `python` 실행 시 Microsoft Store 가 뜸 | Store 스텁 활성. Python 정식 설치 후 새 터미널, 또는 `설정 > 앱 > 앱 실행 별칭` 에서 python.exe 끄기 |
| `npm: 명령을 찾을 수 없음` | Node 설치 후 터미널을 **새로** 여세요(PATH 반영) |
| `.ps1` 더블클릭이 안 됨 | 실행 정책 때문. `START.bat` 을 쓰거나 `powershell -ExecutionPolicy Bypass -File run-all.ps1` |
| 데이터가 안 보임 | `backend\.env` 의 DB 정보 확인. `/api/health` 의 `db.available` 가 `false` 면 네트워크(5432 포트)/계정 점검 |
| CORS 에러 | `backend\.env` 의 `CORS_ORIGINS` 에 접속 주소 추가 후 백엔드 재시작 |
| 포트 충돌(8000/5173 사용 중) | 기존 프로세스 종료, 또는 백엔드 `--port`, 프론트 `PORT` 환경변수로 변경 |

---

## 5. 프로덕션 빌드 확인 (선택)

```powershell
cd frontend
npm run build      # tsc 타입체크 + vite 빌드 → frontend\dist
```
정적 산출물은 `frontend\dist` 에 생성됩니다.
