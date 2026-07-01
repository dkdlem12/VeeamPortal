#!/usr/bin/env bash
# Veeam Portal - 백엔드(FastAPI) 개발 서버 실행 (Linux)
# 사용: ./run-backend.sh
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BE="$ROOT/backend"
cd "$BE"

# venv 가 있으면 venv 의 python, 없으면 시스템 python3 사용
if [ -x "venv/bin/python" ]; then
    PY="venv/bin/python"
else
    PY="python3"
    if ! "$PY" -c "import uvicorn" >/dev/null 2>&1; then
        echo "[!] 백엔드 의존성이 설치돼 있지 않습니다. 먼저 셋업을 실행하세요:" >&2
        echo "    ./setup-linux.sh" >&2
        exit 1
    fi
fi

echo "Veeam Portal 백엔드 시작 → http://127.0.0.1:8000  (Ctrl+C 로 종료)"
echo "API 문서: http://127.0.0.1:8000/api/docs"
exec "$PY" -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
