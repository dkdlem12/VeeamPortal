#!/usr/bin/env bash
# Veeam Portal - 백엔드 + 프론트엔드를 함께 실행 (Linux)
# 사용: ./run-all.sh   (Ctrl+C 로 둘 다 종료)
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

pids=()
cleanup() {
    echo
    echo "종료 중..."
    for pid in "${pids[@]}"; do
        kill "$pid" >/dev/null 2>&1 || true
    done
    wait >/dev/null 2>&1 || true
}
trap cleanup INT TERM EXIT

echo "백엔드를 시작합니다..."
"$ROOT/run-backend.sh" &
pids+=($!)

echo "프론트엔드를 시작합니다..."
"$ROOT/run-frontend.sh" &
pids+=($!)

echo
echo "실행되었습니다:"
echo "  - 포탈:    http://127.0.0.1:5173"
echo "  - API:     http://127.0.0.1:8000/api/docs"
echo "Ctrl+C 로 모두 종료합니다."

# 두 프로세스 중 하나라도 끝나면 함께 정리
wait -n
