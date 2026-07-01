#!/usr/bin/env bash
# Veeam Portal - Linux 최초 셋업 스크립트
# Python 3.10+ 와 Node.js 20+ 가 설치돼 있어야 합니다.
# 사용: ./setup-linux.sh
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BE="$ROOT/backend"
FE="$ROOT/frontend"

need() {
    if ! command -v "$1" >/dev/null 2>&1; then
        echo "[!] '$1' 을(를) 찾을 수 없습니다. 설치 후 다시 실행하세요." >&2
        echo "    $2" >&2
        exit 1
    fi
}
need python3 "Ubuntu: sudo apt install -y python3 python3-venv python3-pip"
need node    "Ubuntu: curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt install -y nodejs"

echo "== [1/4] 백엔드 가상환경 생성 =="
cd "$BE"
rm -rf venv
if python3 -m venv venv >/dev/null 2>&1 && [ -x venv/bin/pip ]; then
    USE_VENV=1
else
    echo "[!] python venv 생성 불가(python3-venv 미설치 가능). 사용자 영역(--user)에 설치합니다."
    rm -rf venv
    USE_VENV=0
fi

echo "== [2/4] 백엔드 의존성 설치 =="
if [ "$USE_VENV" = 1 ]; then
    venv/bin/pip install --upgrade pip
    venv/bin/pip install -r requirements.txt
else
    python3 -m pip install --upgrade pip --user --break-system-packages 2>/dev/null \
        || python3 -m pip install --upgrade pip --user
    python3 -m pip install -r requirements.txt --user --break-system-packages 2>/dev/null \
        || python3 -m pip install -r requirements.txt --user
fi

echo "== [3/4] 프론트엔드 의존성 설치 =="
cd "$FE"
# WSL 의 Windows npm 회피: 순수 Linux npm 우선, 없으면 corepack
NPM_PATH="$(command -v npm 2>/dev/null || true)"
if [ -n "$NPM_PATH" ] && [[ "$NPM_PATH" != /mnt/* ]]; then
    NPM="npm"
elif command -v corepack >/dev/null 2>&1; then
    export COREPACK_HOME="$FE/.corepack"
    corepack prepare npm@11.6.1 --activate >/dev/null 2>&1 || true
    NPM="corepack npm"
else
    echo "[!] Linux 용 npm 을 찾을 수 없습니다." >&2
    exit 1
fi
rm -rf node_modules package-lock.json
$NPM install --no-fund --no-audit

echo "== [4/4] .env 확인 =="
cd "$BE"
if [ ! -f .env ]; then
    cp .env.example .env
    echo "backend/.env 를 .env.example 에서 생성했습니다. Veeam 접속 정보를 입력하세요."
fi

echo
echo "셋업 완료! 실행: ./run-all.sh"
