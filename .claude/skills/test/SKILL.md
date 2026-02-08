---
name: test
description: Run project tests (backend pytest and/or frontend vitest)
argument-hint: [backend|frontend|all]
allowed-tools: Bash, Read
---

# Run Tests

Run the project test suite using the standard test script.

## Usage

Based on `$ARGUMENTS`:

- `backend` or empty: Run backend tests only
  ```bash
  ./test.sh
  ```

- `frontend`: Run frontend tests only
  ```bash
  ./test.sh frontend
  ```

- `all`: Run both backend and frontend tests
  ```bash
  ./test.sh && ./test.sh frontend
  ```

## Important

- ALWAYS use `./test.sh` - never run pytest or vitest directly
- Backend tests use pytest with fixtures from `backend/tests/conftest.py`
- Frontend tests use vitest for pure functions in `frontend/src/**/*.test.ts`

## After Tests

Report:
1. Total tests run and pass/fail count
2. Any failing test names and brief error summary
3. Suggested fixes if failures are obvious
