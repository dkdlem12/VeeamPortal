# Veeam Portal — Linux 서버 이전(배포) 가이드

대상 OS: **Ubuntu 22.04/24.04** 또는 **Rocky Linux 9**
구성: **FastAPI(백엔드) + React/Vite(프론트엔드)** + Veeam PostgreSQL(원격 조회)

---

## 0. 사전 요구사항 (필요 패키지 버전)

| 구분 | 패키지 | 권장 버전 | 비고 |
|------|--------|-----------|------|
| 백엔드 런타임 | Python | **3.10 이상** (3.11/3.12 권장) | 개발은 3.9였으나 최신 LTS 권장 |
| | pip / venv | 최신 | 가상환경 격리용 |
| | gcc / python3-devel | - | `psycopg2-binary` 사용 시 보통 불필요. 소스 빌드 대비 |
| 프론트 빌드 | Node.js | **20 LTS 이상** (22 권장) | Vite 8 요구사항 |
| | npm | Node 동봉 | |
| 웹서버 | Nginx | 최신 | 정적 파일 서빙 + API 리버스 프록시 |
| 프로세스 관리 | systemd | OS 기본 | 백엔드 상시 구동 |
| DB 연결 | (libpq) | - | `psycopg2-binary` 가 자체 포함, 별도 설치 불필요 |

> **네트워크**: 이전 서버 → Veeam 서버 **TCP 5432**(PostgreSQL) 가 열려 있어야 함.
> 포탈 외부 접속용 **TCP 80/443**(또는 임의 포트) 개방 필요.

---

## 1. OS별 기본 패키지 설치

### Ubuntu 22.04 / 24.04
```bash
sudo apt update
sudo apt install -y python3 python3-venv python3-pip nginx git curl

# Node.js 22 LTS (NodeSource)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
```

### Rocky Linux 9
```bash
sudo dnf install -y python3.11 python3.11-pip nginx git curl
# (python3.11 미존재 시: sudo dnf install -y python3 python3-pip)

# Node.js 22 LTS (NodeSource)
curl -fsSL https://rpm.nodesource.com/setup_22.x | sudo bash -
sudo dnf install -y nodejs

# SELinux 환경: Nginx가 백엔드로 프록시하려면 네트워크 연결 허용
sudo setsebool -P httpd_can_network_connect 1
```

버전 확인:
```bash
python3 --version   # 3.10+
node -v             # v20+ / v22
nginx -v
```

---

## 2. 소스 이전

기존 서버에서 **빌드 산출물·가상환경은 제외**하고 압축 전송한다(대상에서 새로 생성).

```bash
# [기존 macOS/서버에서]
cd ~/Desktop/Veeam_Portal
tar czf veeam_portal.tar.gz \
  --exclude='backend/venv' \
  --exclude='frontend/node_modules' \
  --exclude='frontend/dist' \
  --exclude='**/__pycache__' \
  --exclude='.DS_Store' \
  backend frontend docs docker

# [신규 Linux 서버로 전송]
scp veeam_portal.tar.gz user@new-server:/tmp/

# [신규 서버에서]
sudo mkdir -p /opt/veeam-portal
sudo tar xzf /tmp/veeam_portal.tar.gz -C /opt/veeam-portal
sudo chown -R $USER:$USER /opt/veeam-portal
```

---

## 3. 백엔드 설정

```bash
cd /opt/veeam-portal/backend

# 가상환경 생성 + 의존성 설치
python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt    # requirements.txt 가 새로 포함됨

# 환경변수
cp .env.example .env
vi .env      # 아래 값 입력
```

### `.env` 핵심 항목
```ini
VEEAM_DB_HOST=<Veeam 서버 IP>
VEEAM_DB_PORT=5432
VEEAM_DB_NAME=VeeamBackup
VEEAM_DB_USER=<읽기전용 계정>
VEEAM_DB_PASSWORD=<비밀번호>

SECRET_KEY=<openssl rand -hex 32 로 생성>
APP_HOST=0.0.0.0
APP_PORT=8000
# 프론트가 접속할 도메인/IP 추가
CORS_ORIGINS=http://<포탈서버IP>,https://<도메인>
```

### 연결 테스트 & 수동 구동 확인
```bash
python test_connection.py          # DB 연결 확인 (있는 경우)
venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000
# 다른 터미널: curl http://localhost:8000/api/health
```

---

## 4. 백엔드 systemd 서비스 등록

`/etc/systemd/system/veeam-portal-api.service`:
```ini
[Unit]
Description=Veeam Portal Backend (FastAPI)
After=network.target

[Service]
User=www-data
Group=www-data
WorkingDirectory=/opt/veeam-portal/backend
EnvironmentFile=/opt/veeam-portal/backend/.env
ExecStart=/opt/veeam-portal/backend/venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 2
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```
> Rocky의 경우 `User=nginx`, Ubuntu는 `www-data` 가 무난(또는 전용 사용자 생성).
> 권한: `sudo chown -R www-data:www-data /opt/veeam-portal/backend`

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now veeam-portal-api
sudo systemctl status veeam-portal-api
```

---

## 5. 프론트엔드 빌드 (정적 산출물)

Vite는 빌드하면 정적 파일이 나오므로 Node 상주가 필요 없다.

```bash
cd /opt/veeam-portal/frontend

# API 주소를 빌드에 주입 (Nginx 동일 호스트 프록시 시 /api/v1 권장)
echo 'VITE_API_URL=/api/v1' > .env.production

npm install
npm run build          # → frontend/dist 생성
```
> `client.ts` 의 baseURL 은 `VITE_API_URL` 을 따른다. `/api/v1` 로 두면 Nginx가 백엔드로 프록시.

---

## 6. Nginx 리버스 프록시 + 정적 서빙

`/etc/nginx/conf.d/veeam-portal.conf` (Ubuntu는 `/etc/nginx/sites-available/`):
```nginx
server {
    listen 80;
    server_name _;   # 도메인 있으면 입력

    # 프론트엔드 정적 파일 (SPA)
    root /opt/veeam-portal/frontend/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;   # React Router 대응
    }

    # 백엔드 API 프록시
    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```bash
sudo nginx -t            # 문법 검사
sudo systemctl enable --now nginx
sudo systemctl reload nginx
```
> Ubuntu에서 sites-available 방식이면:
> `sudo ln -s /etc/nginx/sites-available/veeam-portal.conf /etc/nginx/sites-enabled/` 후 default 심볼릭 제거.

---

## 7. 방화벽

### Ubuntu (ufw)
```bash
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp     # HTTPS 사용 시
sudo ufw reload
```

### Rocky (firewalld)
```bash
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --reload
```

---

## 8. 동작 확인 체크리스트

```bash
# 백엔드 헬스
curl http://localhost:8000/api/health

# Nginx 경유 프론트
curl -I http://localhost/

# Nginx 경유 API
curl http://localhost/api/health
```
- 브라우저: `http://<서버IP>/` → 대시보드 표시
- 데이터 미표시 시: `journalctl -u veeam-portal-api -f` 로 DB 연결 로그 확인
- CORS 에러 시: `.env` 의 `CORS_ORIGINS` 에 접속 도메인 추가 후 서비스 재시작

---

## 9. (선택) HTTPS — Let's Encrypt
```bash
# Ubuntu
sudo apt install -y certbot python3-certbot-nginx
# Rocky
sudo dnf install -y certbot python3-certbot-nginx

sudo certbot --nginx -d portal.example.com
```

---

## 10. (대안) Docker 배포
`docker/docker-compose.yml` 가 포함되어 있다. Docker 사용 시:
```bash
# Ubuntu
sudo apt install -y docker.io docker-compose-plugin
# Rocky
sudo dnf install -y docker docker-compose-plugin
sudo systemctl enable --now docker

cd /opt/veeam-portal/docker
docker compose up -d --build
```
> compose 파일 내 환경변수/볼륨 경로를 신규 서버에 맞게 조정 필요.

---

## 부록 A. 패키지 요약 (한눈에)

**OS 패키지**
- Ubuntu: `python3 python3-venv python3-pip nodejs nginx git curl`
- Rocky 9: `python3.11 python3.11-pip nodejs nginx git curl` (+ `setsebool -P httpd_can_network_connect 1`)

**Python (backend/requirements.txt)**
- fastapi 0.128.8, uvicorn[standard] 0.39.0, starlette 0.49.3
- SQLAlchemy 2.0.51, psycopg2-binary 2.9.12
- pydantic 2.13.4, pydantic-settings 2.11.0, python-dotenv 1.2.1
- openpyxl 3.1.5 (엑셀 내보내기)

**Node (frontend, npm install 시 자동)**
- React 19, Vite 8, TypeScript 6, Tailwind 3.4
- axios, @tanstack/react-query, recharts, react-router-dom, react-datepicker, i18next, lucide-react

**상시 구동 요소**
- `veeam-portal-api.service` (systemd) → uvicorn :8000
- nginx → 정적(dist) 서빙 + `/api/` 프록시
- 프론트는 빌드 후 정적 파일이므로 Node 상주 불필요
