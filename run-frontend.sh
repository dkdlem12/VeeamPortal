#!/usr/bin/env bash
# Veeam Portal - 프론트엔드(React/Vite) 개발 서버 실행 (Linux)
# 사용: ./run-frontend.sh
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FE="$ROOT/frontend"
cd "$FE"

# WSL 에서는 Windows 의 npm(/mnt/c/...) 이 PATH 에 먼저 잡혀 cmd.exe 가 실행되는 문제가 있다.
# 순수 Linux npm 을 우선 선택하고, 없으면 node 동봉 corepack 으로 대체한다.
pick_npm() {
    local p
    p="$(command -v npm 2>/dev/null || true)"
    if [ -n "$p" ] && [[ "$p" != /mnt/* ]]; then
        echo "npm"; return 0
    fi
    if command -v corepack >/dev/null 2>&1; then
        export COREPACK_HOME="$FE/.corepack"
        corepack prepare npm@11.6.1 --activate >/dev/null 2>&1 || true
        echo "corepack npm"; return 0
    fi
    return 1
}

if ! NPM="$(pick_npm)"; then
    echo "[!] Linux 용 npm 을 찾을 수 없습니다. Node.js(npm 포함)를 설치하세요." >&2
    exit 1
fi

# node_modules 가 없거나 다른 OS(Windows/macOS) 용으로 설치돼 있으면 재설치한다.
# vite/rolldown/lightningcss 등은 OS별 네이티브 바이너리(<pkg>-<os>-<arch>)를 깔므로
# Linux 바이너리 유무로 플랫폼 일치 여부를 판별한다.
needs_install=0
if [ ! -d "node_modules" ]; then
    needs_install=1
elif find node_modules -maxdepth 2 -type d \( -iname '*win32*' -o -iname '*darwin*' \) 2>/dev/null | grep -q .; then
    needs_install=1   # 다른 OS 용으로 설치됨
elif ! find node_modules -maxdepth 2 -type d -iname '*linux*x64*' 2>/dev/null | grep -q .; then
    needs_install=1   # 현재 플랫폼(Linux) 네이티브 바이너리 없음
fi
if [ "$needs_install" = 1 ]; then
    echo "node_modules 가 없거나 플랫폼이 맞지 않아 의존성을 (재)설치합니다..."
    rm -rf node_modules
    $NPM install --no-fund --no-audit
fi

echo "Veeam Portal 프론트엔드 시작 → http://127.0.0.1:5173  (Ctrl+C 로 종료)"
exec $NPM run dev -- --host 0.0.0.0
