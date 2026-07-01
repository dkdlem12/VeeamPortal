# Veeam Portal — 배포 전 확인 체크리스트

다른 Ubuntu 서버로 배포하기 전에 아래 항목을 반드시 확인한다.
상세 절차는 [`DEPLOY_LINUX.md`](./DEPLOY_LINUX.md) 참고.

---

## 1. 네트워크 / 방화벽
- [ ] **배포 서버 → Veeam 서버 TCP 5432**(PostgreSQL) 통신 허용 (백엔드가 DB 직접 조회)
- [ ] (폴백 사용 시) Veeam REST API 포트 **TCP 9419** 허용
- [ ] 포탈 외부 접속용 **TCP 80/443**(또는 지정 포트) 인바운드 오픈
- [ ] 방화벽 설정: `sudo ufw allow 80/tcp && sudo ufw reload`

## 2. 비밀정보 / `.env`  ⚠️ 가장 중요
- [ ] `backend/.env` 는 **Git에 올라가지 않는다**(`.gitignore` 처리됨). 서버에서 **새로 생성**해야 함
      → `cp backend/.env.example backend/.env` 후 값 입력 (또는 `./setup-linux.sh` 가 자동 생성)
- [ ] `VEEAM_DB_HOST / VEEAM_DB_USER / VEEAM_DB_PASSWORD` — 읽기전용 DB 계정 정보 입력
- [ ] `SECRET_KEY` — `openssl rand -hex 32` 로 생성한 랜덤값으로 교체 (기본값 `change-me...` 금지)
- [ ] `CORS_ORIGINS` — 실제 접속 주소 추가 (예: `http://<서버IP>`, `https://<도메인>`)
- [ ] 저장소는 **Private 권장** (DB 스키마 `docs/*.sql`, 설정 포함)

## 3. 사전 패키지 (Ubuntu 22.04 / 24.04)
- [ ] `python3 python3-venv python3-pip` (백엔드 런타임 3.10+)
- [ ] `nodejs` **20 LTS 이상**(22 권장) — Vite 8 요구사항
- [ ] `nginx` (정적 서빙 + `/api` 리버스 프록시)
- [ ] `git curl`

```bash
sudo apt update
sudo apt install -y python3 python3-venv python3-pip nginx git curl
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
```

## 4. 프론트엔드 빌드 설정
- [ ] Nginx 프록시 방식이면 빌드 전 API 주소 주입:
      `echo 'VITE_API_URL=/api/v1' > frontend/.env.production`
- [ ] `npm run build` → `frontend/dist/` 생성 확인

## 5. 실행 방식 결정
- [ ] **운영(권장)**: 백엔드 `systemd` 서비스(uvicorn :8000) + Nginx(정적 `dist` + `/api` 프록시)
- [ ] **테스트용**: `./run-all.sh` (개발 서버 :5173 / :8000) — 상시 운영 부적합

## 6. 배포 후 동작 확인
- [ ] `curl http://localhost:8000/api/health` → `"status":"ok"`, `db.available: true`
- [ ] 브라우저 `http://<서버IP>/` → 대시보드 표시
- [ ] 데이터 미표시 시 `journalctl -u veeam-portal-api -f` 로 DB 연결 로그 확인
- [ ] CORS 에러 시 `.env` 의 `CORS_ORIGINS` 확인 후 서비스 재시작

---

### 업데이트 배포 (이후)
```bash
cd /opt/veeam-portal && git pull
# 백엔드 의존성 변경 시
backend/venv/bin/pip install -r backend/requirements.txt
# 프론트 변경 시
cd frontend && npm install && npm run build
sudo systemctl restart veeam-portal-api
```
