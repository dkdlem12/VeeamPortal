#!/usr/bin/env bash
# Veeam Portal - 백엔드+프론트엔드 동시 실행 (Linux)
# 사용: ./START.sh
cd "$(dirname "${BASH_SOURCE[0]}")"
exec ./run-all.sh
