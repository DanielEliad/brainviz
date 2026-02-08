---
name: dev-workflow
description: Development commands and workflows for BrainViz. Use when running tests, starting dev servers, or executing commands in the nix environment.
---

# Development Workflow

## Essential Commands

| Task | Command | Notes |
|------|---------|-------|
| Run tests | `./test.sh` | **Always use this** - never run pytest directly |
| Start dev servers | `./dev.sh` | Runs both backend and frontend |
| Custom commands | `nix-shell --run "cmd"` | For anything not covered above |

## Testing

**Always use `./test.sh`** - it handles the nix environment, venv activation, and runs both backend tests and frontend type checking.

```bash
# Correct
./test.sh

# Wrong - don't do these
nix-shell --run pytest
uv run pytest
pytest
```

The test script:
1. Runs backend pytest tests
2. Builds frontend (TypeScript type check)
3. Reports combined results

## Development Server

```bash
./dev.sh
```

Starts both:
- Backend: FastAPI on port 8000
- Frontend: Vite dev server with HMR

## Nix Environment

This project uses nix for reproducible environments. For commands not covered by scripts:

```bash
nix-shell --run "your-command-here"
```

Do NOT try to activate venvs directly.

## Project Structure Quick Reference

```
backend/
├── app/
│   ├── main.py              # FastAPI endpoints
│   ├── models.py            # Pydantic models
│   ├── rsn_constants.py     # RSN definitions, enums, params
│   ├── abide_processing.py  # Correlation computation
│   └── wavelet_processing.py # Wavelet method
├── tests/                   # pytest tests (self-contained)
└── scripts/                 # Data conversion utilities

frontend/
├── src/
│   ├── App.tsx              # Main component
│   ├── components/ui/       # Reusable UI (shadcn pattern)
│   ├── vis/                 # Visualization logic
│   └── ui/                  # App-specific UI
```

## Common Tasks

### After modifying backend code
```bash
./test.sh  # Verify tests pass
```

### After modifying frontend code
```bash
./test.sh  # Includes TypeScript type check via vite build
```

### Running a one-off Python script
```bash
nix-shell --run "python backend/scripts/your_script.py"
```
