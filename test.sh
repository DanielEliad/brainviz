#!/usr/bin/env bash
# Run all tests for brainviz project
# Usage: ./test.sh [backend|frontend|all]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

run_backend_tests() {
    echo "=== Running Backend Tests ==="
    nix-shell --run "cd backend && pytest tests/ -v --tb=short"
}

run_frontend_build() {
    echo "=== Building Frontend (TypeScript check) ==="
    nix-shell --run "cd frontend && npm run build"
}

case "${1:-all}" in
    backend)
        run_backend_tests
        ;;
    frontend)
        run_frontend_build
        ;;
    all)
        run_backend_tests
        echo ""
        run_frontend_build
        echo ""
        echo "=== All tests passed ==="
        ;;
    *)
        echo "Usage: $0 [backend|frontend|all]"
        exit 1
        ;;
esac
